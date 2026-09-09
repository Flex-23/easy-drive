import { z } from "zod";

/**
 * Validates process.env at startup and fails loudly with a readable message
 * if a required variable is missing or malformed.
 */
/**
 * An empty value in `.env` means "not set". `.env.example` ships the optional
 * keys blank, so without this a fresh copy of it would fail to start.
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const postgresUrl = (name: string) =>
  z
    .string()
    .min(1, `${name} is required`)
    .refine(
      (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
      `${name} must be a PostgreSQL connection string (postgresql://…)`,
    );

const envSchema = z.object({
  /** The pooled connection every query goes through (Supabase port 6543). */
  DATABASE_URL: postgresUrl("DATABASE_URL"),
  /**
   * A direct session connection (Supabase port 5432). Prisma migrations need
   * one, because a transaction-mode pooler cannot hold advisory locks or run
   * the DDL a migration performs.
   */
  DIRECT_URL: postgresUrl("DIRECT_URL"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /**
   * Signing key for the Master panel session cookie. Optional: when it is not
   * set the key is derived from DATABASE_URL, which keeps a fresh clone working
   * but means sessions survive only as long as that URL does. Set it in .env on
   * any machine that matters.
   */
  MASTER_SESSION_SECRET: optional(z.string().min(16)),
  /**
   * Shared key for the public order-ingestion endpoint. While it is unset the
   * endpoint stays open (fine on a shop-local machine); the moment it is set,
   * every POST must carry it. Set it before the port is reachable from outside.
   */
  ORDER_API_KEY: optional(z.string().min(16)),
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
