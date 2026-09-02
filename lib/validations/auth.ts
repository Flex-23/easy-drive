import { z } from "zod";

export const authPinSchema = z.object({
  userId: z.number().int().positive(),
  pin: z.string().regex(/^\d{4}$/, "pinLength"),
});

export type AuthPinInput = z.infer<typeof authPinSchema>;
