"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPin } from "@/lib/auth/pin";
import { pinGate } from "@/lib/auth/throttle";
import { isValidPin } from "@/lib/validations/auth";
import {
  POS_COOKIE,
  POS_COOKIE_PATH,
  POS_MAX_AGE_SECONDS,
  createPosToken,
} from "@/lib/auth/pos-session";
import { isLocale, defaultLocale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

/**
 * Point-of-sale sign-in. Cashier accounts only — an admin PIN is refused with a
 * message telling them to use a cashier account, so the Master panel and the
 * till stay two separate identities.
 */
export async function posLogin(pin: string): Promise<ActionResult<{ name: string }>> {
  const gate = await pinGate("pos");
  if (gate.locked) return { ok: false, error: "tooManyAttempts" };

  if (!isValidPin(pin)) {
    gate.fail();
    return { ok: false, error: "invalidPin" };
  }

  try {
    const users = await db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, pin: true },
    });
    const match = users.find((u) => verifyPin(pin, u.pin));
    if (!match) {
      gate.fail();
      return { ok: false, error: "invalidPin" };
    }
    // A correct PIN, but the wrong kind of account: say so plainly.
    if (match.role !== "CASHIER") {
      gate.fail();
      return { ok: false, error: "adminNotCashier" };
    }

    gate.pass();
    (await cookies()).set(POS_COOKIE, createPosToken(match.id), {
      httpOnly: true,
      sameSite: "lax",
      path: POS_COOKIE_PATH,
      maxAge: POS_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
    return { ok: true, data: { name: match.name } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

export async function posLogout(localeRaw: string): Promise<void> {
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  (await cookies()).delete({ name: POS_COOKIE, path: POS_COOKIE_PATH });
  redirect(`/${locale}/login`);
}
