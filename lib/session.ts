import "server-only";
import { db } from "./db";

/**
 * Single active-user context. The app runs under one active user for now; a
 * dedicated admin/role-management system will replace this later. The current
 * user is the first active staff member (admins first).
 */
export interface SessionCashier {
  id: number;
  name: string;
  role: "ADMIN" | "CASHIER";
  avatarColor: string;
}

export async function getCurrentCashier(): Promise<SessionCashier | null> {
  const user = await db.user.findFirst({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { id: "asc" }],
    select: { id: true, name: true, role: true, avatarColor: true },
  });
  return user;
}
