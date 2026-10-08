import { z } from "zod";

/**
 * What a sign-in is made of, in one place: the two sign-in actions and the
 * staff form all measure against these, so the rules can never drift.
 */

/** Lower-cased on the way in — nobody should be locked out by a capital. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "required")
  .max(120)
  .email("invalidEmail");

/** A new password. Short, because it is typed at a till at the start of a shift. */
export const passwordSchema = z.string().min(6, "passwordLength").max(72);

/** What the sign-in form sends. The password is only checked for presence here. */
export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "required").max(72),
});
export type Credentials = z.infer<typeof credentialsSchema>;
