"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, NOBODY } from "@/lib/auth/password";
import { loginGate } from "@/lib/auth/throttle";
import { credentialsSchema } from "@/lib/validations/auth";
import {
  PANEL_COOKIE,
  PANEL_COOKIE_PATH,
  PANEL_MAX_AGE_SECONDS,
  createPanelToken,
} from "@/lib/auth/master-session";
import type { ActionResult } from "@/types/order";

/** Sign-in for the Master panel: any active admin's e-mail and password opens it. */
export async function panelLogin(raw: unknown): Promise<ActionResult<{ name: string }>> {
  const gate = await loginGate("panel");
  if (gate.locked) return { ok: false, error: "tooManyAttempts" };

  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) {
    gate.fail();
    return { ok: false, error: "invalidCredentials" };
  }
  const { email, password } = parsed.data;

  try {
    const admin = await db.user.findUnique({
      where: { email, isActive: true, role: "ADMIN" },
      select: { id: true, name: true, password: true },
    });
    // See posLogin: an unknown address costs the same time as a wrong password.
    if (!verifyPassword(password, admin?.password ?? NOBODY) || !admin) {
      gate.fail();
      return { ok: false, error: "invalidCredentials" };
    }

    gate.pass();
    (await cookies()).set(PANEL_COOKIE, createPanelToken(admin.id), {
      httpOnly: true,
      sameSite: "lax",
      path: PANEL_COOKIE_PATH,
      maxAge: PANEL_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
    return { ok: true, data: { name: admin.name } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

export async function panelLogout(): Promise<void> {
  (await cookies()).delete({ name: PANEL_COOKIE, path: PANEL_COOKIE_PATH });
  redirect("/panel/login");
}
