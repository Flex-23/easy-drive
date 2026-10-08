"use server";

import { db } from "@/lib/db";
import { requireCashier } from "@/lib/session";
import { getSettings } from "@/lib/queries/settings";
import { getOrderForTicket, getDriverBoard } from "@/lib/queries/drivers";
import { getDailyReport } from "@/lib/queries/orders";
import { listPrinters, printDocument } from "@/lib/printing/printer";
import { buildDocument } from "@/lib/printing/document";
import { widthFromColumns } from "@/lib/printing/lines";
import {
  customerReceipt,
  kitchenTicket,
  addressLabel,
  dailyReportTicket,
  pendingReportTicket,
  processedReportTicket,
  testTicket,
  type ReportGroup,
  type TicketContext,
} from "@/lib/printing/tickets";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { posLocale } from "@/lib/i18n/config";
import type { DriverOrder } from "@/lib/queries/drivers";
import type { ActionResult } from "@/types/order";

/**
 * Printing never involves the browser: each action builds the slip here on the
 * server as directive lines plus its QR images (see `lib/printing/lines.ts`) and
 * gets it to a printer one of two ways.
 *
 * On the shop machine it goes straight to `print-receipt.ps1`, which draws it
 * with GDI+ and hands the page to the spooler. On a host with no printer — the
 * cloud copy of this app — the finished document is queued in `PrintJob`
 * instead, and the agent running beside the printer (`print/print-agent.mjs`)
 * pulls it and runs the very same script there. Both paths produce the same
 * paper, because both send the same finished document to the same renderer.
 */

type PrintOutcome = ActionResult<{ queued: boolean }>;

async function context(): Promise<TicketContext & { printerName: string }> {
  const settings = await getSettings();
  return {
    widthMm: widthFromColumns(settings.printerColumns),
    restaurantName: settings.restaurantName,
    printerName: settings.printerName,
  };
}

async function send(
  lines: string[],
  ctx: TicketContext & { printerName: string },
  label: string,
): Promise<PrintOutcome> {
  const { printerName } = ctx;
  if (!printerName.trim()) return { ok: false, error: "printerNotConfigured" };

  // The QR codes become PNGs here, on the server, so neither printing path has
  // to carry a QR encoder and the agent stays a dependency-free script.
  const doc = await buildDocument(lines, ctx.widthMm);

  // No printer on this machine means this is the cloud copy: hand the finished
  // job to the queue and let the shop's agent take it from there.
  if (process.platform !== "win32") {
    // The queue column is opaque bytes; the document travels through it as UTF-8
    // JSON. Copied into a plain Uint8Array because a Node Buffer can sit on a
    // SharedArrayBuffer, which is not what the Bytes column accepts.
    await db.printJob.create({
      data: {
        label,
        payload: new Uint8Array(Buffer.from(JSON.stringify(doc), "utf8")),
        printerName,
      },
    });
    return { ok: true, data: { queued: true } };
  }

  const result = await printDocument(doc, printerName);
  return result.ok ? { ok: true, data: { queued: false } } : { ok: false, error: result.error };
}

/** The printers Windows knows about — the Settings screen offers these. */
export async function systemPrinters(): Promise<string[]> {
  await requireCashier();
  return listPrinters();
}

/** A slip to prove the printer is reachable and the width is right. */
export async function printTest(): Promise<PrintOutcome> {
  await requireCashier();
  const ctx = await context();
  return send(testTicket(ctx), ctx, "Testdruck");
}

export type TicketKind = "receipt" | "kitchen" | "label";

/** One of an order's three papers, printed on demand from the orders board. */
export async function printOrderTicket(
  orderId: number,
  kind: TicketKind,
): Promise<PrintOutcome> {
  await requireCashier();
  // Fetched together: the database is a network hop away, and the settings do
  // not depend on the order.
  const [order, ctx] = await Promise.all([getOrderForTicket(orderId), context()]);
  if (!order) return { ok: false, error: "genericError" };

  const build =
    kind === "kitchen" ? kitchenTicket : kind === "label" ? addressLabel : customerReceipt;
  const name =
    kind === "kitchen" ? "Küche" : kind === "label" ? "Adresse" : "Kundenbeleg";
  return send(build(order, ctx), ctx, `${name} ${order.orderNumber}`);
}

