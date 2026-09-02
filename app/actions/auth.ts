"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPin } from "@/lib/auth/pin";
import { authPinSchema } from "@/lib/validations/auth";
import { setCashierCookie, clearCashierCookie } from "@/lib/session";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

function safeLocale(v: unknown): Locale {
  return typeof v === "string" && isLocale(v) ? v : defaultLocale;
}

// Simple in-memory rate limiter for failed PIN attempts (per user).
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;
const attempts = new Map<number, { count: number; first: number; lockedUntil: number }>();

export async function authenticateUserPin(
  raw: unknown,
): Promise<ActionResult<{ id: number }>> {
  const parsed = authPinSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "pinLength",
      fieldErrors: { pin: parsed.error.issues[0]?.message ?? "pinLength" },
    };
  }
  const { userId, pin } = parsed.data;
  const now = Date.now();
  const rec = attempts.get(userId);

  if (rec && rec.lockedUntil > now) {
    return { ok: false, error: "tooManyAttempts" };
  }

  const user = await db.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, pin: true },
  });
  if (!user || !verifyPin(pin, user.pin)) {
    const cur = rec && now - rec.first < WINDOW_MS
      ? rec
      : { count: 0, first: now, lockedUntil: 0 };
    cur.count += 1;
    if (cur.count >= MAX_ATTEMPTS) {
      cur.lockedUntil = now + LOCK_MS;
      cur.count = 0;
      cur.first = now;
    }
    attempts.set(userId, cur);
    return { ok: false, error: "wrongPin", fieldErrors: { pin: "wrongPin" } };
  }

  attempts.delete(userId);
  await setCashierCookie(user.id);
  return { ok: true, data: { id: user.id } };
}

export async function signOutAndSwitch(localeRaw: string): Promise<void> {
  const locale = safeLocale(localeRaw);
  await clearCashierCookie();
  redirect(`/${locale}/switch-user`);
}
