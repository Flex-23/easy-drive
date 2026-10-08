"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCashier } from "@/lib/session";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

/**
 * The orders board's mutations: hand an order to a driver, settle it, void it.
 * Each is a public POST endpoint, so each opens with `requireCashier()` — money
 * moves through here, and nothing but that call stands in front of it.
 */

function safeLocale(v: string): Locale {
  return isLocale(v) ? v : defaultLocale;
}

function revalidate(locale: Locale) {
  revalidatePath(`/${locale}/drivers`);
  revalidatePath(`/${locale}/daily-report`);
}

const DISPATCHABLE = ["PENDING", "PREPARING", "READY"] as const;

/**
 * Hand an order to a driver by number; it moves to "in transit". A pickup can
 * go too — a customer who phoned ahead sometimes asks for it to be brought
 * round after all, and the money then travels with the driver like any run.
 */
export async function assignDriver(
  orderId: number,
  driverNumber: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  await requireCashier();
  const locale = safeLocale(localeRaw);
  if (!Number.isInteger(driverNumber) || driverNumber < 1 || driverNumber > 999) {
    return { ok: false, error: "genericError" };
  }
  try {
    const res = await db.order.updateMany({
      where: { id: orderId, status: { in: [...DISPATCHABLE] } },
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
  await requireCashier();
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

/** Cancel the selected order. */
export async function cancelDriverOrder(
  orderId: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  await requireCashier();
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

/**
 * Take a cancellation back. The order returns to the board as pending — its
 * driver was cleared when it was cancelled, but a payment it had already taken
 * is kept, so an order paid before the mistake comes back paid.
 */
export async function restoreOrder(
  orderId: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  await requireCashier();
  const locale = safeLocale(localeRaw);
  try {
    const res = await db.order.updateMany({
      where: { id: orderId, status: "CANCELLED" },
      data: { status: "PENDING" },
    });
    if (res.count === 0) return { ok: false, error: "genericError" };
    revalidate(locale);
    return { ok: true, data: { id: orderId } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}
