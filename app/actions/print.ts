"use server";

import { getCurrentCashier } from "@/lib/session";
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
 * Printing happens here, on the machine the printer is plugged into — the
 * browser is never asked to print anything. Each action builds the ticket as
 * ESC/POS bytes and hands them to the Windows spooler as a RAW job.
 */

type PrintOutcome = ActionResult<{ printed: true }>;

async function context(): Promise<TicketContext & { printerName: string }> {
  const settings = await getSettings();
  return {
    columns: settings.printerColumns,
    restaurantName: settings.restaurantName,
    printerName: settings.printerName,
  };
}

async function send(data: Buffer, printerName: string): Promise<PrintOutcome> {
  const result = await printRaw(printerName, data);
  return result.ok ? { ok: true, data: { printed: true } } : { ok: false, error: result.error };
}

/** The printers Windows knows about — the Settings screen offers these. */
export async function systemPrinters(): Promise<string[]> {
  if (!(await getCurrentCashier())) return [];
  return listPrinters();
}

/** A slip to prove the printer is reachable and the width is right. */
export async function printTest(): Promise<PrintOutcome> {
  if (!(await getCurrentCashier())) return { ok: false, error: "genericError" };
  const ctx = await context();
  return send(testTicket(ctx), ctx.printerName);
}

export type TicketKind = "receipt" | "kitchen" | "label";

/** One of an order's three papers, printed on demand from the orders board. */
export async function printOrderTicket(
  orderId: number,
  kind: TicketKind,
): Promise<PrintOutcome> {
  if (!(await getCurrentCashier())) return { ok: false, error: "genericError" };
  const order = await getOrderForTicket(orderId);
  if (!order) return { ok: false, error: "genericError" };

  const ctx = await context();
  const build =
    kind === "kitchen" ? kitchenTicket : kind === "label" ? addressLabel : customerReceipt;
  return send(build(order, ctx), ctx.printerName);
}

/**
 * What the till prints the moment an order is sent: the customer's copy and the
 * kitchen bon, as two separate jobs so the printer cuts between them.
 */
export async function printNewOrder(orderId: number): Promise<PrintOutcome> {
  if (!(await getCurrentCashier())) return { ok: false, error: "genericError" };
  const order = await getOrderForTicket(orderId);
  if (!order) return { ok: false, error: "genericError" };

  const ctx = await context();
  const receipt = await send(customerReceipt(order, ctx), ctx.printerName);
  if (!receipt.ok) return receipt;
  return send(kitchenTicket(order, ctx), ctx.printerName);
}

/** The day-close sheet, printed from the daily report screen. */
export async function printDailyReport(): Promise<PrintOutcome> {
  if (!(await getCurrentCashier())) return { ok: false, error: "genericError" };
  const [report, ctx] = await Promise.all([getDailyReport(), context()]);
  return send(dailyReportTicket(report, ctx), ctx.printerName);
}

export type BoardScope =
  | { kind: "all" }
  | { kind: "drivers" }
  | { kind: "group"; key: string };

/** The waiting column, exactly as the board shows it. */
export async function printPendingReport(): Promise<PrintOutcome> {
  if (!(await getCurrentCashier())) return { ok: false, error: "genericError" };
  const [board, ctx] = await Promise.all([getDriverBoard(), context()]);
  return send(pendingReportTicket(board.pending, board.pendingSum, ctx), ctx.printerName);
}

/**
 * The processed column at the chosen scope. The grouping is rebuilt here rather
 * than trusted from the browser, so the paper always matches the database.
 */
export async function printProcessedReport(scope: BoardScope): Promise<PrintOutcome> {
  if (!(await getCurrentCashier())) return { ok: false, error: "genericError" };
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
  );
}
