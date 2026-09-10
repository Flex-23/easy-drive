import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { onlineOrderSchema } from "@/lib/validations/menu";
import { buildOrderData, nextOrderNumber, decimalFromCents } from "@/lib/orders";
import { setDefaultAddress } from "@/lib/customers";
import { getSettings } from "@/lib/queries/settings";
import { locales, defaultLocale } from "@/lib/i18n/config";
import { env } from "@/lib/env";

/**
 * POST /api/orders — ingestion path for an incoming online order.
 * Validated with the same Zod discipline as the POS; every price is recomputed
 * server-side. The order lands as source=ONLINE, status=PENDING and appears on
 * the orders board.
 *
 * A shop-local machine has no way in from outside, so the endpoint is open until
 * ORDER_API_KEY is set in .env — from then on every request must present it as
 * `X-Api-Key`. Set it before exposing the port to anything but localhost.
 */
export async function POST(request: Request) {
  if (env.ORDER_API_KEY && request.headers.get("x-api-key") !== env.ORDER_API_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = onlineOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "validation", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const data = parsed.data;

  if (data.type === "DELIVERY" && !data.address) {
    return NextResponse.json(
      { ok: false, error: "addressRequired" },
      { status: 422 },
    );
  }

  // Map item numbers to ids.
  const numbers = data.lines.map((l) => l.itemNumber);
  const items = await db.menuItem.findMany({
    where: { itemNumber: { in: numbers }, isActive: true },
    select: { id: true, itemNumber: true },
  });
  const byNumber = new Map(items.map((i) => [i.itemNumber, i.id]));
  const missing = numbers.filter((n) => !byNumber.has(n));
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "unknown_items", items: missing },
      { status: 422 },
    );
  }

  const settings = await getSettings();
  const deliveryCents =
    data.type === "DELIVERY" ? Math.round(settings.deliveryFee * 100) : 0;

  const built = await buildOrderData(
    data.lines.map((l) => ({
      itemId: byNumber.get(l.itemNumber)!,
      quantity: l.quantity,
      choiceIds: l.choiceIds,
      kitchenNotes: l.kitchenNotes,
    })),
    0,
    deliveryCents,
    settings.taxRate,
    defaultLocale,
  );
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 422 });
  }

  const owner = await db.user.findFirst({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!owner) {
    return NextResponse.json({ ok: false, error: "no_staff" }, { status: 500 });
  }

  try {
    const order = await db.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { phone: data.customer.phone },
        create: { name: data.customer.name, phone: data.customer.phone },
        update: { name: data.customer.name },
        select: { id: true },
      });
      // The address on the order, not the one that happened to be on file: a
      // returning customer may have moved, or may never have had one at all.
      const address = data.address
        ? await setDefaultAddress(tx, customer.id, data.address)
        : null;
      const orderNumber = await nextOrderNumber(tx, new Date());
      return tx.order.create({
        data: {
          orderNumber,
          type: data.type,
          status: "PENDING",
          source: "ONLINE",
          customerId: customer.id,
          addressId: data.type === "DELIVERY" ? address?.id ?? null : null,
          subtotal: decimalFromCents(built.totals.subtotal),
          discountAmount: decimalFromCents(built.totals.discountAmount),
          deliveryFee: decimalFromCents(built.totals.deliveryFee),
          taxAmount: decimalFromCents(built.totals.taxAmount),
          total: decimalFromCents(built.totals.total),
          cashierId: owner.id,
          lines: { create: built.linesCreate },
        },
      });
    });

    // An incoming order lands on the orders board as a pending delivery.
    for (const l of locales) revalidatePath(`/${l}/drivers`);
    return NextResponse.json(
      { ok: true, orderNumber: order.orderNumber, id: order.id },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
