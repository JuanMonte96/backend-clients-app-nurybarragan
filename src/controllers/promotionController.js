import { Op } from "sequelize";
import { db } from "../models/db.js";
import { PROMOTION_TYPES, PROMOTION_REDEMPTION_STATUS, normalizeEmail } from "../constants/promotion.js";
import { validateData } from "../helpers/zodValidate.js";
import { promotionCreateSchema, promotionUpdateSchema } from "../validators/validatePromotions.js";
import { serializePromotion } from "../services/promotionService.js";
import { createStripeCoupon } from "../services/stripe.js";

const activePromotionWhere = {
  is_active: true,
  archived_at: null,
};

// La exclusividad de "una sola promocion monetaria activa por paquete" no aplica
// a NON_MONETARY: esas promociones son independientes de cualquier paquete.
const hasOverlap = async ({ promotionId = null, appliesToAllPackages, packageIds, transaction }) => {
  const where = { ...activePromotionWhere, promotion_type: { [Op.ne]: PROMOTION_TYPES.NON_MONETARY } };
  if (promotionId) where.id_promotion = { [Op.ne]: promotionId };

  const activePromotions = await db.Promotion.findAll({ where, transaction });
  for (const promotion of activePromotions) {
    if (appliesToAllPackages || promotion.applies_to_all_packages) return true;

    const existingIds = await db.PromotionPackage.findAll({
      where: { id_promotion: promotion.id_promotion },
      attributes: ["id_package"],
      transaction,
    });
    const existingSet = new Set(existingIds.map((item) => String(item.id_package)));
    if (packageIds.some((id) => existingSet.has(String(id)))) return true;
  }

  return false;
};

const replacePackageLinks = async ({ promotionId, packageIds, transaction }) => {
  await db.PromotionPackage.destroy({ where: { id_promotion: promotionId }, transaction });
  if (packageIds.length > 0) {
    await db.PromotionPackage.bulkCreate(
      packageIds.map((id_package) => ({ id_promotion: promotionId, id_package })),
      { transaction }
    );
  }
};

const validateDiscountAgainstPackages = async ({ promotionType, discountPercentage, discountAmountMinor, appliesToAllPackages, packageIds, transaction }) => {
  if (promotionType === PROMOTION_TYPES.NON_MONETARY) return;

  const packages = await db.Package.findAll({
    where: appliesToAllPackages ? { availabilty: true } : { id_package: { [Op.in]: packageIds } },
    attributes: ["id_package", "price_package"],
    transaction,
  });

  if (packages.length === 0) throw new Error("At least one package is required for a monetary promotion");

  for (const packageData of packages) {
    const priceMinor = Math.round(Number(packageData.price_package) * 100);
    const discountMinor = promotionType === PROMOTION_TYPES.PERCENTAGE_DISCOUNT
      ? Math.round(priceMinor * (Number(discountPercentage) / 100))
      : Number(discountAmountMinor);
    if (discountMinor <= 0 || discountMinor >= priceMinor) {
      throw new Error("Promotion must leave a positive final price for every applicable package");
    }
  }
};

const includePackages = [{
  model: db.Package,
  attributes: ["id_package", "name_package", "price_package", "availabilty"],
  through: { attributes: [] },
}];

export const listAdminPromotions = async (req, res) => {
  try {
    const where = {};
    if (req.query.active === "true") where.is_active = true;
    if (req.query.active === "false") where.is_active = false;
    if (req.query.type) where.promotion_type = req.query.type;

    const promotions = await db.Promotion.findAll({
      where,
      include: includePackages,
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({ status: "success", promotions: promotions.map(serializePromotion) });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Failed to fetch promotions" });
  }
};

export const getPublicPromotions = async (_req, res) => {
  try {
    const now = new Date();
    const promotions = await db.Promotion.findAll({
      where: {
        ...activePromotionWhere,
        [Op.and]: [
          { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
          { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gt]: now } }] },
        ],
      },
      include: includePackages,
      order: [["priority", "DESC"], ["created_at", "ASC"]],
    });

    return res.status(200).json({ status: "success", promotions: promotions.map(serializePromotion) });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Failed to fetch public promotions" });
  }
};

