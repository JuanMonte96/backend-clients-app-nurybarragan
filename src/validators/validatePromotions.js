import { z } from "zod";

const localizedText = z.string().trim().min(1).max(2000);
const uuid = z.string().uuid();

export const promotionCreateSchema = z.object({
  name_spanish: localizedText,
  name_english: localizedText,
  name_french: localizedText,
  description_spanish: localizedText,
  description_english: localizedText,
  description_french: localizedText,
  promotion_type: z.enum(["PERCENTAGE_DISCOUNT", "FIXED_AMOUNT_DISCOUNT", "NON_MONETARY"]),
  discount_percentage: z.coerce.number().positive().max(100).optional().nullable(),
  discount_amount_minor: z.coerce.number().int().positive().optional().nullable(),
  currency: z.string().length(3).toLowerCase().optional().nullable(),
  benefit_code: z.string().trim().max(120).optional().nullable(),
  benefit_snapshot: z.record(z.string(), z.unknown()).optional().nullable(),
  is_active: z.boolean().optional(),
  first_purchase_only: z.boolean().default(true),
  applies_to_all_packages: z.boolean().default(false),
  priority: z.coerce.number().int().min(0).default(0),
  starts_at: z.coerce.date().optional().nullable(),
  ends_at: z.coerce.date().optional().nullable(),
  package_ids: z.array(uuid).default([]),
}).superRefine((payload, context) => {
  if (payload.ends_at && payload.starts_at && payload.ends_at <= payload.starts_at) {
    context.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be after starts_at" });
  }

  if (payload.promotion_type === "PERCENTAGE_DISCOUNT") {
    if (payload.discount_percentage === null || payload.discount_percentage === undefined) {
      context.addIssue({ code: "custom", path: ["discount_percentage"], message: "Percentage discount is required" });
    }
    if (payload.discount_amount_minor !== null && payload.discount_amount_minor !== undefined) {
      context.addIssue({ code: "custom", path: ["discount_amount_minor"], message: "Fixed amount is not allowed for percentage promotions" });
    }
  }

  if (payload.promotion_type === "FIXED_AMOUNT_DISCOUNT") {
    if (!payload.discount_amount_minor) {
      context.addIssue({ code: "custom", path: ["discount_amount_minor"], message: "Fixed discount is required" });
    }
    if (!payload.currency) {
      context.addIssue({ code: "custom", path: ["currency"], message: "Currency is required for fixed discounts" });
    }
    if (payload.discount_percentage !== null && payload.discount_percentage !== undefined) {
      context.addIssue({ code: "custom", path: ["discount_percentage"], message: "Percentage is not allowed for fixed promotions" });
    }
  }

  if (payload.promotion_type === "NON_MONETARY" && (payload.discount_percentage || payload.discount_amount_minor)) {
    context.addIssue({ code: "custom", path: ["promotion_type"], message: "Non-monetary promotions cannot contain discounts" });
  }

  if (payload.applies_to_all_packages && payload.package_ids.length > 0) {
    context.addIssue({ code: "custom", path: ["package_ids"], message: "Select all packages or specific packages, not both" });
  }
});

export const promotionUpdateSchema = promotionCreateSchema.partial().omit({ package_ids: true }).extend({
  package_ids: z.array(uuid).optional(),
});
