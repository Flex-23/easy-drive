import { z } from "zod";

/**
 * Order schemas — the single source of truth for order shape and business
 * rules. Messages are dictionary keys (under `validation`), resolved to Arabic
 * or German at the UI. The client validates with these same schemas.
 */
/**
 * One chosen option. A size is priced by the menu and `priceCents` is ignored;
 * an extra costs what the cashier typed for it, and `priceCents` is that.
 */
export const chosenOptionSchema = z.object({
  id: z.number().int().positive(),
  priceCents: z.number().int().min(0).max(100_000).optional(),
});

export const orderLineSchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().int().min(1, "minQuantity"),
  kitchenNotes: z.string().max(280).optional(),
  choices: z.array(chosenOptionSchema).default([]),
});

export const orderTypeSchema = z.enum(["DINE_IN", "PICKUP", "DELIVERY"]);

const baseShape = {
  type: orderTypeSchema,
  tableNumber: z.string().trim().max(12).optional().nullable(),
  customerId: z.number().int().positive().optional().nullable(),
  addressId: z.number().int().positive().optional().nullable(),
  discountCents: z.number().int().min(0).default(0),
  /** Typed at the till per order; ignored unless the order is a delivery. */
  deliveryCents: z.number().int().min(0).max(100_000).default(0),
  lines: z.array(orderLineSchema).min(1, "emptyOrder"),
};

interface BaseOrderShape {
  type: "DINE_IN" | "PICKUP" | "DELIVERY";
  tableNumber?: string | null;
  addressId?: number | null;
}

function checkBusinessRules(v: BaseOrderShape, ctx: z.RefinementCtx) {
  if (v.type === "DELIVERY" && !v.addressId) {
    ctx.addIssue({ code: "custom", path: ["addressId"], message: "addressRequired" });
  }
  if (v.type === "DINE_IN" && !v.tableNumber) {
    ctx.addIssue({ code: "custom", path: ["tableNumber"], message: "tableRequired" });
  }
}

/**
 * What the till sends, whether the bill is being parked or rung up: both write
 * the same row and neither takes payment. Payment is settled later, on the
 * orders board, against an order that already exists.
 */
export const holdOrderSchema = z
  .object(baseShape)
  .superRefine((v, ctx) => checkBusinessRules(v, ctx));

export type OrderLineInput = z.infer<typeof orderLineSchema>;
export type HoldOrderInput = z.infer<typeof holdOrderSchema>;
