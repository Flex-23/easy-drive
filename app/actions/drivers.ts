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
  revalidatePath(`/${locale}/daily-report`);
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

/**
 * Settle an order at the counter. A pickup order is finished by this — the
 * customer has paid and takes the bag — while a delivery paid this way comes off
 * its driver, since there is no longer any money to collect on the doorstep.
 */
async function settle(
  orderId: number,
  method: "CASH" | "ONLINE",
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale(localeRaw);
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { type: true, status: true },
    });
    if (!order || order.status === "CANCELLED") {
      return { ok: false, error: "genericError" };
    }

    await db.order.update({
      where: { id: orderId },
      data: {
        paymentMethod: method,
        paidAt: new Date(),
        driverNumber: null,
        status: order.type === "PICKUP" ? "COMPLETED" : "PREPARING",
      },
    });
    revalidate(locale);
    return { ok: true, data: { id: orderId } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

/** Money in the drawer. */
export async function markPaidCash(orderId: number, localeRaw: string) {
  return settle(orderId, "CASH", localeRaw);
}

/** Money that arrived electronically. */
export async function markPaidOnline(orderId: number, localeRaw: string) {
  return settle(orderId, "ONLINE", localeRaw);
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
