import "server-only";
import { db } from "../db";

/** Real database health check used by the top-bar status indicator. */
export async function checkDbHealth(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
