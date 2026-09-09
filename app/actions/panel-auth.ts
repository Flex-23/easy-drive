"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPin } from "@/lib/auth/pin";
import { pinGate } from "@/lib/auth/throttle";
import { isValidPin } from "@/lib/validations/auth";
import {
  PANEL_COOKIE,
  PANEL_COOKIE_PATH,
  PANEL_MAX_AGE_SECONDS,
  createPanelToken,
} from "@/lib/auth/master-session";
import type { ActionResult } from "@/types/order";

/** Sign-in for the Master panel: any active admin's PIN opens it. */
export async function panelLogin(pin: string): Promise<ActionResult<{ name: string }>> {
  const gate = await pinGate("panel");
  if (gate.locked) return { ok: false, error: "tooManyAttempts" };

  if (!isValidPin(pin)) {
    gate.fail();
    return { ok: false, error: "invalidPin" };
  }

  try {
    const admins = await db.user.findMany({
      where: { isActive: true, role: "ADMIN" },
      select: { id: true, name: true, pin: true },
    });
    const match = admins.find((a) => verifyPin(pin, a.pin));
    if (!match) {
      gate.fail();
      return { ok: false, error: "invalidPin" };
    }

    gate.pass();
    (await cookies()).set(PANEL_COOKIE, createPanelToken(match.id), {
      httpOnly: true,
      sameSite: "lax",
      path: PANEL_COOKIE_PATH,
      maxAge: PANEL_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
    return { ok: true, data: { name: match.name } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

export async function panelLogout(): Promise<void> {
  (await cookies()).delete({ name: PANEL_COOKIE, path: PANEL_COOKIE_PATH });
  redirect("/panel/login");
}