export const createPromotion = async (req, res) => {
  const validation = validateData(req.body, promotionCreateSchema);
  if (!validation.success) return res.status(400).json({ status: "Validation Error", errors: validation.errors });

  const payload = validation.data;
  // Las promociones no monetarias nunca quedan ancladas a paquetes.
  if (payload.promotion_type === PROMOTION_TYPES.NON_MONETARY) {
    payload.applies_to_all_packages = false;
    payload.package_ids = [];
  }

  const transaction = await db.sequelize.transaction();
  try {
    if (payload.promotion_type !== PROMOTION_TYPES.NON_MONETARY && payload.is_active && await hasOverlap({
      appliesToAllPackages: payload.applies_to_all_packages,
      packageIds: payload.package_ids,
      transaction,
    })) {
      await transaction.rollback();
      return res.status(409).json({ status: "Conflict", message: "Another active promotion already applies to these packages" });
    }

    await validateDiscountAgainstPackages({
      promotionType: payload.promotion_type,
      discountPercentage: payload.discount_percentage,
      discountAmountMinor: payload.discount_amount_minor,
      appliesToAllPackages: payload.applies_to_all_packages,
      packageIds: payload.package_ids,
      transaction,
    });

    const promotion = await db.Promotion.create({
      ...payload,
      package_ids: undefined,
      discount_percentage: payload.promotion_type === PROMOTION_TYPES.PERCENTAGE_DISCOUNT ? payload.discount_percentage : null,
      discount_amount_minor: payload.promotion_type === PROMOTION_TYPES.FIXED_AMOUNT_DISCOUNT ? payload.discount_amount_minor : null,
      currency: payload.promotion_type === PROMOTION_TYPES.FIXED_AMOUNT_DISCOUNT ? payload.currency : null,
    }, { transaction });

    if (promotion.promotion_type !== PROMOTION_TYPES.NON_MONETARY) {
      const coupon = await createStripeCoupon({
        promotionId: promotion.id_promotion,
        promotionType: promotion.promotion_type,
        percentage: promotion.discount_percentage,
        amountMinor: promotion.discount_amount_minor,
        currency: promotion.currency,
      });
      await promotion.update({ stripe_coupon_id: coupon.id }, { transaction });
    }

    await replacePackageLinks({ promotionId: promotion.id_promotion, packageIds: payload.package_ids, transaction });
    await transaction.commit();

    const result = await db.Promotion.findByPk(promotion.id_promotion, { include: includePackages });
    return res.status(201).json({ status: "success", promotion: serializePromotion(result) });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ status: "error", message: "Failed to create promotion" });
  }
};

export const updatePromotion = async (req, res) => {
  const validation = validateData(req.body, promotionUpdateSchema);
  if (!validation.success) return res.status(400).json({ status: "Validation Error", errors: validation.errors });

  const { id_promotion } = req.params;
  const payload = validation.data;
  const transaction = await db.sequelize.transaction();
  try {
    const promotion = await db.Promotion.findByPk(id_promotion, { transaction, lock: transaction.LOCK.UPDATE });
    if (!promotion) {
      await transaction.rollback();
      return res.status(404).json({ status: "Not Found", message: "Promotion not found" });
    }

    const nextType = payload.promotion_type ?? promotion.promotion_type;
    const nextActive = payload.is_active ?? promotion.is_active;
    const currentLinks = await db.PromotionPackage.findAll({ where: { id_promotion }, transaction });
    let nextAll = payload.applies_to_all_packages ?? promotion.applies_to_all_packages;
    let nextPackages = payload.package_ids ?? currentLinks.map((item) => item.id_package);

    // Las promociones no monetarias nunca quedan ancladas a paquetes.
    if (nextType === PROMOTION_TYPES.NON_MONETARY) {
      nextAll = false;
      nextPackages = [];
    }

    if (nextType !== PROMOTION_TYPES.NON_MONETARY && nextActive && await hasOverlap({
      promotionId: id_promotion,
      appliesToAllPackages: nextAll,
      packageIds: nextPackages,
      transaction,
    })) {
      await transaction.rollback();
      return res.status(409).json({ status: "Conflict", message: "Another active promotion already applies to these packages" });
    }

    const discountChanged = payload.promotion_type !== undefined
      || payload.discount_percentage !== undefined
      || payload.discount_amount_minor !== undefined
      || payload.currency !== undefined;
    let nextStripeCouponId = promotion.stripe_coupon_id;
    await validateDiscountAgainstPackages({
      promotionType: nextType,
      discountPercentage: payload.discount_percentage ?? promotion.discount_percentage,
      discountAmountMinor: payload.discount_amount_minor ?? promotion.discount_amount_minor,
      appliesToAllPackages: nextAll,
      packageIds: nextPackages,
      transaction,
    });
    if (discountChanged && nextType !== PROMOTION_TYPES.NON_MONETARY) {
      const coupon = await createStripeCoupon({
        promotionId: promotion.id_promotion,
        promotionType: nextType,
        percentage: payload.discount_percentage ?? promotion.discount_percentage,
        amountMinor: payload.discount_amount_minor ?? promotion.discount_amount_minor,
        currency: payload.currency ?? promotion.currency,
      });
      nextStripeCouponId = coupon.id;
    }
    await promotion.update({
      ...payload,
      package_ids: undefined,
      discount_percentage: nextType === PROMOTION_TYPES.PERCENTAGE_DISCOUNT ? (payload.discount_percentage ?? promotion.discount_percentage) : null,
      discount_amount_minor: nextType === PROMOTION_TYPES.FIXED_AMOUNT_DISCOUNT ? (payload.discount_amount_minor ?? promotion.discount_amount_minor) : null,
      currency: nextType === PROMOTION_TYPES.FIXED_AMOUNT_DISCOUNT ? (payload.currency ?? promotion.currency) : null,
      stripe_coupon_id: nextType === PROMOTION_TYPES.NON_MONETARY ? null : nextStripeCouponId,
    }, { transaction });

    if (payload.package_ids || nextType === PROMOTION_TYPES.NON_MONETARY) {
      await replacePackageLinks({ promotionId: id_promotion, packageIds: nextPackages, transaction });
    }
    await transaction.commit();

    const result = await db.Promotion.findByPk(id_promotion, { include: includePackages });
    return res.status(200).json({ status: "success", promotion: serializePromotion(result) });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ status: "error", message: "Failed to update promotion" });
  }
};

