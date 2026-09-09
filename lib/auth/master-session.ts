import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { createSessionToken, readSessionToken } from "./token";
import { PANEL_COOKIE, PANEL_COOKIE_PATH } from "./cookies";

/**
 * Session for the Master panel (`/panel`). Entirely separate from the POS
 * sign-in: its own cookie, its own signing scope, and admins only. Holding one
 * grants nothing on the POS, and vice versa.
 */

export { PANEL_COOKIE, PANEL_COOKIE_PATH };

/** One shift. */
export const PANEL_MAX_AGE_SECONDS = 60 * 60 * 8;

const SCOPE = "panel";

export function createPanelToken(userId: number): string {
  return createSessionToken(SCOPE, userId, PANEL_MAX_AGE_SECONDS);
}

export interface PanelSession {
  userId: number;
  name: string;
}

/**
 * The signed-in admin, or null. Re-checks the database every time, so removing
 * or deactivating an admin ends their panel session on the next request.
 */
export async function getPanelSession(): Promise<PanelSession | null> {
  const token = (await cookies()).get(PANEL_COOKIE)?.value;
  if (!token) return null;
  const userId = readSessionToken(SCOPE, token);
  if (userId === null) return null;

  const user = await db.user.findFirst({
    where: { id: userId, isActive: true, role: "ADMIN" },
    select: { id: true, name: true },
  });
  return user ? { userId: user.id, name: user.name } : null;
}

/**
 * Guard for every panel page — a layout renders in parallel with its page, so
 * the page must refuse on its own before it queries anything.
 */
export async function requirePanel(): Promise<PanelSession> {
  const session = await getPanelSession();
  if (!session) redirect("/panel/login");
  return session;
}
