import { Op } from "sequelize";
import { db } from "../models/db.js";
import {
  moneyToMinor,
  normalizeEmail,
  PROMOTION_REDEMPTION_STATUS,
  PROMOTION_TYPES,
} from "../constants/promotion.js";

export const activePromotionWhere = {
  is_active: true,
  archived_at: null,
};

const activeDateWhere = (now = new Date()) => ({
  [Op.and]: [
    { is_active: true },
    { archived_at: null },
    { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
    { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gt]: now } }] },
  ],
});

const isMonetary = (promotion) => [
  PROMOTION_TYPES.PERCENTAGE_DISCOUNT,
  PROMOTION_TYPES.FIXED_AMOUNT_DISCOUNT,
].includes(promotion?.promotion_type);

const snapshotNames = (promotion) => ({
  es: promotion.name_spanish,
  en: promotion.name_english,
  fr: promotion.name_french,
});

const snapshotBenefit = (promotion) => promotion.benefit_snapshot || {
  benefit_code: promotion.benefit_code || null,
  description: {
    es: promotion.description_spanish,
    en: promotion.description_english,
    fr: promotion.description_french,
  },
};

export const serializePromotion = (promotion) => {
  const plain = promotion.toJSON ? promotion.toJSON() : promotion;
  return {
    ...plain,
    discount_percentage: plain.discount_percentage === null || plain.discount_percentage === undefined
      ? null
      : Number(plain.discount_percentage),
    discount_amount_minor: plain.discount_amount_minor === null || plain.discount_amount_minor === undefined
      ? null
      : Number(plain.discount_amount_minor),
    packages: plain.Packages || undefined,
  };
};

export const calculatePromotionPrice = ({ packagePrice, promotion, currency = "eur" }) => {
  const priceBeforeMinor = moneyToMinor(packagePrice);
  let discountAmountMinor = 0;

  if (!promotion || !isMonetary(promotion)) {
    return {
      priceBeforeMinor,
      discountAmountMinor: 0,
      priceAfterMinor: priceBeforeMinor,
      currency,
    };
  }

  if (promotion.promotion_type === PROMOTION_TYPES.PERCENTAGE_DISCOUNT) {
    discountAmountMinor = Math.round(
      priceBeforeMinor * (Number(promotion.discount_percentage) / 100)
    );
  } else {
    discountAmountMinor = Number(promotion.discount_amount_minor || 0);
  }

  const priceAfterMinor = priceBeforeMinor - discountAmountMinor;

  if (discountAmountMinor <= 0 || priceAfterMinor <= 0 || priceAfterMinor >= priceBeforeMinor) {
    throw new Error("Promotion must produce a positive lower price");
  }

  return { priceBeforeMinor, discountAmountMinor, priceAfterMinor, currency };
};

const hasPackagePurchase = async ({ userId, packageId, transaction }) => {
  if (!userId) return false;
  const payment = await db.Payment.findOne({
    where: { id_user: userId, id_package: packageId },
    transaction,
    lock: transaction ? transaction.LOCK.SHARE : undefined,
  });
  return Boolean(payment);
};

const hasActiveRedemption = async ({ promotionId, userId, normalizedEmail, transaction }) => {
  const where = {
    id_promotion: promotionId,
    status: {
      [Op.in]: [PROMOTION_REDEMPTION_STATUS.PENDING, PROMOTION_REDEMPTION_STATUS.CONFIRMED],
    },
  };

  if (userId) {
    where.id_user = userId;
  } else {
    where.normalized_email = normalizedEmail;
  }

  return db.PromotionRedemption.findOne({ where, transaction, lock: transaction ? transaction.LOCK.SHARE : undefined });
};

const isPromotionForPackage = async ({ promotion, packageId, transaction }) => {
  if (promotion.applies_to_all_packages) return true;
  const relation = await db.PromotionPackage.findOne({
    where: { id_promotion: promotion.id_promotion, id_package: packageId },
    transaction,
  });
  return Boolean(relation);
};

export const findApplicablePromotions = async ({ packageId, userId = null, email, transaction }) => {
  const normalizedEmail = normalizeEmail(email);
  const userHasPackagePurchase = await hasPackagePurchase({ userId, packageId, transaction });

  const candidates = await db.Promotion.findAll({
    where: activeDateWhere(),
    order: [["priority", "DESC"], ["created_at", "ASC"]],
    transaction,
  });

  const applicable = [];
  for (const promotion of candidates) {
    if (!(await isPromotionForPackage({ promotion, packageId, transaction }))) continue;
    if (promotion.first_purchase_only && userHasPackagePurchase) continue;
    if (await hasActiveRedemption({ promotionId: promotion.id_promotion, userId, normalizedEmail, transaction })) continue;
    applicable.push(promotion);
  }

  return applicable;
};

export const findApplicablePromotion = async (params) => {
  const promotions = await findApplicablePromotions(params);
  const monetary = promotions.filter(isMonetary);
  const nonMonetary = promotions.filter((promotion) => promotion.promotion_type === PROMOTION_TYPES.NON_MONETARY);

  if (monetary.length > 1) {
    throw new Error("More than one monetary promotion is applicable");
  }

  return {
    monetaryPromotion: monetary[0] || null,
    nonMonetaryPromotions: nonMonetary,
    promotion: monetary[0] || nonMonetary[0] || null,
  };
};

export const buildPromotionQuote = async ({ packageData, userId = null, email, transaction }) => {
  const result = await findApplicablePromotion({
    packageId: packageData.id_package,
    userId,
    email,
    transaction,
  });

  const price = calculatePromotionPrice({
    packagePrice: packageData.price_package,
    promotion: result.monetaryPromotion,
  });

  return {
    promotion: result.monetaryPromotion ? serializePromotion(result.monetaryPromotion) : null,
    non_monetary_promotions: result.nonMonetaryPromotions.map(serializePromotion),
    ...price,
  };
};

export const createPendingRedemption = async ({ promotion, packageData, purchaseOrder, email, quote, transaction }) => {
  if (!promotion) return null;

  return db.PromotionRedemption.create({
    id_promotion: promotion.id_promotion,
    id_user: purchaseOrder.id_user || null,
    id_package: packageData.id_package,
    id_purchase_order: purchaseOrder.id_purchase_order,
    email,
    normalized_email: normalizeEmail(email),
    status: PROMOTION_REDEMPTION_STATUS.PENDING,
    promotion_type_snapshot: promotion.promotion_type,
    promotion_name_snapshot: snapshotNames(promotion),
    price_before_minor: quote.priceBeforeMinor,
    discount_amount_minor: quote.discountAmountMinor,
    price_after_minor: quote.priceAfterMinor,
    currency: quote.currency,
    benefit_snapshot: snapshotBenefit(promotion),
  }, { transaction });
};

export const markPromotionRedemptionConfirmed = async ({ redemptionId, paymentId, sessionId, transaction }) => {
  const redemption = await db.PromotionRedemption.findByPk(redemptionId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!redemption) return null;
  if (redemption.status === PROMOTION_REDEMPTION_STATUS.CONFIRMED) return redemption;

  await redemption.update({
    status: PROMOTION_REDEMPTION_STATUS.CONFIRMED,
    id_payment: paymentId,
    stripe_checkout_session_id: sessionId,
    redeemed_at: new Date(),
  }, { transaction });

  return redemption;
};

export const markRedemptionFailed = async ({ redemption, status, transaction }) => {
  if (!redemption || redemption.status === PROMOTION_REDEMPTION_STATUS.CONFIRMED) return redemption;
  await redemption.update({ status }, { transaction });
  return redemption;
};
