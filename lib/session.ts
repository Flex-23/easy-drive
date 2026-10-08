import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "./db";
import { getPosSession, type PosSession } from "./auth/pos-session";

/**
 * Who is working the till. The POS has no sign-in of its own any more: anyone
 * with the link opens the New Order screen directly. Orders must still be
 * booked under a real user, so a visit without a sign-in cookie runs as the
 * shop's **default cashier**. The Master panel keeps its own sign-in.
 */
export type SessionCashier = PosSession;

/**
 * The default cashier the till runs as when nobody signed in: the first active
 * cashier on file, or any active user if the shop has defined no cashier yet.
 * Memoised for the request so an unauthenticated page costs one lookup, not one
 * per guard.
 */
const defaultCashier = cache(async (): Promise<SessionCashier | null> => {
  const select = { id: true, name: true, role: true, avatarColor: true } as const;
  return (
    (await db.user.findFirst({
      where: { isActive: true, role: "CASHIER" },
      orderBy: { id: "asc" },
      select,
    })) ??
    (await db.user.findFirst({ where: { isActive: true }, orderBy: { id: "asc" }, select }))
  );
});

/**
 * The guard in front of everything the till can do — pages and Server Actions
 * alike, which is why it takes no arguments and lives in one place.
 *
 * It no longer refuses an unauthenticated caller: login is off, so it resolves
 * the current cashier from the sign-in cookie if one happens to be present, and
 * otherwise the shop's default cashier. Only a database with no users at all
 * leaves nobody to be — a 404 then, never a redirect loop.
 *
 * In an action it is still the one place the current user is resolved, so every
 * `"use server"` export that writes on the cashier's behalf must call it.
 */
export async function requireCashier(): Promise<SessionCashier> {
  const cashier = (await getPosSession()) ?? (await defaultCashier());
  if (!cashier) notFound();
  return cashier;
}
