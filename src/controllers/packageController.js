import { Op } from "sequelize";
import { db } from "../models/db.js";
import { validateData } from "../helpers/zodValidate.js";
import {
  categoryCreateSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
  packageCreateSchema,
  packageReorderSchema,
  packageUpdateSchema,
} from "../validators/validateAdminCatalog.js";
import { createProduct, createStripePrice, updateStripeProduct } from "../services/stripe.js";
import { activePromotionWhere } from "../services/promotionService.js";

const LEGACY_CATEGORY_BY_LOCALE = {
  basics: {
    es: "Para Descubrirnos",
    en: "Discover Us",
    fr: "Pour Nous Decouvrir",
  },
  standard: {
    es: "Popular",
    en: "Popular",
    fr: "Popular",
  },
  premium: {
    es: "Premium",
    en: "Premium",
    fr: "Premium",
  },
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
};

const parsePagination = ({ page, limit }, defaultLimit = 10, maxLimit = 100) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  const finalPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const finalLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, maxLimit) : defaultLimit;

  return {
    page: finalPage,
    limit: finalLimit,
    offset: (finalPage - 1) * finalLimit,
  };
};

const normalizeOrders = async (model, where, transaction) => {
  const rows = await model.findAll({
    where,
    order: [
      ["order_visualization", "ASC"],
      [model === db.PackageCategory ? "created_at" : "name_package", "ASC"],
    ],
    transaction,
  });

  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].order_visualization !== index) {
      rows[index].order_visualization = index;
      await rows[index].save({ transaction });
    }
  }

  return rows;
};

const getFallbackCategoryMap = async () => {
  const categories = await db.PackageCategory.findAll({
    attributes: ["id_category", "category_name_spanish", "category_name_english", "category_name_french"],
  });

  const map = new Map();
  categories.forEach((cat) => {
    const plain = cat.toJSON();
    [plain.category_name_spanish, plain.category_name_english, plain.category_name_french]
      .filter(Boolean)
      .forEach((label) => map.set(String(label).trim().toLowerCase(), plain.id_category));
  });

  return map;
};

const mapLegacyCategoryToId = async (legacyCategory, fallbackMap) => {
  if (!legacyCategory) return null;
  const labels = LEGACY_CATEGORY_BY_LOCALE[legacyCategory] || {};
  const candidates = [labels.es, labels.en, labels.fr].filter(Boolean);

  for (const candidate of candidates) {
    const found = fallbackMap.get(String(candidate).trim().toLowerCase());
    if (found) return found;
  }

  return null;
};

const serializeCategory = (category) => ({
  id_category: category.id_category,
  category_name_spanish: category.category_name_spanish,
  category_name_english: category.category_name_english,
  category_name_french: category.category_name_french,
  order_visualization: category.order_visualization,
  active: category.active,
  created_at: category.created_at,
  updated_at: category.updated_at,
});

const serializePromotionSummary = (promotion) => ({
  id_promotion: promotion.id_promotion,
  promotion_type: promotion.promotion_type,
  discount_percentage: promotion.discount_percentage === null ? null : Number(promotion.discount_percentage),
  discount_amount_minor: promotion.discount_amount_minor === null ? null : Number(promotion.discount_amount_minor),
  currency: promotion.currency,
  name_spanish: promotion.name_spanish,
  name_english: promotion.name_english,
  name_french: promotion.name_french,
  description_spanish: promotion.description_spanish,
  description_english: promotion.description_english,
  description_french: promotion.description_french,
});

const serializePaymentOption = (option) => ({
  id_payment_option: option.id_payment_option,
  payment_mode: option.payment_mode,
  installment_count: option.installment_count,
  interval_unit: option.interval_unit,
  interval_count: option.interval_count,
  currency: option.currency,
});

