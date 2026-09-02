import { z } from "zod";

/**
 * Validates process.env at startup and fails loudly with a readable message
 * if a required variable is missing or malformed.
 */
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("mysql://"),
      "DATABASE_URL must be a MySQL connection string (mysql://…)",
    ),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `\n❌ Invalid environment variables:\n${issues}\n\n` +
      `Check your .env file (see .env.example).\n`,
  );
}

export const env = parsed.data;
