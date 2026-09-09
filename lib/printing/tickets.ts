import "server-only";
import { Receipt } from "./escpos";
import { formatMoney, formatDate, formatDateTime, formatTime } from "../money";
import { getDictionary } from "../i18n/dictionaries";
import { posLocale } from "../i18n/config";
import type { DriverOrder } from "../queries/drivers";
import type { DailyReport } from "../queries/orders";
import type { OrderType } from "@prisma/client";

/**
 * Every piece of paper the shop produces, written as printer bytes.
 *
 * The till serves customers in German, so the dictionary is fixed here — these
 * are printed by the machine, not by whoever happens to be looking at a screen.
 */

const dict = getDictionary(posLocale);
const money = (value: number) => formatMoney(value, posLocale);
const typeLabel = (type: OrderType) =>
  type === "DELIVERY" ? dict.orderType.delivery : dict.orderType.pickup;

export interface TicketContext {
  columns: number;
  restaurantName: string;
}

/* ------------------------------ order tickets ----------------------------- */

/**
 * The customer's copy. It deliberately carries no shop or software name — only
 * the order — and says plainly that it is not an official receipt.
 */
export function customerReceipt(order: DriverOrder, ctx: TicketContext): Buffer {
  const r = new Receipt(ctx.columns);
  // A pickup has no delivery address, but the customer still has one on file —
  // and that is what the receipt and its QR are for.
  const address = order.address ?? order.customerAddress;

  // 1 — what it is and when.
  r.align("center").bold(true).big(true, true).line(order.orderNumber);
  r.big(false).bold(false);
  r.line(formatDateTime(order.createdAt, posLocale));
  r.line();

  // 2 — who it is for, and where they are.
  r.align("left");
  if (order.customerName) r.bold(true).line(order.customerName).bold(false);
  if (address) r.line(address);
  if (order.customerPhone) r.line(order.customerPhone);

  // 3 — that address as a QR: scanning it opens navigation.
  if (address) {
    r.align("center").qr(mapsLink(address)).align("left");
  }

  // 4 — what was ordered.
  r.rule();
  for (const line of order.lines) {
    r.row(`${line.quantity}x ${line.name}`, money(line.lineTotal));
    if (line.options.length > 0) r.line(`   ${line.options.join(", ")}`);
  }

  // 5 — what it costs.
  r.rule();
  r.row(dict.cart.subtotal, money(order.subtotal));
  if (order.discount > 0) r.row(dict.cart.discount, `- ${money(order.discount)}`);
  if (order.deliveryFee > 0) r.row(dict.cart.deliveryFee, money(order.deliveryFee));
  r.row(dict.cart.tax, money(order.tax));
  r.bold(true).big(true, false).row(dict.cart.total, money(order.total));
  r.big(false).bold(false);

  r.rule();
  r.align("center").bold(true).line(dict.tickets.unofficial).bold(false);
  return r.cut().build();
}

const mapsLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * The order's place in the day, as printed on the number itself: `BE003QG` is
 * the third order of the business day. The kitchen calls this number out.
 */
function daySequence(orderNumber: string): string {
  return /^[A-Z]{2}(\d{3})[A-Z]{2}$/.exec(orderNumber)?.[1] ?? orderNumber;
}

/**
 * What to cook. The day's sequence number leads — that is what gets called out
 * when the food is ready — with the full order number under it, and no money
 * anywhere on the paper.
 */
export function kitchenTicket(order: DriverOrder, ctx: TicketContext): Buffer {
  const r = new Receipt(ctx.columns);

  r.align("center").bold(true).big(true, true).line(daySequence(order.orderNumber));
  r.big(false).line(order.orderNumber).bold(false);
  r.line(`${typeLabel(order.type)} - ${formatTime(order.createdAt, posLocale)}`);
  r.align("left").rule();

  for (const line of order.lines) {
    r.bold(true).big(true).line(`${line.quantity}x ${line.name}`).big(false).bold(false);
    if (line.options.length > 0) r.line(`   ${line.options.join(", ")}`);
    if (line.kitchenNotes) r.bold(true).line(`   ! ${line.kitchenNotes}`).bold(false);
    r.line();
  }

  return r.cut().build();
}

/** Who and where, with the address repeated as a QR the driver can scan. */
export function addressLabel(order: DriverOrder, ctx: TicketContext): Buffer {
  const r = new Receipt(ctx.columns);
  const address = order.address ?? order.customerAddress;
  const encoded = address
    ? mapsLink(address)
    : [order.orderNumber, order.customerName, order.customerPhone].filter(Boolean).join(" | ");

  r.align("center").bold(true).big(true).line(order.orderNumber).big(false).bold(false);
  r.line(typeLabel(order.type));
  r.align("left").rule();

  r.bold(true).line(order.customerName ?? dict.customer.noCustomer).bold(false);
  if (order.customerPhone) r.line(order.customerPhone);
  if (address) r.line(address);

  r.align("center").qr(encoded).align("left");
  return r.cut().build();
}