const serializePackage = (pkg, promotions = [], paymentOptions = []) => ({
  id_package: pkg.id_package,
  name_package: pkg.name_package,
  description_spanish: pkg.description_spanish,
  description_english: pkg.description_english,
  description_french: pkg.description_french,
  price_package: Number(pkg.price_package),
  duration_package: pkg.duration_package,
  class_limit: pkg.class_limit,
  availabilty: pkg.availabilty,
  is_recurrent: pkg.is_recurrent,
  order_visualization: pkg.order_visualization,
  stripe_product_id: pkg.stripe_product_id,
  stripe_price_id: pkg.stripe_price_id,
  id_category: pkg.id_category,
  category: pkg.category,
  created_at: pkg.created_at,
  promotion: promotions.find((promotion) => promotion.promotion_type !== "NON_MONETARY")
    ? serializePromotionSummary(promotions.find((promotion) => promotion.promotion_type !== "NON_MONETARY"))
    : null,
  promotions: promotions.map(serializePromotionSummary),
  payment_options: paymentOptions.map(serializePaymentOption),
});

const getEnabledPaymentOptionsByPackage = async () => {
  const options = await db.PackagePaymentOption.findAll({ where: { enabled: true } });
  const map = new Map();
  options.forEach((option) => {
    const key = String(option.id_package);
    const current = map.get(key) || [];
    current.push(option);
    map.set(key, current);
  });
  return map;
};

const categoryNameWhere = (search) => ({
  [Op.or]: [
    { category_name_spanish: { [Op.iLike]: `%${search}%` } },
    { category_name_english: { [Op.iLike]: `%${search}%` } },
    { category_name_french: { [Op.iLike]: `%${search}%` } },
  ],
});

