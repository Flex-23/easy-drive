"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, NOBODY } from "@/lib/auth/password";
import { loginGate } from "@/lib/auth/throttle";
import { credentialsSchema } from "@/lib/validations/auth";
import {
  POS_COOKIE,
  POS_COOKIE_PATH,
  POS_MAX_AGE_SECONDS,
  createPosToken,
} from "@/lib/auth/pos-session";
import { isLocale, defaultLocale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

/**
 * Point-of-sale sign-in. Cashier accounts only — an admin's credentials are
 * refused with a message telling them to use a cashier account, so the Master
 * panel and the till stay two separate identities.
 */
export async function posLogin(raw: unknown): Promise<ActionResult<{ name: string }>> {
  const gate = await loginGate("pos");
  if (gate.locked) return { ok: false, error: "tooManyAttempts" };

  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) {
    gate.fail();
    return { ok: false, error: "invalidCredentials" };
  }
  const { email, password } = parsed.data;

  try {
    const user = await db.user.findUnique({
      where: { email, isActive: true },
      select: { id: true, name: true, role: true, password: true },
    });
    // An unknown address is checked against a throwaway hash so it takes as
    // long as a wrong password: the answer never says which half was wrong.
    if (!verifyPassword(password, user?.password ?? NOBODY) || !user) {
      gate.fail();
      return { ok: false, error: "invalidCredentials" };
    }
    // Right credentials, but the wrong kind of account: say so plainly.
    if (user.role !== "CASHIER") {
      gate.fail();
      return { ok: false, error: "adminNotCashier" };
    }

    gate.pass();
    (await cookies()).set(POS_COOKIE, createPosToken(user.id), {
      httpOnly: true,
      sameSite: "lax",
      path: POS_COOKIE_PATH,
      maxAge: POS_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
    return { ok: true, data: { name: user.name } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

export async function posLogout(localeRaw: string): Promise<void> {
  const locale = isLocale(localeRaw) ? localeRaw : defaultLocale;
  (await cookies()).delete({ name: POS_COOKIE, path: POS_COOKIE_PATH });
  redirect(`/${locale}/login`);
}