/**
 * What the till prints the moment an order is sent: the customer's copy and the
 * kitchen bon, as two separate jobs so the printer cuts between them.
 */
export async function printNewOrder(orderId: number): Promise<PrintOutcome> {
  await requireCashier();
  const [order, ctx] = await Promise.all([getOrderForTicket(orderId), context()]);
  if (!order) return { ok: false, error: "genericError" };

  // Queued one after the other, not together: the agent prints in id order, and
  // the customer's copy has to come off the printer before the kitchen's.
  const receipt = await send(
    customerReceipt(order, ctx),
    ctx,
    `Kundenbeleg ${order.orderNumber}`,
  );
  if (!receipt.ok) return receipt;
  return send(kitchenTicket(order, ctx), ctx, `Küche ${order.orderNumber}`);
}

/** The day-close sheet, printed from the daily report screen. */
export async function printDailyReport(): Promise<PrintOutcome> {
  await requireCashier();
  const [report, ctx] = await Promise.all([getDailyReport(), context()]);
  return send(dailyReportTicket(report, ctx), ctx, "Tagesbericht");
}

export type BoardScope =
  | { kind: "all" }
  | { kind: "drivers" }
  | { kind: "group"; key: string };

/** The waiting column, exactly as the board shows it. */
export async function printPendingReport(): Promise<PrintOutcome> {
  await requireCashier();
  const [board, ctx] = await Promise.all([getDriverBoard(), context()]);
  return send(
    pendingReportTicket(board.pending, board.pendingSum, ctx),
    ctx,
    "Wartende Bestellungen",
  );
}

/**
 * The processed column at the chosen scope. The grouping is rebuilt here rather
 * than trusted from the browser, so the paper always matches the database.
 */
export async function printProcessedReport(scope: BoardScope): Promise<PrintOutcome> {
  await requireCashier();
  const [board, ctx] = await Promise.all([getDriverBoard(), context()]);
  const dict = getDictionary(posLocale);

  const byDriver = new Map<number, DriverOrder[]>();
  const cash: DriverOrder[] = [];
  const online: DriverOrder[] = [];
  const cancelled: DriverOrder[] = [];
  for (const o of board.processed) {
    if (o.cancelled) cancelled.push(o);
    else if (o.driverNumber !== null) {
      const list = byDriver.get(o.driverNumber) ?? [];
      list.push(o);
      byDriver.set(o.driverNumber, list);
    } else if (o.paidCash) cash.push(o);
    else if (o.paidOnline) online.push(o);
  }

  const groups: ReportGroup[] = [];
  for (const [number, orders] of [...byDriver.entries()].sort((a, b) => a[0] - b[0])) {
    groups.push({
      key: `d${number}`,
      kind: "driver",
      label: `X-${number}`,
      orders,
      sum: orders.reduce((acc, o) => acc + o.total, 0),
    });
  }
  const pile = (
    key: ReportGroup["kind"],
    label: string,
    orders: DriverOrder[],
    counted: boolean,
  ) => {
    if (orders.length === 0) return;
    groups.push({
      key,
      kind: key,
      label,
      orders,
      sum: counted ? orders.reduce((acc, o) => acc + o.total, 0) : 0,
    });
  };
  pile("cash", dict.drivers.paidCash, cash, true);
  pile("online", dict.drivers.paidOnline, online, true);
  pile("cancelled", dict.drivers.cancelled, cancelled, false);

  const picked = scope.kind === "group" ? groups.filter((g) => g.key === scope.key) : [];
  const shown =
    picked.length > 0
      ? picked
      : scope.kind === "drivers"
        ? groups.filter((g) => g.kind === "driver")
        : groups;

  const title =
    picked.length > 0
      ? `${dict.drivers.printProcessedTitle} - ${picked[0].label}`
      : scope.kind === "drivers"
        ? `${dict.drivers.printProcessedTitle} - ${dict.drivers.scopeDrivers}`
        : dict.drivers.printProcessedTitle;

  return send(
    processedReportTicket(shown, title, ctx, picked.length > 0),
    ctx,
    title,
  );
}
