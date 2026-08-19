export const PROMOTION_TYPES = Object.freeze({
  PERCENTAGE_DISCOUNT: "PERCENTAGE_DISCOUNT",
  FIXED_AMOUNT_DISCOUNT: "FIXED_AMOUNT_DISCOUNT",
  NON_MONETARY: "NON_MONETARY",
});

export const PROMOTION_REDEMPTION_STATUS = Object.freeze({
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  RELEASED: "RELEASED",
});

export const PURCHASE_ORDER_STATUS = Object.freeze({
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
});

export const STRIPE_EVENT_STATUS = Object.freeze({
  PENDING: "PENDING",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
});

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
export const moneyToMinor = (amount) => Math.round(Number(amount) * 100);
export const minorToMoney = (amount) => Number(amount || 0) / 100;
