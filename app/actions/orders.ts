"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { buildOrderData, nextOrderNumber, decimalFromCents } from "@/lib/orders";
import { getSettings } from "@/lib/queries/settings";
import { getOrderForResume } from "@/lib/queries/orders";
import { getCurrentCashier } from "@/lib/session";
import { holdOrderSchema, payOrderSchema } from "@/lib/validations/order";
import { computeChange, centsToEuros } from "@/lib/pricing";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import type { ActionResult, ReceiptData } from "@/types/order";

function revalidateAll(locale: Locale) {
  for (const p of ["", "/dashboard", "/daily-report"]) {
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
  const locale = safeLocale((raw as { locale?: string })?.locale);
  const parsed = holdOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return fieldErrorsFrom(parsed.error);
  }
  const cashier = await getCurrentCashier();
  if (!cashier) return { ok: false, error: "genericError" };

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
// Create a pending kitchen order (no payment yet).
// ---------------------------------------------------------------------------
export async function createOrder(
  raw: unknown,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale((raw as { locale?: string })?.locale);
  const parsed = holdOrderSchema.safeParse(raw);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const cashier = await getCurrentCashier();
  if (!cashier) return { ok: false, error: "genericError" };

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
    return { ok: true, data: { id: order.id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

// ---------------------------------------------------------------------------
// Pay & finalize — writes the order transactionally, returns a receipt.
// ---------------------------------------------------------------------------
export async function payOrder(
  raw: unknown,
): Promise<ActionResult<ReceiptData>> {
  const locale = safeLocale((raw as { locale?: string })?.locale);
  const resumeId = (raw as { resumeOrderId?: number })?.resumeOrderId;
  const parsed = payOrderSchema.safeParse(raw);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const cashier = await getCurrentCashier();
  if (!cashier) return { ok: false, error: "genericError" };

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

  // Cash sufficiency is validated after the server computes the real total.
  if (parsed.data.paymentMethod === "CASH") {
    const tendered = parsed.data.cashTenderedCents ?? 0;
    if (tendered < built.totals.total) {
      return {
        ok: false,
        error: "cashInsufficient",
        fieldErrors: { cashTendered: "cashInsufficient" },
      };
    }
  }

  const now = new Date();
  try {
    const order = await db.$transaction(async (tx) => {
      if (resumeId) {
        await tx.order.deleteMany({ where: { id: resumeId, status: "HELD" } });
      }
      const orderNumber = await nextOrderNumber(tx, now);
      return tx.order.create({
        data: {
          orderNumber,
          type: parsed.data.type,
          status: "COMPLETED",
          source: "POS",
          customerId: parsed.data.customerId ?? null,
          addressId: parsed.data.addressId ?? null,
          tableNumber: parsed.data.tableNumber ?? null,
          subtotal: decimalFromCents(built.totals.subtotal),
          discountAmount: decimalFromCents(built.totals.discountAmount),
          deliveryFee: decimalFromCents(built.totals.deliveryFee),
          taxAmount: decimalFromCents(built.totals.taxAmount),
          total: decimalFromCents(built.totals.total),
          paymentMethod: parsed.data.paymentMethod,
          paidAt: now,
          cashierId: cashier.id,
          createdAt: now,
          lines: { create: built.linesCreate },
        },
        include: { lines: { include: { options: true } } },
      });
    });

    revalidateAll(locale);

    const tenderedCents =
      parsed.data.paymentMethod === "CASH"
        ? parsed.data.cashTenderedCents ?? 0
        : null;
    const receipt: ReceiptData = {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      type: order.type,
      tableNumber: order.tableNumber,
      customerName: null,
      cashierName: cashier.name,
      lines: order.lines.map((l) => ({
        name: l.itemNameSnapshot,
        quantity: l.quantity,
        unitPrice: Number(l.unitPrice.toString()),
        lineTotal: Number(l.lineTotal.toString()),
        options: l.options.map((o) => o.choiceNameSnapshot),
      })),
      subtotal: centsToEuros(built.totals.subtotal),
      discount: centsToEuros(built.totals.discountAmount),
      deliveryFee: centsToEuros(built.totals.deliveryFee),
      tax: centsToEuros(built.totals.taxAmount),
      total: centsToEuros(built.totals.total),
      paymentMethod: parsed.data.paymentMethod,
      cashTendered: tenderedCents === null ? null : centsToEuros(tenderedCents),
      change:
        tenderedCents === null
          ? null
          : centsToEuros(computeChange(built.totals.total, tenderedCents)),
      restaurantName: settings.restaurantName,
      receiptHeader: settings.receiptHeader,
      receiptFooter: settings.receiptFooter,
    };
    return { ok: true, data: receipt };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------
export async function cancelOrder(
  id: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale(localeRaw);
  try {
    await db.order.update({ where: { id }, data: { status: "CANCELLED" } });
    revalidateAll(locale);
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

export async function acceptOnlineOrder(
  id: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale(localeRaw);
  try {
    await db.order.update({
      where: { id, source: "ONLINE" },
      data: { status: "PREPARING" },
    });
    revalidateAll(locale);
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

export async function rejectOnlineOrder(
  id: number,
  localeRaw: string,
): Promise<ActionResult<{ id: number }>> {
  const locale = safeLocale(localeRaw);
  try {
    await db.order.update({
      where: { id, source: "ONLINE" },
      data: { status: "CANCELLED" },
    });
    revalidateAll(locale);
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

export async function resumeOrder(id: number, localeRaw: string) {
  const locale = safeLocale(localeRaw);
  const data = await getOrderForResume(id, locale);
  if (!data) return { ok: false as const, error: "genericError" };
  return { ok: true as const, data };
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