export const createPackage = async (req, res) => {
  try {
    const validation = validateData(req.body, packageCreateSchema);
    if (!validation.success) {
      return res.status(400).json({ status: "Validation Error", errors: validation.errors });
    }

    const payload = validation.data;

    const category = await db.PackageCategory.findByPk(payload.id_category);
    if (!category) {
      return res.status(404).json({ status: "Not Found", message: "Category not found" });
    }

    if (!category.active) {
      return res.status(409).json({ status: "Conflict", message: "Category is inactive" });
    }

    const { stripeProduct, stripePrice } = await createProduct({
      name: payload.name_package,
      description: payload.description_english,
      price: payload.price_package,
      is_recurrent: payload.is_recurrent,
    });

    const orderCandidate = Number.isInteger(payload.order_visualization)
      ? payload.order_visualization
      : await db.Package.count({ where: { id_category: payload.id_category } });

    const newPackage = await db.Package.create({
      ...payload,
      category: payload.category,
      order_visualization: orderCandidate,
      stripe_product_id: stripeProduct.id,
      stripe_price_id: stripePrice.id,
    });

    return res.status(201).json({
      status: "success",
      message: "Package created successfully",
      package: serializePackage(newPackage),
      stripe: {
        product_id: stripeProduct.id,
        price_id: stripePrice.id,
        sync_status: "ok",
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Failed to create package",
    });
  }
};

export const getPackages = async (_req, res) => {
  try {
    const packages = await db.Package.findAll({
      where: { availabilty: true },
      order: [
        ["order_visualization", "ASC"],
        ["created_at", "ASC"],
      ],
    });

    if (packages.length === 0) {
      return res.status(200).json({
        status: "success",
        packages: [],
      });
    }

    const paymentOptionsByPackage = await getEnabledPaymentOptionsByPackage();

    return res.status(200).json({
      status: "success",
      packages: packages.map((pkg) => serializePackage(pkg, [], paymentOptionsByPackage.get(String(pkg.id_package)) || [])),
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to fetch packages" });
  }
};

export const getPublicCatalog = async (_req, res) => {
  try {
    const now = new Date();
    const activePromotions = await db.Promotion.findAll({
      where: {
        is_active: true,
        archived_at: null,
        [Op.and]: [
          { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
          { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gt]: now } }] },
        ],
      },
      order: [["priority", "DESC"], ["created_at", "ASC"]],
    });
    const promotionIds = activePromotions.map((promotion) => promotion.id_promotion);
    const promotionLinks = promotionIds.length
      ? await db.PromotionPackage.findAll({ where: { id_promotion: { [Op.in]: promotionIds } } })
      : [];
    const promotionByPackage = new Map();
    const globalPromotions = [];
    for (const promotion of activePromotions) {
      const linkedPackageIds = promotion.applies_to_all_packages
        ? []
        : promotionLinks
          .filter((link) => link.id_promotion === promotion.id_promotion)
          .map((link) => String(link.id_package));
      if (promotion.applies_to_all_packages) {
        globalPromotions.push(promotion);
      }
      linkedPackageIds.forEach((packageId) => {
        const current = promotionByPackage.get(packageId) || [];
        current.push(promotion);
        promotionByPackage.set(packageId, current);
      });
    }
    const promotionsForPackage = (packageData) => [
      ...(promotionByPackage.get(String(packageData.id_package)) || []),
      ...globalPromotions,
    ];

    const paymentOptionsByPackage = await getEnabledPaymentOptionsByPackage();

    const activeCategories = await db.PackageCategory.findAll({
      where: { active: true },
      include: [
        {
          model: db.Package,
          where: { availabilty: true },
          required: false,
        },
      ],
      order: [
        ["order_visualization", "ASC"],
        ["created_at", "ASC"],
        [db.Package, "order_visualization", "ASC"],
        [db.Package, "name_package", "ASC"],
      ],
    });

    const categoryMap = new Map();
    activeCategories.forEach((categoryInstance) => {
      const category = categoryInstance.toJSON();
      categoryMap.set(category.id_category, {
        ...serializeCategory(category),
        packages: (category.Packages || []).map((pkg) => serializePackage(
          pkg,
          promotionsForPackage(pkg),
          paymentOptionsByPackage.get(String(pkg.id_package)) || []
        )),
      });
    });

    const packagesWithoutCategory = await db.Package.findAll({
      where: {
        availabilty: true,
        id_category: null,
      },
      order: [
        ["order_visualization", "ASC"],
        ["name_package", "ASC"],
      ],
    });

    const fallbackMap = await getFallbackCategoryMap();
    const legacyWarnings = [];

    for (const pkg of packagesWithoutCategory) {
      const idCategoryFromLegacy = await mapLegacyCategoryToId(pkg.category, fallbackMap);
      if (!idCategoryFromLegacy || !categoryMap.has(idCategoryFromLegacy)) {
        legacyWarnings.push({
          id_package: pkg.id_package,
          name_package: pkg.name_package,
          legacy_category: pkg.category,
        });
        continue;
      }

      categoryMap.get(idCategoryFromLegacy).packages.push(serializePackage(
        pkg,
        promotionsForPackage(pkg),
        paymentOptionsByPackage.get(String(pkg.id_package)) || []
      ));
    }

    const categories = [...categoryMap.values()]
      .map((category) => ({
        ...category,
        packages: [...category.packages].sort((a, b) => {
          const byOrder = a.order_visualization - b.order_visualization;
          if (byOrder !== 0) return byOrder;
          return String(a.name_package).localeCompare(String(b.name_package));
        }),
      }))
      .filter((category) => category.packages.length > 0)
      .sort((a, b) => {
        const byOrder = a.order_visualization - b.order_visualization;
        if (byOrder !== 0) return byOrder;
        return String(a.category_name_spanish).localeCompare(String(b.category_name_spanish));
      });

    return res.status(200).json({
      status: "success",
      categories,
      legacy_warnings: legacyWarnings,
    });
  } catch (_error) {
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch package catalog",
    });
  }
};

export const avalibalityPackage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(String(id))) {
      return res.status(400).json({ status: "Bad Request", message: "Invalid package id" });
    }

    const pkg = await db.Package.findByPk(id);
    if (!pkg) {
      return res.status(404).json({ status: "Not Found", message: "Package not found" });
    }

    pkg.availabilty = !pkg.availabilty;
    await pkg.save();

    return res.status(200).json({
      status: "success",
      message: "Package availability updated successfully",
      package: serializePackage(pkg),
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to update availability" });
  }
};

