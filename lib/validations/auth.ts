import { z } from "zod";

/**
 * The shape of a PIN, in one place: the two sign-in actions and the staff form
 * all measure it against this, so "four digits" can never drift between them.
 */
export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "pinLength");

export function isValidPin(value: string): boolean {
  return pinSchema.safeParse(value).success;
}
