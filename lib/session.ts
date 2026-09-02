import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Locale } from "./i18n/config";

const CASHIER_COOKIE = "easy_drive_cashier";

export interface SessionCashier {
  id: number;
  name: string;
  role: "ADMIN" | "CASHIER";
  avatarColor: string;
}

export async function getCurrentCashier(): Promise<SessionCashier | null> {
  const store = await cookies();
  const raw = store.get(CASHIER_COOKIE)?.value;
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isInteger(id)) return null;
  const user = await db.user.findFirst({
    where: { id, isActive: true },
    select: { id: true, name: true, role: true, avatarColor: true },
  });
  return user;
}

export async function requireCashier(locale: Locale): Promise<SessionCashier> {
  const cashier = await getCurrentCashier();
  if (!cashier) redirect(`/${locale}/switch-user`);
  return cashier;
}

export async function setCashierCookie(userId: number): Promise<void> {
  const store = await cookies();
  store.set(CASHIER_COOKIE, String(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearCashierCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CASHIER_COOKIE);
}
