import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/**
 * Prisma client singleton. The globalThis guard prevents dev hot-reload from
 * opening a new connection pool on every module reload and exhausting MySQL.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
