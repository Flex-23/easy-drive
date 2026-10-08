"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { locales } from "@/lib/i18n/config";
import { staffSchema } from "@/lib/validations/master";
import { getPanelSession, unauthorized } from "@/lib/auth/master-session";
import type { ActionResult } from "@/types/order";

/**
 * Staff management. The active user shown in the top bar is resolved from this
 * table (admins first), so every mutation guards one invariant: the shop can
 * never be left without an active admin.
 */

function revalidateStaff() {
  for (const l of locales) revalidatePath(`/${l}`, "layout");
}

/** Would this change leave zero active admins? */
async function leavesNoAdmin(
  id: number,
  next: { role: "ADMIN" | "CASHIER"; isActive: boolean } | null,
): Promise<boolean> {
  const current = await db.user.findUnique({
    where: { id },
    select: { role: true, isActive: true },
  });
  if (!current) return false;
  const wasAdmin = current.role === "ADMIN" && current.isActive;
  if (!wasAdmin) return false;
  const staysAdmin = next !== null && next.role === "ADMIN" && next.isActive;
  if (staysAdmin) return false;
  const others = await db.user.count({
    where: { isActive: true, role: "ADMIN", id: { not: id } },
  });
  return others === 0;
}

/** Create a staff member, or update one (an empty password keeps the current one). */
export async function saveStaff(
  raw: unknown,
): Promise<ActionResult<{ id: number }>> {
  if (!(await getPanelSession())) return unauthorized;
  const parsed = staffSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const key = i.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = i.message;
    }
    return { ok: false, error: "genericError", fieldErrors };
  }
  const d = parsed.data;

  try {
    if (d.id === undefined) {
      const created = await db.user.create({
        data: {
          name: d.name,
          email: d.email,
          role: d.role,
          isActive: d.isActive,
          avatarColor: d.avatarColor,
          password: hashPassword(d.password as string),
        },
        select: { id: true },
      });
      revalidateStaff();
      return { ok: true, data: { id: created.id } };
    }

    const id = d.id;
    if (await leavesNoAdmin(id, { role: d.role, isActive: d.isActive })) {
      return { ok: false, error: "lastAdmin" };
    }
    await db.user.update({
      where: { id },
      data: {
        name: d.name,
        email: d.email,
        role: d.role,
        isActive: d.isActive,
        avatarColor: d.avatarColor,
        ...(d.password ? { password: hashPassword(d.password) } : {}),
      },
    });
    revalidateStaff();
    return { ok: true, data: { id } };
  } catch (e) {
    // Two people cannot share a sign-in address.
    if ((e as { code?: string } | null)?.code === "P2002") {
      return { ok: false, error: "genericError", fieldErrors: { email: "emailExists" } };
    }
    return { ok: false, error: "genericError" };
  }
}

/**
 * Delete a staff member. Refused once they have rung up orders (those rows
 * reference the user) and refused if they are the last active admin.
 */
export async function deleteStaff(
  id: number,
): Promise<ActionResult<{ id: number }>> {
  if (!(await getPanelSession())) return unauthorized;
  try {
    const orders = await db.order.count({ where: { cashierId: id } });
    if (orders > 0) return { ok: false, error: "staffInUse" };
    if (await leavesNoAdmin(id, null)) return { ok: false, error: "lastAdmin" };
    await db.user.delete({ where: { id } });
    revalidateStaff();
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}