export const getAdminCategoryList = async (req, res) => {
  try {
    const { search, active, sort_by = "order_visualization", sort_order = "ASC", page, limit } = req.query;

    const where = {};
    if (search) Object.assign(where, categoryNameWhere(search));

    const parsedActive = parseBoolean(active);
    if (parsedActive !== undefined) where.active = parsedActive;

    const { page: currentPage, limit: pageSize, offset } = parsePagination({ page, limit });

    const allowedSort = new Set(["order_visualization", "created_at", "updated_at", "category_name_spanish"]);
    const finalSortBy = allowedSort.has(sort_by) ? sort_by : "order_visualization";
    const finalSortOrder = String(sort_order).toUpperCase() === "DESC" ? "DESC" : "ASC";

    const { count, rows } = await db.PackageCategory.findAndCountAll({
      where,
      include: [{
        model: db.Package,
        attributes: ["id_package"],
        required: false,
      }],
      limit: pageSize,
      offset,
      order: [[finalSortBy, finalSortOrder], ["created_at", "ASC"]],
    });

    const categories = rows.map((row) => {
      const plain = row.toJSON();
      return {
        ...serializeCategory(plain),
        package_count: plain.Packages?.length || 0,
      };
    });

    return res.status(200).json({
      status: "success",
      page: currentPage,
      limit: pageSize,
      total: count,
      pages: Math.ceil(count / pageSize),
      categories,
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to list categories" });
  }
};

export const getAdminCategoryById = async (req, res) => {
  try {
    const { id_category } = req.params;
    if (!UUID_REGEX.test(String(id_category))) {
      return res.status(400).json({ status: "Bad Request", message: "Invalid category id" });
    }

    const category = await db.PackageCategory.findByPk(id_category, {
      include: [{ model: db.Package, attributes: ["id_package"] }],
    });

    if (!category) {
      return res.status(404).json({ status: "Not Found", message: "Category not found" });
    }

    const plain = category.toJSON();
    return res.status(200).json({
      status: "success",
      category: {
        ...serializeCategory(plain),
        package_count: plain.Packages?.length || 0,
      },
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to fetch category" });
  }
};

export const createAdminCategory = async (req, res) => {
  try {
    const validation = validateData(req.body, categoryCreateSchema);
    if (!validation.success) {
      return res.status(400).json({ status: "Validation Error", errors: validation.errors });
    }

    const payload = validation.data;

    const duplicate = await db.PackageCategory.findOne({
      where: {
        [Op.or]: [
          { category_name_spanish: { [Op.iLike]: payload.category_name_spanish } },
          { category_name_english: { [Op.iLike]: payload.category_name_english } },
          { category_name_french: { [Op.iLike]: payload.category_name_french } },
        ],
      },
    });

    if (duplicate) {
      return res.status(409).json({ status: "Conflict", message: "Category name already exists" });
    }

    const orderCandidate = Number.isInteger(payload.order_visualization)
      ? payload.order_visualization
      : await db.PackageCategory.count();

    const category = await db.PackageCategory.create({
      ...payload,
      order_visualization: orderCandidate,
      active: payload.active ?? true,
    });

    return res.status(201).json({
      status: "success",
      message: "Category created successfully",
      category: serializeCategory(category),
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to create category" });
  }
};

export const updateAdminCategory = async (req, res) => {
  try {
    const { id_category } = req.params;
    if (!UUID_REGEX.test(String(id_category))) {
      return res.status(400).json({ status: "Bad Request", message: "Invalid category id" });
    }

    const validation = validateData(req.body, categoryUpdateSchema);
    if (!validation.success) {
      return res.status(400).json({ status: "Validation Error", errors: validation.errors });
    }

    const category = await db.PackageCategory.findByPk(id_category);
    if (!category) {
      return res.status(404).json({ status: "Not Found", message: "Category not found" });
    }

    await category.update(validation.data);

    return res.status(200).json({
      status: "success",
      message: "Category updated successfully",
      category: serializeCategory(category),
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to update category" });
  }
};

export const setAdminCategoryStatus = async (req, res) => {
  try {
    const { id_category } = req.params;
    const { active } = req.body;

    if (!UUID_REGEX.test(String(id_category))) {
      return res.status(400).json({ status: "Bad Request", message: "Invalid category id" });
    }

    if (typeof active !== "boolean") {
      return res.status(400).json({ status: "Bad Request", message: "active must be boolean" });
    }

    const category = await db.PackageCategory.findByPk(id_category);
    if (!category) {
      return res.status(404).json({ status: "Not Found", message: "Category not found" });
    }

    category.active = active;
    await category.save();

    return res.status(200).json({
      status: "success",
      message: active ? "Category activated successfully" : "Category deactivated successfully",
      category: serializeCategory(category),
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to update category status" });
  }
};

export const deleteAdminCategory = async (req, res) => {
  try {
    const { id_category } = req.params;
    if (!UUID_REGEX.test(String(id_category))) {
      return res.status(400).json({ status: "Bad Request", message: "Invalid category id" });
    }

    const category = await db.PackageCategory.findByPk(id_category);
    if (!category) {
      return res.status(404).json({ status: "Not Found", message: "Category not found" });
    }

    const packageCount = await db.Package.count({ where: { id_category } });
    if (packageCount > 0) {
      return res.status(409).json({
        status: "Conflict",
        message: "Cannot delete category with associated packages. Reassign packages first.",
      });
    }

    await category.destroy();

    return res.status(200).json({ status: "success", message: "Category deleted successfully" });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to delete category" });
  }
};

export const reorderAdminCategories = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const validation = validateData(req.body, categoryReorderSchema);
    if (!validation.success) {
      await transaction.rollback();
      return res.status(400).json({ status: "Validation Error", errors: validation.errors });
    }

    const { items } = validation.data;
    const ids = items.map((item) => item.id_category);

    const categories = await db.PackageCategory.findAll({
      where: { id_category: { [Op.in]: ids } },
      transaction,
    });

    if (categories.length !== ids.length) {
      await transaction.rollback();
      return res.status(404).json({ status: "Not Found", message: "One or more categories were not found" });
    }

    const updatesById = new Map(items.map((item) => [item.id_category, item.order_visualization]));

    for (const category of categories) {
      category.order_visualization = updatesById.get(category.id_category);
      await category.save({ transaction });
    }

    await normalizeOrders(db.PackageCategory, {}, transaction);
    await transaction.commit();

    const finalRows = await db.PackageCategory.findAll({
      order: [["order_visualization", "ASC"], ["created_at", "ASC"]],
    });

    return res.status(200).json({
      status: "success",
      message: "Categories reordered successfully",
      categories: finalRows.map(serializeCategory),
    });
  } catch (_error) {
    await transaction.rollback();
    return res.status(500).json({ status: "error", message: "Failed to reorder categories" });
  }
};

export const getAdminPackages = async (req, res) => {
  try {
    const {
      page,
      limit,
      name,
      id_category,
      availabilty,
      is_recurrent,
      stripe_status,
      min_price,
      max_price,
      sort_by = "created_at",
      sort_order = "DESC",
    } = req.query;

    const where = {};
    if (name) where.name_package = { [Op.iLike]: `%${name}%` };
    if (id_category && UUID_REGEX.test(String(id_category))) where.id_category = id_category;

    const availabilityFilter = parseBoolean(availabilty);
    if (availabilityFilter !== undefined) where.availabilty = availabilityFilter;

    const recurrentFilter = parseBoolean(is_recurrent);
    if (recurrentFilter !== undefined) where.is_recurrent = recurrentFilter;

    if (min_price || max_price) {
      where.price_package = {};
      if (min_price) where.price_package[Op.gte] = Number(min_price);
      if (max_price) where.price_package[Op.lte] = Number(max_price);
    }

    if (stripe_status === "synced") {
      where.stripe_product_id = { [Op.not]: null };
      where.stripe_price_id = { [Op.not]: null };
    }

    if (stripe_status === "unsynced") {
      where[Op.or] = [
        { stripe_product_id: null },
        { stripe_price_id: null },
      ];
    }

    const { page: currentPage, limit: pageSize, offset } = parsePagination({ page, limit }, 20, 100);

    const allowedSort = new Set([
      "created_at",
      "name_package",
      "price_package",
      "order_visualization",
      "availabilty",
      "is_recurrent",
    ]);
    const finalSortBy = allowedSort.has(sort_by) ? sort_by : "created_at";
    const finalSortOrder = String(sort_order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { count, rows } = await db.Package.findAndCountAll({
      where,
      include: [
        {
          model: db.PackageCategory,
          required: false,
          attributes: [
            "id_category",
            "category_name_spanish",
            "category_name_english",
            "category_name_french",
            "active",
            "order_visualization",
          ],
        },
      ],
      order: [[finalSortBy, finalSortOrder], ["name_package", "ASC"]],
      offset,
      limit: pageSize,
    });

    const packages = rows.map((row) => {
      const plain = row.toJSON();
      return {
        ...serializePackage(plain),
        category_data: plain.PackageCategory
          ? {
              id_category: plain.PackageCategory.id_category,
              category_name_spanish: plain.PackageCategory.category_name_spanish,
              category_name_english: plain.PackageCategory.category_name_english,
              category_name_french: plain.PackageCategory.category_name_french,
              active: plain.PackageCategory.active,
              order_visualization: plain.PackageCategory.order_visualization,
            }
          : null,
        stripe_sync_status: plain.stripe_product_id && plain.stripe_price_id ? "synced" : "unsynced",
      };
    });

    return res.status(200).json({
      status: "success",
      page: currentPage,
      limit: pageSize,
      total: count,
      pages: Math.ceil(count / pageSize),
      packages,
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to list packages" });
  }
};

export const getAdminPackageById = async (req, res) => {
  try {
    const { id_package } = req.params;
    if (!UUID_REGEX.test(String(id_package))) {
      return res.status(400).json({ status: "Bad Request", message: "Invalid package id" });
    }

    const pkg = await db.Package.findByPk(id_package, {
      include: [
        {
          model: db.PackageCategory,
          required: false,
          attributes: [
            "id_category",
            "category_name_spanish",
            "category_name_english",
            "category_name_french",
            "active",
            "order_visualization",
          ],
        },
      ],
    });

    if (!pkg) {
      return res.status(404).json({ status: "Not Found", message: "Package not found" });
    }

    const plain = pkg.toJSON();
    return res.status(200).json({
      status: "success",
      package: {
        ...serializePackage(plain),
        category_data: plain.PackageCategory || null,
        stripe_sync_status: plain.stripe_product_id && plain.stripe_price_id ? "synced" : "unsynced",
      },
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to fetch package" });
  }
};

export const updateAdminPackage = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { id_package } = req.params;
    if (!UUID_REGEX.test(String(id_package))) {
      await transaction.rollback();
      return res.status(400).json({ status: "Bad Request", message: "Invalid package id" });
    }

    const validation = validateData(req.body, packageUpdateSchema);
    if (!validation.success) {
      await transaction.rollback();
      return res.status(400).json({ status: "Validation Error", errors: validation.errors });
    }

    const payload = validation.data;

    const pkg = await db.Package.findByPk(id_package, { transaction });
    if (!pkg) {
      await transaction.rollback();
      return res.status(404).json({ status: "Not Found", message: "Package not found" });
    }

    if (payload.id_category && payload.id_category !== pkg.id_category) {
      const targetCategory = await db.PackageCategory.findByPk(payload.id_category, { transaction });
      if (!targetCategory) {
        await transaction.rollback();
        return res.status(404).json({ status: "Not Found", message: "Category not found" });
      }

      const oldCategory = pkg.id_category;
      const finalOrder = await db.Package.count({
        where: { id_category: payload.id_category },
        transaction,
      });

      payload.order_visualization = finalOrder;
      pkg.id_category = payload.id_category;
      await pkg.save({ transaction });

      await normalizeOrders(db.Package, { id_category: oldCategory }, transaction);
      await normalizeOrders(db.Package, { id_category: payload.id_category }, transaction);
    }

    const oldPrice = Number(pkg.price_package);
    const oldRecurring = Boolean(pkg.is_recurrent);

    await pkg.update(payload, { transaction });

    const priceChanged = payload.price_package !== undefined && Number(payload.price_package) !== oldPrice;
    const recurringChanged = payload.is_recurrent !== undefined && Boolean(payload.is_recurrent) !== oldRecurring;

    let stripeMessage = null;

    if (payload.name_package || payload.description_english || payload.availabilty !== undefined) {
      try {
        if (pkg.stripe_product_id) {
          await updateStripeProduct({
            productId: pkg.stripe_product_id,
            name: payload.name_package || pkg.name_package,
            description: payload.description_english || pkg.description_english,
            active: payload.availabilty ?? pkg.availabilty,
          });
        }
      } catch (_error) {
        stripeMessage = "Package updated locally, but Stripe product could not be updated";
      }
    }

    if (priceChanged || recurringChanged) {
      if (!pkg.stripe_product_id) {
        stripeMessage = "Package updated locally, but Stripe product is missing so a new price could not be created";
      } else {
        try {
          const newPrice = await createStripePrice({
            productId: pkg.stripe_product_id,
            price: payload.price_package ?? pkg.price_package,
            is_recurrent: payload.is_recurrent ?? pkg.is_recurrent,
          });
          pkg.stripe_price_id = newPrice.id;
          await pkg.save({ transaction });
          stripeMessage = "A new Stripe price was created and will apply to future purchases";
        } catch (_error) {
          stripeMessage = "Package updated locally, but Stripe could not create a new price";
        }
      }
    }

    await transaction.commit();

    return res.status(200).json({
      status: "success",
      message: "Package updated successfully",
      stripe_message: stripeMessage,
      package: serializePackage(pkg),
    });
  } catch (_error) {
    await transaction.rollback();
    return res.status(500).json({ status: "error", message: "Failed to update package" });
  }
};

export const createAdminPackage = createPackage;

export const setAdminPackageAvailability = async (req, res) => {
  try {
    const { id_package } = req.params;
    const { availabilty } = req.body;

    if (!UUID_REGEX.test(String(id_package))) {
      return res.status(400).json({ status: "Bad Request", message: "Invalid package id" });
    }

    if (typeof availabilty !== "boolean") {
      return res.status(400).json({ status: "Bad Request", message: "availabilty must be boolean" });
    }

    const pkg = await db.Package.findByPk(id_package);
    if (!pkg) {
      return res.status(404).json({ status: "Not Found", message: "Package not found" });
    }

    pkg.availabilty = availabilty;
    await pkg.save();

    return res.status(200).json({
      status: "success",
      message: availabilty ? "Package enabled successfully" : "Package disabled successfully",
      package: serializePackage(pkg),
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to change availability" });
  }
};

export const reorderAdminPackages = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const validation = validateData(req.body, packageReorderSchema);
    if (!validation.success) {
      await transaction.rollback();
      return res.status(400).json({ status: "Validation Error", errors: validation.errors });
    }

    const { id_category, items } = validation.data;

    const category = await db.PackageCategory.findByPk(id_category, { transaction });
    if (!category) {
      await transaction.rollback();
      return res.status(404).json({ status: "Not Found", message: "Category not found" });
    }

    const ids = items.map((item) => item.id_package);
    const packages = await db.Package.findAll({
      where: {
        id_package: { [Op.in]: ids },
        id_category,
      },
      transaction,
    });

    if (packages.length !== ids.length) {
      await transaction.rollback();
      return res.status(409).json({
        status: "Conflict",
        message: "One or more packages do not belong to the provided category",
      });
    }

    const updatesById = new Map(items.map((item) => [item.id_package, item.order_visualization]));

    for (const pkg of packages) {
      pkg.order_visualization = updatesById.get(pkg.id_package);
      await pkg.save({ transaction });
    }

    await normalizeOrders(db.Package, { id_category }, transaction);
    await transaction.commit();

    const finalRows = await db.Package.findAll({
      where: { id_category },
      order: [["order_visualization", "ASC"], ["name_package", "ASC"]],
    });

    return res.status(200).json({
      status: "success",
      message: "Packages reordered successfully",
      packages: finalRows.map(serializePackage),
    });
  } catch (_error) {
    await transaction.rollback();
    return res.status(500).json({ status: "error", message: "Failed to reorder packages" });
  }
};

export const retryPackageStripeSync = async (req, res) => {
  try {
    const { id_package } = req.params;
    if (!UUID_REGEX.test(String(id_package))) {
      return res.status(400).json({ status: "Bad Request", message: "Invalid package id" });
    }

    const pkg = await db.Package.findByPk(id_package);
    if (!pkg) {
      return res.status(404).json({ status: "Not Found", message: "Package not found" });
    }

    if (!pkg.stripe_product_id) {
      const { stripeProduct, stripePrice } = await createProduct({
        name: pkg.name_package,
        description: pkg.description_english,
        price: pkg.price_package,
        is_recurrent: pkg.is_recurrent,
      });

      pkg.stripe_product_id = stripeProduct.id;
      pkg.stripe_price_id = stripePrice.id;
      await pkg.save();

      return res.status(200).json({
        status: "success",
        message: "Stripe sync completed successfully",
        package: serializePackage(pkg),
      });
    }

    await updateStripeProduct({
      productId: pkg.stripe_product_id,
      name: pkg.name_package,
      description: pkg.description_english,
      active: pkg.availabilty,
    });

    const newPrice = await createStripePrice({
      productId: pkg.stripe_product_id,
      price: pkg.price_package,
      is_recurrent: pkg.is_recurrent,
    });

    pkg.stripe_price_id = newPrice.id;
    await pkg.save();

    return res.status(200).json({
      status: "success",
      message: "Stripe sync completed successfully",
      package: serializePackage(pkg),
    });
  } catch (_error) {
    return res.status(500).json({
      status: "error",
      message: "Package was saved, but Stripe sync failed",
    });
  }
};

export const backfillPackageCategories = async (_req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const fallbackMap = await getFallbackCategoryMap();

    const rows = await db.Package.findAll({
      where: {
        id_category: null,
      },
      transaction,
    });

    const unresolved = [];
    let updated = 0;

    for (const pkg of rows) {
      const matched = await mapLegacyCategoryToId(pkg.category, fallbackMap);
      if (!matched) {
        unresolved.push({
          id_package: pkg.id_package,
          name_package: pkg.name_package,
          legacy_category: pkg.category,
        });
        continue;
      }

      pkg.id_category = matched;
      await pkg.save({ transaction });
      updated += 1;
    }

    await transaction.commit();

    return res.status(200).json({
      status: "success",
      message: "Backfill completed",
      updated,
      unresolved,
    });
  } catch (_error) {
    await transaction.rollback();
    return res.status(500).json({ status: "error", message: "Failed to backfill categories" });
  }
};

// --- Admin: Payment Plans monitoring ---

export const getAdminPaymentPlans = async (req, res) => {
  try {
    const { page, limit, status } = req.query;
    const { page: finalPage, limit: finalLimit, offset } = parsePagination({ page, limit });

    const where = status ? { status } : {};

    const { rows, count } = await db.PaymentPlan.findAndCountAll({
      where,
      include: [
        { model: db.User, attributes: ["id_user", "name_user", "email_user", "is_blocked"] },
        { model: db.Package, attributes: ["id_package", "name_package"] },
        { model: db.PaymentPlanInstallment },
      ],
      order: [["created_at", "DESC"]],
      limit: finalLimit,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      status: "success",
      payment_plans: rows,
      pagination: { page: finalPage, limit: finalLimit, total: count },
    });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to fetch payment plans" });
  }
};

export const getAdminPaymentPlanById = async (req, res) => {
  try {
    const { id_payment_plan } = req.params;
    if (!UUID_REGEX.test(id_payment_plan)) {
      return res.status(400).json({ status: "error", message: "Invalid payment plan id" });
    }

    const paymentPlan = await db.PaymentPlan.findByPk(id_payment_plan, {
      include: [
        { model: db.User, attributes: ["id_user", "name_user", "email_user", "telephone_user", "is_blocked"] },
        { model: db.Package, attributes: ["id_package", "name_package"] },
        { model: db.PaymentPlanInstallment },
      ],
    });

    if (!paymentPlan) {
      return res.status(404).json({ status: "error", message: "Payment plan not found" });
    }

    return res.status(200).json({ status: "success", payment_plan: paymentPlan });
  } catch (_error) {
    return res.status(500).json({ status: "error", message: "Failed to fetch payment plan" });
  }
};

