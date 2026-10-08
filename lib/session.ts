import "server-only";
import { redirect } from "next/navigation";
import { getPosSession, type PosSession } from "./auth/pos-session";
import { posLocale } from "./i18n/config";

/**
 * Who is working the till. This is the POS sign-in and nothing else: a Master
 * admin is not a cashier, so an order can never be booked under an account
 * that only administers the shop.
 */
export type SessionCashier = PosSession;

/**
 * The one gate in front of everything the till can do — pages and Server
 * Actions alike, which is why it takes no arguments and lives in one place.
 *
 * In a page it belongs in the page and not only in the layout: a layout and its
 * page render in parallel, so a layout-only redirect can still let the page's
 * data reach the streamed HTML. Call it before any query.
 *
 * In an action it is the *only* gate. A `"use server"` export is a public POST
 * endpoint that Next.js hands to whoever asks, and `proxy.ts` deliberately
 * checks no more than whether a cookie is present — so an action that does not
 * call this is an action anyone on the internet can run.
 *
 * An absent or expired session sends the browser to the sign-in screen rather
 * than returning an error the caller has to render: the till is German-only
 * (`posLocale`), so there is exactly one screen to land on, and a terminal whose
 * shift ran out ends up somewhere the cashier can act instead of on a toast.
 */
export async function requireCashier(): Promise<SessionCashier> {
  const cashier = await getPosSession();
  if (!cashier) redirect(`/${posLocale}/login`);
  return cashier;
}
