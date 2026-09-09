import "server-only";
import { cookies } from "next/headers";
import { db } from "../db";
import { createSessionToken, readSessionToken } from "./token";
import { POS_COOKIE, POS_COOKIE_PATH } from "./cookies";

/**
 * Session for the point of sale. Only a **cashier** account opens it: an admin
 * runs the Master panel and, if they also want to serve customers, gets a
 * cashier account of their own. Every order is then attributed to whoever is
 * actually signed in at the terminal.
 */

export { POS_COOKIE, POS_COOKIE_PATH };

/** A long shift; the terminal should not log itself out mid-service. */
export const POS_MAX_AGE_SECONDS = 60 * 60 * 12;

const SCOPE = "pos";

export function createPosToken(userId: number): string {
  return createSessionToken(SCOPE, userId, POS_MAX_AGE_SECONDS);
}

export interface PosSession {
  id: number;
  name: string;
  role: "ADMIN" | "CASHIER";
  avatarColor: string;
}

/**
 * The signed-in cashier, or null. Re-checked against the database on every
 * request, so deactivating or demoting someone ends their shift immediately.
 */
export async function getPosSession(): Promise<PosSession | null> {
  const token = (await cookies()).get(POS_COOKIE)?.value;
  if (!token) return null;
  const userId = readSessionToken(SCOPE, token);
  if (userId === null) return null;

  const user = await db.user.findFirst({
    where: { id: userId, isActive: true, role: "CASHIER" },
    select: { id: true, name: true, role: true, avatarColor: true },
  });
  return user;
}
