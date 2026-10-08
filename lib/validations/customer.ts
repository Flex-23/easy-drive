import { z } from "zod";

/** German-style phone: +49 / 0 prefix, digits with optional spaces, / or -. */
const germanPhone = /^(\+49[\s/-]?|0)[0-9][0-9\s/-]{5,15}$/;

export const customerSchema = z.object({
  id: z.number().int().positive().optional().nullable(),
  name: z.string().trim().min(1, "nameRequired").max(120),
  phone: z
    .string()
    .trim()
    .min(1, "invalidPhone")
    .regex(germanPhone, "invalidPhone"),
  email: z
    .union([z.string().trim().email("invalidEmail"), z.literal("")])
    .optional()
    .nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  address: z
    .object({
      street: z.string().trim().min(1, "required").max(120),
      houseNumber: z.string().trim().min(1, "required").max(20),
      area: z.string().trim().max(80).optional().nullable(),
      city: z.string().trim().min(1, "required").max(80),
      postalCode: z.string().trim().max(12).optional().nullable(),
      notes: z.string().trim().max(200).optional().nullable(),
    })
    .optional()
    .nullable(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
