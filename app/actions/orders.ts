"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { buildOrderData, nextOrderNumber, decimalFromCents } from "@/lib/orders";
import { getSettings } from "@/lib/queries/settings";
import { getOrderForResume } from "@/lib/queries/orders";
import { getOrderForTicket, type DriverOrder } from "@/lib/queries/drivers";
import { getCustomer } from "@/lib/queries/customers";
import { requireCashier } from "@/lib/session";
import { holdOrderSchema } from "@/lib/validations/order";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

function revalidateAll(locale: Locale) {
  for (const p of ["", "/daily-report", "/drivers"]) {
    revalidatePath(`/${locale}${p}`);
  }
}

function safeLocale(v: unknown): Locale {
  return typeof v === "string" && isLocale(v) ? v : defaultLocale;
}

// ---------------------------------------------------------------------------
// Hold (park) an order — resumable from any terminal.
// ---------------------------------------------------------------------------
export async function holdOrder(
  raw: unknown,
): Promise<ActionResult<{ id: number }>> {
  const cashier = await requireCashier();
  const locale = safeLocale((raw as { locale?: string })?.locale);
  const parsed = holdOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return fieldErrorsFrom(parsed.error);
  }

  const settings = await getSettings();
  const deliveryCents =
    parsed.data.type === "DELIVERY"
      ? Math.round(settings.deliveryFee * 100)
      : 0;
  const built = await buildOrderData(
    parsed.data.lines,
    parsed.data.discountCents,
    deliveryCents,
    settings.taxRate,
    locale,
  );
  if (!built.ok) return { ok: false, error: built.error };

  try {
    const order = await db.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx, new Date());
      return tx.order.create({
        data: {
          orderNumber,
          type: parsed.data.type,
          status: "HELD",
          source: "POS",
          customerId: parsed.data.customerId ?? null,
          addressId: parsed.data.addressId ?? null,
          tableNumber: parsed.data.tableNumber ?? null,
          subtotal: decimalFromCents(built.totals.subtotal),
          discountAmount: decimalFromCents(built.totals.discountAmount),
          deliveryFee: decimalFromCents(built.totals.deliveryFee),
          taxAmount: decimalFromCents(built.totals.taxAmount),
          total: decimalFromCents(built.totals.total),
          cashierId: cashier.id,
          lines: { create: built.linesCreate },
        },
      });
    });
    revalidateAll(locale);
    return { ok: true, data: { id: order.id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

// ---------------------------------------------------------------------------
// Send the finished cart to the orders board — payment happens there.
// ---------------------------------------------------------------------------
export async function createOrder(
  raw: unknown,
): Promise<ActionResult<{ id: number; ticket: DriverOrder | null }>> {
  const cashier = await requireCashier();
  const locale = safeLocale((raw as { locale?: string })?.locale);
  const parsed = holdOrderSchema.safeParse(raw);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const settings = await getSettings();
  const deliveryCents =
    parsed.data.type === "DELIVERY" ? Math.round(settings.deliveryFee * 100) : 0;
  const built = await buildOrderData(
    parsed.data.lines,
    parsed.data.discountCents,
    deliveryCents,
    settings.taxRate,
    locale,
  );
  if (!built.ok) return { ok: false, error: built.error };

  try {
    const order = await db.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx, new Date());
      return tx.order.create({
        data: {
          orderNumber,
          type: parsed.data.type,
          status: "PENDING",
          source: "POS",
          customerId: parsed.data.customerId ?? null,
          addressId: parsed.data.addressId ?? null,
          tableNumber: parsed.data.tableNumber ?? null,
          subtotal: decimalFromCents(built.totals.subtotal),
          discountAmount: decimalFromCents(built.totals.discountAmount),
          deliveryFee: decimalFromCents(built.totals.deliveryFee),
          taxAmount: decimalFromCents(built.totals.taxAmount),
          total: decimalFromCents(built.totals.total),
          cashierId: cashier.id,
          lines: { create: built.linesCreate },
        },
      });
    });
    revalidateAll(locale);
    // The till prints the customer copy and the kitchen bon straight away, so
    // the finished order travels back with the answer.
    const ticket = await getOrderForTicket(order.id);
    return { ok: true, data: { id: order.id, ticket } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

/**
 * Load a parked bill back into the cart. The customer travels with it, so the
 * cashier does not have to look them up again.
 *
 * Recalling it also unparks it: the bill lives in the cart from here on, and
 * saving or re-parking writes a fresh row. The list therefore only ever shows
 * bills that are genuinely still waiting.
 */
export async function resumeOrder(id: number, localeRaw: string) {
  await requireCashier();
  const locale = safeLocale(localeRaw);

  // Claim the bill before reading it, and claim it by moving it out of HELD
  // rather than by deleting it. The update is the lock: a second terminal
  // recalling the same bill at the same moment matches no rows and is told so.
  // And because the row survives, a browser that never receives this answer
  // costs nobody the bill — a recalled bill is a DRAFT, which no screen and no
  // report counts. `deleteHeldOrder` stays the only way one is thrown away.
  const claimed = await db.order.updateMany({
    where: { id, status: "HELD" },
    data: { status: "DRAFT" },
  });
  if (claimed.count === 0) return { ok: false as const, error: "genericError" };

  const data = await getOrderForResume(id, locale);
  if (!data) return { ok: false as const, error: "genericError" };

  const customer = data.customerId ? await getCustomer(data.customerId) : null;
  revalidateAll(locale);
  return { ok: true as const, data: { ...data, customer } };
}

/** Throw a parked bill away without ringing it up. */
export async function deleteHeldOrder(
  id: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  await requireCashier();
  const locale = safeLocale(localeRaw);
  try {
    const res = await db.order.deleteMany({ where: { id, status: "HELD" } });
    if (res.count === 0) return { ok: false, error: "genericError" };
    revalidateAll(locale);
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function fieldErrorsFrom(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): { ok: false; error: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "genericError", fieldErrors };
}
