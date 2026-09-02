import { z } from "zod";

/**
 * Order schemas — the single source of truth for order shape and business
 * rules. Messages are dictionary keys (under `validation`), resolved to Arabic
 * or German at the UI. The client validates with these same schemas.
 */
export const orderLineSchema = z.object({
  itemId: z.number().int().positive(),
  quantity: z.number().int().min(1, "minQuantity"),
  kitchenNotes: z.string().max(280).optional(),
  choiceIds: z.array(z.number().int().positive()).default([]),
});

export const orderTypeSchema = z.enum(["DINE_IN", "PICKUP", "DELIVERY"]);
export const paymentMethodSchema = z.enum(["CASH", "CARD", "ONLINE"]);

const baseShape = {
  type: orderTypeSchema,
  tableNumber: z.string().trim().max(12).optional().nullable(),
  customerId: z.number().int().positive().optional().nullable(),
  addressId: z.number().int().positive().optional().nullable(),
  discountCents: z.number().int().min(0).default(0),
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

/** Draft/hold: no payment required. */
export const holdOrderSchema = z
  .object(baseShape)
  .superRefine((v, ctx) => checkBusinessRules(v, ctx));

/** Checkout: payment required; cash sufficiency checked server-side post-total. */
export const payOrderSchema = z
  .object({
    ...baseShape,
    paymentMethod: paymentMethodSchema,
    cashTenderedCents: z.number().int().min(0).optional().nullable(),
  })
  .superRefine((v, ctx) => checkBusinessRules(v, ctx));

export type OrderLineInput = z.infer<typeof orderLineSchema>;
export type HoldOrderInput = z.infer<typeof holdOrderSchema>;
export type PayOrderInput = z.infer<typeof payOrderSchema>;
