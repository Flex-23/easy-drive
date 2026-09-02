import { z } from "zod";

/** Incoming online order (external channel) — validated identically to POS. */
export const onlineOrderLineSchema = z.object({
  itemNumber: z.number().int().positive(),
  quantity: z.number().int().min(1, "minQuantity"),
  choiceIds: z.array(z.number().int().positive()).default([]),
  kitchenNotes: z.string().max(280).optional(),
});

export const onlineOrderSchema = z.object({
  type: z.enum(["PICKUP", "DELIVERY"]).default("DELIVERY"),
  customer: z.object({
    name: z.string().trim().min(1, "nameRequired").max(120),
    phone: z.string().trim().min(3, "invalidPhone").max(24),
  }),
  address: z
    .object({
      street: z.string().trim().min(1, "required"),
      houseNumber: z.string().trim().min(1, "required"),
      mahalla: z.string().trim().optional().nullable(),
      area: z.string().trim().optional().nullable(),
      postalCode: z.string().trim().optional().nullable(),
      city: z.string().trim().min(1, "required"),
    })
    .optional()
    .nullable(),
  lines: z.array(onlineOrderLineSchema).min(1, "emptyOrder"),
});

export type OnlineOrderInput = z.infer<typeof onlineOrderSchema>;
