"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

function safeLocale(v: string): Locale {
  return isLocale(v) ? v : defaultLocale;
}

function revalidate(locale: Locale) {
  revalidatePath(`/${locale}/drivers`);
  revalidatePath(`/${locale}/dashboard`);
}

const DISPATCHABLE = ["PENDING", "PREPARING", "READY"] as const;

/** Assign a delivery order to a driver by number; it moves to "in transit". */
export async function assignDriver(
  orderId: number,
  driverNumber: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale(localeRaw);
  if (!Number.isInteger(driverNumber) || driverNumber < 1 || driverNumber > 999) {
    return { ok: false, error: "genericError" };
  }
  try {
    const res = await db.order.updateMany({
      where: { id: orderId, type: "DELIVERY", status: { in: [...DISPATCHABLE] } },
      data: { driverNumber, status: "READY" },
    });
    if (res.count === 0) return { ok: false, error: "genericError" };
    revalidate(locale);
    return { ok: true, data: { id: orderId } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

/** Return an assigned order to the unassigned column. */
export async function unassignDriver(
  orderId: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale(localeRaw);
  try {
    await db.order.update({
      where: { id: orderId },
      data: { driverNumber: null, status: "PREPARING" },
    });
    revalidate(locale);
    return { ok: true, data: { id: orderId } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

/** Flag the order as paid online (e.g. via the driver terminal). */
export async function markPaidOnline(
  orderId: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale(localeRaw);
  try {
    await db.order.update({
      where: { id: orderId },
      data: { paymentMethod: "ONLINE", paidAt: new Date() },
    });
    revalidate(locale);
    return { ok: true, data: { id: orderId } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

/** Cancel the selected delivery order. */
export async function cancelDriverOrder(
  orderId: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale(localeRaw);
  try {
    await db.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", driverNumber: null },
    });
    revalidate(locale);
    return { ok: true, data: { id: orderId } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}
