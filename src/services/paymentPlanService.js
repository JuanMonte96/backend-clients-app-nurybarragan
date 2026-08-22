import { db } from "../models/db.js";
import { buildPromotionQuote, createPendingRedemption } from "./promotionService.js";
import { PURCHASE_ORDER_STATUS, normalizeEmail } from "../constants/promotion.js";
import { splitIntoInstallments, PAYMENT_PLAN_STATUS, INSTALLMENT_STATUS, INTERVAL_UNIT } from "../constants/paymentPlan.js";
import { createTempPassword } from "../services/password.js";

const PENDING_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

// Resuelve (o crea) el usuario antes de iniciar el Checkout. Esto es necesario
// porque `payment_plans.id_user` es NOT NULL en el esquema ya aplicado, aunque
// las credenciales solo se envian cuando se confirme la primera cuota (ver
// webhookController: processFirstInstallmentConfirmed).
const resolveOrCreateUser = async ({ name, email, telephone, transaction }) => {
  const normalizedEmail = normalizeEmail(email);
  const existing = await db.User.findOne({ where: { email_user: normalizedEmail }, transaction });
  if (existing) return { user: existing, isNewUser: false };

  const { hashedPassword } = await createTempPassword();
  const user = await db.User.create({
    name_user: name,
    email_user: normalizedEmail,
    telephone_user: telephone,
    password_user: hashedPassword,
    role: "student",
  }, { transaction });

  return { user, isNewUser: true };
};

const buildPackageSnapshot = (packageData) => ({
  id_package: packageData.id_package,
  name_package: packageData.name_package,
  price_package: packageData.price_package,
  duration_package: packageData.duration_package,
  class_limit: packageData.class_limit,
});

export const buildPaymentPlanQuote = async ({ packageData, paymentOption, userId, email, transaction }) => {
  const quote = await buildPromotionQuote({ packageData, userId, email, transaction });
  const installmentAmountsMinor = splitIntoInstallments(quote.priceAfterMinor, paymentOption.installment_count);
  return { ...quote, installmentAmountsMinor };
};

export const createPendingPaymentPlan = async ({ packageData, paymentOption, name, email, telephone, transaction }) => {
  const normalizedEmail = normalizeEmail(email);

  const { user, isNewUser } = await resolveOrCreateUser({ name, email: normalizedEmail, telephone, transaction });

  const quote = await buildPaymentPlanQuote({
    packageData,
    paymentOption,
    userId: user.id_user,
    email: normalizedEmail,
    transaction,
  });

  const purchaseOrder = await db.PurchaseOrder.create({
    id_user: user.id_user,
    id_package: packageData.id_package,
    id_promotion: quote.promotion?.id_promotion || null,
    email: normalizedEmail,
    normalized_email: normalizedEmail,
    currency: quote.currency,
    price_before_minor: quote.priceBeforeMinor,
    discount_amount_minor: quote.discountAmountMinor,
    price_after_minor: quote.priceAfterMinor,
    status: PURCHASE_ORDER_STATUS.PENDING,
    expires_at: new Date(Date.now() + PENDING_ORDER_TTL_MS),
  }, { transaction });

  const redemption = await createPendingRedemption({
    promotion: quote.promotion,
    packageData,
    purchaseOrder,
    email: normalizedEmail,
    quote,
    transaction,
  });

  const now = new Date();
  const paymentPlan = await db.PaymentPlan.create({
    id_purchase_order: purchaseOrder.id_purchase_order,
    id_user: user.id_user,
    id_package: packageData.id_package,
    id_promotion: quote.promotion?.id_promotion || null,
    id_payment_option: paymentOption.id_payment_option,
    currency: quote.currency,
    package_price_minor: quote.priceBeforeMinor,
    promotion_discount_minor: quote.discountAmountMinor,
    contractual_total_minor: quote.priceAfterMinor,
    paid_total_minor: 0,
    outstanding_total_minor: quote.priceAfterMinor,
    installment_count: paymentOption.installment_count,
    interval_unit: INTERVAL_UNIT.MONTH,
    interval_count: 1,
    status: PAYMENT_PLAN_STATUS.PENDING,
    package_snapshot: buildPackageSnapshot(packageData),
    promotion_snapshot: quote.promotion || null,
    installment_snapshot: quote.installmentAmountsMinor,
  }, { transaction });

  const installments = [];
  for (let i = 0; i < quote.installmentAmountsMinor.length; i += 1) {
    const expectedAt = new Date(now);
    expectedAt.setMonth(expectedAt.getMonth() + i);
    installments.push(await db.PaymentPlanInstallment.create({
      id_payment_plan: paymentPlan.id_payment_plan,
      installment_number: i + 1,
      expected_amount_minor: quote.installmentAmountsMinor[i],
      expected_at: expectedAt,
      status: INSTALLMENT_STATUS.SCHEDULED,
    }, { transaction }));
  }

  return { user, isNewUser, purchaseOrder, redemption, paymentPlan, installments, quote };
};