/* --------------------------------- reports -------------------------------- */

/**
 * The day in six figures: how many orders, how they were paid, how many were
 * voided, and the money. Nothing about who ordered what — that detail lives on
 * the screen and on the orders-board report.
 */
export function dailyReportTicket(report: DailyReport, ctx: TicketContext): Buffer {
  const r = new Receipt(ctx.columns);
  const t = dict.dailyReport;
  const cash = report.byMethod.find((m) => m.method === "CASH");
  const online = report.byMethod.find((m) => m.method === "ONLINE");

  r.align("center").bold(true).line(ctx.restaurantName).line(t.printTitle).bold(false);
  r.line();
  r.line(formatDate(report.date, posLocale));
  r.align("left").rule();
  r.line();

  r.row(t.totalOrders, String(report.totalOrders));
  r.line();
  r.row(`${dict.payment.cash} (${cash?.count ?? 0})`, money(cash?.total ?? 0));
  r.row(`${dict.payment.online} (${online?.count ?? 0})`, money(online?.total ?? 0));
  r.row(t.cancelledOrders, String(report.cancelled.count));
  r.line();

  r.rule();
  r.bold(true).big(true, false).row(t.totalRevenue, money(report.totalRevenue));
  r.big(false).bold(false);

  r.line();
  r.rule();
  r.align("center").line(`${t.printedAt}: ${formatDateTime(new Date(), posLocale)}`);
  return r.cut().build();
}

/** The waiting column: every order still to be handled, with the total. */
export function pendingReportTicket(
  orders: DriverOrder[],
  total: number,
  ctx: TicketContext,
): Buffer {
  const r = new Receipt(ctx.columns);
  const t = dict.drivers;

  r.align("center").bold(true).line(ctx.restaurantName).line(t.printPendingTitle).bold(false);
  r.line(formatDate(new Date(), posLocale));
  r.align("left").rule();

  if (orders.length === 0) {
    r.line(t.noPending);
  } else {
    for (const o of orders) {
      r.row(
        `${o.orderNumber} ${formatTime(o.createdAt, posLocale)}`,
        money(o.total),
      );
      if (o.customerName) r.line(`   ${o.customerName}`);
    }
  }

  r.rule();
  r.row(t.count, String(orders.length));
  r.bold(true).row(t.grandTotal, money(total)).bold(false);
  r.rule();
  r.align("center").line(`${dict.dailyReport.printedAt}: ${formatDateTime(new Date(), posLocale)}`);
  return r.cut().build();
}

export interface ReportGroup {
  key: string;
  kind: "driver" | "cash" | "online" | "cancelled";
  label: string;
  orders: DriverOrder[];
  sum: number;
}

/** The processed column, at the scope the dispatcher chose on screen. */
export function processedReportTicket(
  groups: ReportGroup[],
  title: string,
  ctx: TicketContext,
  detailed: boolean,
): Buffer {
  const r = new Receipt(ctx.columns);
  const t = dict.drivers;

  r.align("center").bold(true).line(ctx.restaurantName).line(title).bold(false);
  r.line(formatDate(new Date(), posLocale));
  r.align("left").rule();

  const counted = groups.filter((g) => g.kind !== "cancelled");
  const count = counted.reduce((acc, g) => acc + g.orders.length, 0);
  const sum = counted.reduce((acc, g) => acc + g.sum, 0);

  if (groups.length === 0) {
    r.line(t.noAssigned);
  } else if (detailed) {
    // A single group: its orders, one per line.
    for (const o of groups[0].orders) {
      r.row(
        `${o.orderNumber} ${formatTime(o.createdAt, posLocale)}`,
        o.cancelled ? "-" : money(o.total),
      );
      if (o.customerName) r.line(`   ${o.customerName}`);
    }
  } else {
    for (const g of groups) {
      r.row(`${g.label} (${g.orders.length})`, g.kind === "cancelled" ? "-" : money(g.sum));
    }
  }

  r.rule();
  r.row(t.count, String(count));
  r.bold(true).row(t.grandTotal, money(sum)).bold(false);
  r.rule();
  r.align("center").line(`${dict.dailyReport.printedAt}: ${formatDateTime(new Date(), posLocale)}`);
  return r.cut().build();
}

/** A short slip proving the printer is reachable and correctly configured. */
export function testTicket(ctx: TicketContext): Buffer {
  const r = new Receipt(ctx.columns);
  r.align("center").bold(true).big(true).line(ctx.restaurantName).big(false).bold(false);
  r.line(dict.settings.printTest);
  r.line(formatDateTime(new Date(), posLocale));
  r.align("left").rule();
  r.row(dict.settings.printerName, ctx.restaurantName);
  r.line("ÄÖÜ äöü ß € 0123456789");
  r.line("X".repeat(ctx.columns));
  return r.cut().build();
}
