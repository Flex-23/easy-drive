import "server-only";
import { redirect } from "next/navigation";
import { getPosSession, type PosSession } from "./auth/pos-session";
import type { Locale } from "./i18n/config";

/**
 * Who is working the till. This is the POS sign-in and nothing else: a Master
 * admin is not a cashier, so an order can never be booked under an account
 * that only administers the shop.
 */
export type SessionCashier = PosSession;

export async function getCurrentCashier(): Promise<SessionCashier | null> {
  return getPosSession();
}

/**
 * Guard for every till page. It belongs in the page and not only in the layout:
 * a layout and its page render in parallel, so a layout-only redirect can still
 * let the page's data reach the streamed HTML. Call this before any query.
 */
export async function requireCashier(locale: Locale): Promise<SessionCashier> {
  const cashier = await getPosSession();
  if (!cashier) redirect(`/${locale}/login`);
  return cashier;
}
