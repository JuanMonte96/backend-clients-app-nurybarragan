import { z } from "zod";

const nonEmptyName = z
  .string()
  .trim()
  .min(1, "This field is required")
  .max(120, "This field cannot exceed 120 characters");

const nonNegativeOrder = z
  .number({ invalid_type_error: "order_visualization must be a number" })
  .int("order_visualization must be an integer")
  .min(0, "order_visualization must be greater than or equal to 0");

export const categoryCreateSchema = z.object({
  category_name_spanish: nonEmptyName,
  category_name_english: nonEmptyName,
  category_name_french: nonEmptyName,
  order_visualization: nonNegativeOrder.optional(),
  active: z.boolean().optional(),
});

export const categoryUpdateSchema = z.object({
  category_name_spanish: nonEmptyName.optional(),
  category_name_english: nonEmptyName.optional(),
  category_name_french: nonEmptyName.optional(),
  order_visualization: nonNegativeOrder.optional(),
  active: z.boolean().optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field is required",
});

export const categoryReorderSchema = z.object({
  items: z.array(z.object({
    id_category: z.string().uuid("Invalid category id"),
    order_visualization: nonNegativeOrder,
  })).min(1, "items is required"),
});

export const packageCreateSchema = z.object({
  name_package: z.string().trim().min(2).max(120),
  description_spanish: z.string().trim().min(1).max(1000),
  description_english: z.string().trim().min(1).max(1000),
  description_french: z.string().trim().min(1).max(1000),
  price_package: z.coerce.number().positive("price_package must be greater than 0"),
  duration_package: z.coerce.number().int().min(1),
  class_limit: z.coerce.number().int().min(0).nullable().optional(),
  is_recurrent: z.boolean(),
  availabilty: z.boolean().optional(),
  id_category: z.string().uuid("Invalid category id"),
  order_visualization: nonNegativeOrder.optional(),
  category: z.enum(["premium", "standard", "basics"]).optional(),
});

export const packageUpdateSchema = z.object({
  name_package: z.string().trim().min(2).max(120).optional(),
  description_spanish: z.string().trim().min(1).max(1000).optional(),
  description_english: z.string().trim().min(1).max(1000).optional(),
  description_french: z.string().trim().min(1).max(1000).optional(),
  price_package: z.coerce.number().positive("price_package must be greater than 0").optional(),
  duration_package: z.coerce.number().int().min(1).optional(),
  class_limit: z.coerce.number().int().min(0).nullable().optional(),
  is_recurrent: z.boolean().optional(),
  availabilty: z.boolean().optional(),
  id_category: z.string().uuid("Invalid category id").optional(),
  order_visualization: nonNegativeOrder.optional(),
  category: z.enum(["premium", "standard", "basics"]).optional(),
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "At least one field is required",
});

export const packageReorderSchema = z.object({
  id_category: z.string().uuid("Invalid category id"),
  items: z.array(z.object({
    id_package: z.string().uuid("Invalid package id"),
    order_visualization: nonNegativeOrder,
  })).min(1, "items is required"),
});

