import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";

/**
 * Schemas for the Master (back-office) area. Every one of them is used twice:
 * once in the client form for instant feedback, once inside the server action
 * as the real gate. The messages are dictionary keys, not sentences.
 *
 * Names and descriptions are entered once, in whatever language the operator is
 * working in, and stored for both locales — the POS then shows that same text
 * whichever language it runs in.
 */

const name = z.string().trim().min(1, "required").max(120);

export const categorySchema = z.object({
  id: z.number().int().positive().optional(),
  slug: z
    .string()
    .trim()
    .min(1, "required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "invalidSlug"),
  icon: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean(),
  name,
});
export type CategoryInput = z.infer<typeof categorySchema>;

/**
 * One size of a dish — a name and the full price the customer pays for it, in
 * euros. Never a surcharge: the operator types what the size costs, and the
 * server turns that into the base price plus the deltas the POS works in.
 */
export const dishSizeSchema = z.object({
  name: z.string().trim().min(1, "required").max(60),
  price: z.number().min(0, "negativePrice").max(9999),
});
export type DishSizeInput = z.infer<typeof dishSizeSchema>;

/** A dish sold in more than 12 sizes is a data-entry mistake, not a menu. */
const MAX_SIZES = 12;

export const menuItemSchema = z
  .object({
    id: z.number().int().positive().optional(),
    itemNumber: z.number().int().min(1, "required").max(99999),
    categoryId: z.number().int().positive({ message: "required" }),
    /**
     * Entered in euros; persisted as Decimal(10,2) through the cents helpers.
     * Ignored when the dish has sizes — the first size sets the price then.
     */
    basePrice: z.number().min(0, "negativePrice").max(9999),
    /** Empty for a one-price dish; otherwise the first row is the default. */
    sizes: z.array(dishSizeSchema).max(MAX_SIZES).default([]),
    isActive: z.boolean(),
    isPopular: z.boolean(),
    name,
    description: z.string().trim().max(400).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    // Two sizes with the same name are indistinguishable on the receipt.
    const seen = new Set<string>();
    v.sizes.forEach((size, i) => {
      const key = size.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["sizes", i, "name"],
          message: "duplicateSize",
        });
      }
      seen.add(key);
    });
  });
export type MenuItemInput = z.infer<typeof menuItemSchema>;

/**
 * A price change and nothing else, from the Preise tab: the full price of a
 * one-price dish, or one full price per size in the order the sizes are kept.
 */
export const itemPricesSchema = z.object({
  itemId: z.number().int().positive(),
  prices: z.array(z.number().gt(0, "priceRequired").max(9999)).min(1).max(MAX_SIZES),
});
export type ItemPricesInput = z.infer<typeof itemPricesSchema>;

export const staffSchema = z
  .object({
    id: z.number().int().positive().optional(),
    name,
    email: emailSchema,
    role: z.enum(["ADMIN", "CASHIER"]),
    avatarColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "invalidColor"),
    isActive: z.boolean(),
    /** Required when creating; on edit an empty value keeps the current password. */
    password: passwordSchema.optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.id === undefined && !v.password) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "passwordLength" });
    }
  });
export type StaffInput = z.infer<typeof staffSchema>;
