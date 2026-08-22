export const PAYMENT_MODE = Object.freeze({
  FULL: "FULL",
  INSTALLMENTS: "INSTALLMENTS",
});

// MVP soporta solo frecuencia mensual (decision de negocio confirmada).
export const INTERVAL_UNIT = Object.freeze({
  MONTH: "MONTH",
});

export const PAYMENT_PLAN_STATUS = Object.freeze({
  PENDING: "PENDING",
  PROCESSING_INITIAL_PAYMENT: "PROCESSING_INITIAL_PAYMENT",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  COMPLETED: "COMPLETED",
  TECHNICAL_ERROR: "TECHNICAL_ERROR",
});

export const INSTALLMENT_STATUS = Object.freeze({
  SCHEDULED: "SCHEDULED",
  PROCESSING: "PROCESSING",
  PAID: "PAID",
  FAILED: "FAILED",
  PAST_DUE: "PAST_DUE",
  RETURNED: "RETURNED",
  DISPUTED: "DISPUTED",
});

export const MIN_INSTALLMENTS = 1;
export const MAX_INSTALLMENTS = 4;

export const isSepaDirectDebitPaymentMethod = (paymentMethod) => {
  const normalized = String(paymentMethod ?? '').trim().toLowerCase();
  return normalized === 'sepa_debit' || normalized === 'sepa' || normalized === 'sepa-direct-debit';
};

export const getEffectiveInstallments = ({ paymentMethod, requestedInstallments, packageData = {} }) => {
  const requested = Number(requestedInstallments ?? 0);

  if (!isSepaDirectDebitPaymentMethod(paymentMethod)) {
    return 1;
  }

  const maxAllowed = getMaxInstallmentsForPackage(packageData);
  if (!Number.isFinite(requested) || requested <= 0) {
    return 1;
  }

  return Math.min(requested, maxAllowed);
};

export const getMaxInstallmentsForPackage = (pkg = {}) => {
  const classLimit = Number(pkg?.class_limit ?? 0);
  if (Number.isFinite(classLimit) && classLimit > 0 && classLimit <= 1) {
    return 1;
  }

  const duration = Number(pkg?.duration_package ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return 1;
  }

  const durationCap = Math.min(4, Math.max(1, Math.trunc(duration)));
  return durationCap;
};

// Divide un total en unidades minimas entre N cuotas iguales; el resto
// (por redondeo) se ajusta siempre en la ultima cuota para que la suma
// exacta coincida con el total contractual.
export const splitIntoInstallments = (totalMinor, count) => {
  const total = Number(totalMinor);
  const n = Number(count);
  if (!Number.isInteger(total) || total <= 0) throw new Error("totalMinor must be a positive integer");
  if (!Number.isInteger(n) || n < MIN_INSTALLMENTS || n > MAX_INSTALLMENTS) {
    throw new Error(`count must be an integer between ${MIN_INSTALLMENTS} and ${MAX_INSTALLMENTS}`);
  }

  const base = Math.floor(total / n);
  const amounts = new Array(n).fill(base);
  const remainder = total - base * n;
  amounts[n - 1] += remainder;

  return amounts;
};