export const setPromotionStatus = async (req, res) => {
  try {
    const promotion = await db.Promotion.findByPk(req.params.id_promotion);
    if (!promotion) return res.status(404).json({ status: "Not Found", message: "Promotion not found" });
    const { is_active } = req.body;
    if (typeof is_active !== "boolean") return res.status(400).json({ status: "Bad Request", message: "is_active must be boolean" });

    if (is_active && promotion.promotion_type !== PROMOTION_TYPES.NON_MONETARY) {
      const links = await db.PromotionPackage.findAll({ where: { id_promotion: promotion.id_promotion } });
      if (await hasOverlap({
        promotionId: promotion.id_promotion,
        appliesToAllPackages: promotion.applies_to_all_packages,
        packageIds: links.map((item) => item.id_package),
      })) {
        return res.status(409).json({ status: "Conflict", message: "Another active promotion already applies to these packages" });
      }

      if (!promotion.stripe_coupon_id) {
        const coupon = await createStripeCoupon({
          promotionId: promotion.id_promotion,
          promotionType: promotion.promotion_type,
          percentage: promotion.discount_percentage,
          amountMinor: promotion.discount_amount_minor,
          currency: promotion.currency,
        });
        promotion.stripe_coupon_id = coupon.id;
      }
    }

    await promotion.update({ is_active, archived_at: is_active ? null : promotion.archived_at });
    return res.status(200).json({ status: "success", promotion: serializePromotion(promotion) });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Failed to update promotion status" });
  }
};

export const archivePromotion = async (req, res) => {
  try {
    const promotion = await db.Promotion.findByPk(req.params.id_promotion);
    if (!promotion) return res.status(404).json({ status: "Not Found", message: "Promotion not found" });
    await promotion.update({ is_active: false, archived_at: new Date() });
    return res.status(200).json({ status: "success", message: "Promotion archived successfully" });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Failed to archive promotion" });
  }
};

export const markNonMonetaryBenefitUsed = async (req, res) => {
  try {
    const { id_promotion } = req.params;
    const { id_user, id_package } = req.body;
    if (!id_user || !id_package) return res.status(400).json({ status: "Bad Request", message: "id_user and id_package are required" });

    const promotion = await db.Promotion.findByPk(id_promotion);
    if (!promotion || promotion.promotion_type !== PROMOTION_TYPES.NON_MONETARY) {
      return res.status(404).json({ status: "Not Found", message: "Non-monetary promotion not found" });
    }

    const user = await db.User.findByPk(id_user);
    if (!user) return res.status(404).json({ status: "Not Found", message: "User not found" });

    const packageData = await db.Package.findByPk(id_package);
    if (!packageData) return res.status(404).json({ status: "Not Found", message: "Package not found" });

    const existing = await db.PromotionRedemption.findOne({
      where: {
        id_promotion,
        id_user,
        status: { [Op.in]: [PROMOTION_REDEMPTION_STATUS.PENDING, PROMOTION_REDEMPTION_STATUS.CONFIRMED] },
      },
    });
    if (existing) return res.status(409).json({ status: "Conflict", message: "This benefit has already been used by this user" });

    const order = await db.PurchaseOrder.findOne({
      where: { id_user, id_package, status: "PAID" },
      order: [["created_at", "DESC"]],
    });
    if (!order) return res.status(409).json({ status: "Conflict", message: "A paid package purchase is required to register this benefit" });

    const redemption = await db.PromotionRedemption.create({
      id_promotion,
      id_user,
      id_package,
      id_purchase_order: order.id_purchase_order,
      id_payment: null,
      email: user.email_user,
      normalized_email: normalizeEmail(user.email_user),
      status: PROMOTION_REDEMPTION_STATUS.CONFIRMED,
      promotion_type_snapshot: promotion.promotion_type,
      promotion_name_snapshot: {
        es: promotion.name_spanish,
        en: promotion.name_english,
        fr: promotion.name_french,
      },
      price_before_minor: order.price_before_minor,
      discount_amount_minor: 0,
      price_after_minor: order.price_before_minor,
      currency: order.currency,
      benefit_snapshot: promotion.benefit_snapshot || { benefit_code: promotion.benefit_code },
      redeemed_at: new Date(),
    });

    return res.status(201).json({ status: "success", redemption });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Failed to register non-monetary benefit" });
  }
};
