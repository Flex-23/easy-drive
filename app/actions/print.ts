"use server";

import { db } from "@/lib/db";
import { requireCashier } from "@/lib/session";
import { getSettings } from "@/lib/queries/settings";
import { getOrderForTicket, getDriverBoard } from "@/lib/queries/drivers";
import { getDailyReport } from "@/lib/queries/orders";
import { listPrinters, printRaw } from "@/lib/printing/printer";
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
 * Printing never involves the browser: each action builds the ticket as ESC/POS
 * bytes here on the server and gets them to a printer one of two ways.
 *
 * On the shop machine the bytes go straight to the Windows spooler as a RAW job.
 * On a host with no printer — the cloud copy of this app — they are queued in
 * `PrintJob` instead, and the agent running beside the printer
 * (`print/print-agent.mjs`) pulls them and prints them there. Both paths
 * produce the same paper, because both send the same finished bytes.
 */

type PrintOutcome = ActionResult<{ queued: boolean }>;

async function context(): Promise<TicketContext & { printerName: string }> {
  const settings = await getSettings();
  return {
    columns: settings.printerColumns,
    restaurantName: settings.restaurantName,
    printerName: settings.printerName,
  };
}

async function send(
  data: Buffer,
  printerName: string,
  label: string,
): Promise<PrintOutcome> {
  // No printer on this machine means this is the cloud copy: hand the finished
  // job to the queue and let the shop's agent take it from there.
  if (process.platform !== "win32") {
    if (!printerName.trim()) return { ok: false, error: "printerNotConfigured" };
    // Copied into a plain Uint8Array: a Node Buffer can sit on a SharedArrayBuffer,
    // which is not what the Bytes column accepts.
    await db.printJob.create({
      data: { label, payload: new Uint8Array(data), printerName },
    });
    return { ok: true, data: { queued: true } };
  }

  const result = await printRaw(printerName, data);
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
  return send(testTicket(ctx), ctx.printerName, "Testdruck");
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
  return send(build(order, ctx), ctx.printerName, `${name} ${order.orderNumber}`);
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
    ctx.printerName,
    `Kundenbeleg ${order.orderNumber}`,
  );
  if (!receipt.ok) return receipt;
  return send(kitchenTicket(order, ctx), ctx.printerName, `Küche ${order.orderNumber}`);
}

/** The day-close sheet, printed from the daily report screen. */
export async function printDailyReport(): Promise<PrintOutcome> {
  await requireCashier();
  const [report, ctx] = await Promise.all([getDailyReport(), context()]);
  return send(dailyReportTicket(report, ctx), ctx.printerName, "Tagesbericht");
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
    ctx.printerName,
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
    ctx.printerName,
    title,
  );
}
