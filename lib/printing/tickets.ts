import "server-only";
import { Slip, type WidthMm } from "./lines";
import { formatMoney, formatDate, formatDateTime, formatTime } from "../money";
import { getDictionary } from "../i18n/dictionaries";
import { posLocale } from "../i18n/config";
import type { DriverOrder } from "../queries/drivers";
import type { DailyReport } from "../queries/orders";
import type { OrderType } from "@prisma/client";

/**
 * Every piece of paper the shop produces, written as directive lines (see
 * `lines.ts`) for the renderer to draw.
 *
 * The till serves customers in German, so the dictionary is fixed here — these
 * are printed by the machine, not by whoever happens to be looking at a screen.
 */

const dict = getDictionary(posLocale);
const money = (value: number) => formatMoney(value, posLocale);
const typeLabel = (type: OrderType) =>
  type === "DELIVERY" ? dict.orderType.delivery : dict.orderType.pickup;

export interface TicketContext {
  widthMm: WidthMm;
  restaurantName: string;
}

/**
 * A line that belongs to the one above it — an option, a note. The old ESC/POS
 * slips indented these with spaces; a proportional font all but swallows a
 * leading space, so they are marked instead.
 */
const SUB = "· ";

/* ------------------------------ order tickets ----------------------------- */

/**
 * The customer's copy. It deliberately carries no shop or software name — only
 * the order — and says plainly that it is not an official receipt.
 */
export function customerReceipt(order: DriverOrder, ctx: TicketContext): string[] {
  const r = new Slip(ctx.widthMm);
  // A pickup has no delivery address, but the customer still has one on file —
  // and that is what the receipt and its QR are for.
  const address = order.address ?? order.customerAddress;

  // 1 — what it is and when.
  r.hero(order.orderNumber);
  r.centre(formatDateTime(order.createdAt, posLocale));
  r.blank();

  // 2 — who it is for, and where they are.
  if (order.customerName) r.strong(order.customerName);
  if (address) r.text(address);
  if (order.customerPhone) r.text(order.customerPhone);

  // 3 — that address as a QR: scanning it opens navigation.
  if (address) r.qr(mapsLink(address));

  // 4 — what was ordered.
  r.rule();
  for (const line of order.lines) {
    r.row(`${line.quantity} × ${line.name}`, money(line.lineTotal));
    if (line.options.length > 0) r.text(`${SUB}${line.options.join(", ")}`);
  }

  // 5 — what it costs.
  r.rule();
  r.row(dict.cart.subtotal, money(order.subtotal));
  if (order.discount > 0) r.row(dict.cart.discount, `− ${money(order.discount)}`);
  if (order.deliveryFee > 0) r.row(dict.cart.deliveryFee, money(order.deliveryFee));
  r.row(dict.cart.tax, money(order.tax));
  r.strongRow(dict.cart.total, money(order.total));

  r.rule();
  r.centre(dict.tickets.unofficial);
  return r.build();
}

const mapsLink = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * The order's place in the day, as printed on the number itself: `BE003QG` is
 * the third order of the business day. The kitchen calls this number out.
 *
 * The digits are matched by count rather than by a fixed three, so a shop that
 * passes 999 orders in a day keeps a readable number on the bon instead of
 * falling back to the whole code.
 */
function daySequence(orderNumber: string): string {
  return /^[A-Z]{2}(\d+)[A-Z]{2}$/.exec(orderNumber)?.[1] ?? orderNumber;
}

/**
 * What to cook. The day's sequence number leads — that is what gets called out
 * when the food is ready — with the full order number under it, and no money
 * anywhere on the paper. The item list is fenced with the dashed rule so the bon
 * is recognisable at a glance on a spike of tickets.
 */
export function kitchenTicket(order: DriverOrder, ctx: TicketContext): string[] {
  const r = new Slip(ctx.widthMm);

  r.hero(daySequence(order.orderNumber));
  r.centre(order.orderNumber);
  r.text(`${typeLabel(order.type)} - ${formatTime(order.createdAt, posLocale)}`);
  r.fence();

  for (const line of order.lines) {
    r.strong(`${line.name} [${line.quantity}]`);
    if (line.options.length > 0) r.strong(`${SUB}${line.options.join(", ")}`);
    if (line.kitchenNotes) r.strong(`${SUB}! ${line.kitchenNotes}`);
  }

  r.fence();
  return r.build();
}

/** Who and where, with the address repeated as a QR the driver can scan. */
export function addressLabel(order: DriverOrder, ctx: TicketContext): string[] {
  const r = new Slip(ctx.widthMm);
  const address = order.address ?? order.customerAddress;
  const encoded = address
    ? mapsLink(address)
    : [order.orderNumber, order.customerName, order.customerPhone].filter(Boolean).join(" | ");

  r.hero(order.orderNumber);
  r.centre(typeLabel(order.type));
  r.rule();

  r.strong(order.customerName ?? dict.customer.noCustomer);
  if (order.customerPhone) r.text(order.customerPhone);
  if (address) r.text(address);

  r.qr(encoded);
  return r.build();
}

/* --------------------------------- reports -------------------------------- */

/**
 * The day in six figures: how many orders, how they were paid, how many were
 * voided, and the money. Nothing about who ordered what — that detail lives on
 * the screen and on the orders-board report.
 */
export function dailyReportTicket(report: DailyReport, ctx: TicketContext): string[] {
  const r = new Slip(ctx.widthMm);
  const t = dict.dailyReport;
  const cash = report.byMethod.find((m) => m.method === "CASH");
  const online = report.byMethod.find((m) => m.method === "ONLINE");

  r.centre(ctx.restaurantName);
  r.centre(t.printTitle);
  r.blank();
  r.centre(formatDate(report.date, posLocale));
  r.rule();
  r.blank();

  r.row(t.totalOrders, String(report.totalOrders));
  r.blank();
  r.row(`${dict.payment.cash} (${cash?.count ?? 0})`, money(cash?.total ?? 0));
  r.row(`${dict.payment.online} (${online?.count ?? 0})`, money(online?.total ?? 0));
  r.row(t.cancelledOrders, String(report.cancelled.count));
  r.blank();

  r.rule();
  r.strongRow(t.totalRevenue, money(report.totalRevenue));

  r.blank();
  r.rule();
  r.centre(`${t.printedAt}: ${formatDateTime(new Date(), posLocale)}`);
  return r.build();
}

/** The waiting column: every order still to be handled, with the total. */
export function pendingReportTicket(
  orders: DriverOrder[],
  total: number,
  ctx: TicketContext,
): string[] {
  const r = new Slip(ctx.widthMm);
  const t = dict.drivers;

  r.centre(ctx.restaurantName);
  r.centre(t.printPendingTitle);
  r.centre(formatDate(new Date(), posLocale));
  r.rule();

  if (orders.length === 0) {
    r.text(t.noPending);
  } else {
    for (const o of orders) {
      r.row(
        `${o.orderNumber} ${formatTime(o.createdAt, posLocale)}`,
        money(o.total),
      );
      if (o.customerName) r.text(`${SUB}${o.customerName}`);
    }
  }

  r.rule();
  r.row(t.count, String(orders.length));
  r.strongRow(t.grandTotal, money(total));
  r.rule();
  r.centre(`${dict.dailyReport.printedAt}: ${formatDateTime(new Date(), posLocale)}`);
  return r.build();
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
): string[] {
  const r = new Slip(ctx.widthMm);
  const t = dict.drivers;

  r.centre(ctx.restaurantName);
  r.centre(title);
  r.centre(formatDate(new Date(), posLocale));
  r.rule();

  const counted = groups.filter((g) => g.kind !== "cancelled");
  const count = counted.reduce((acc, g) => acc + g.orders.length, 0);
  const sum = counted.reduce((acc, g) => acc + g.sum, 0);

  if (groups.length === 0) {
    r.text(t.noAssigned);
  } else if (detailed) {
    // A single group: its orders, one per line.
    for (const o of groups[0].orders) {
      r.row(
        `${o.orderNumber} ${formatTime(o.createdAt, posLocale)}`,
        o.cancelled ? "-" : money(o.total),
      );
      if (o.customerName) r.text(`${SUB}${o.customerName}`);
    }
  } else {
    for (const g of groups) {
      r.row(`${g.label} (${g.orders.length})`, g.kind === "cancelled" ? "-" : money(g.sum));
    }
  }

  r.rule();
  r.row(t.count, String(count));
  r.strongRow(t.grandTotal, money(sum));
  r.rule();
  r.centre(`${dict.dailyReport.printedAt}: ${formatDateTime(new Date(), posLocale)}`);
  return r.build();
}

/** A short slip proving the printer is reachable and correctly configured. */
export function testTicket(ctx: TicketContext): string[] {
  const r = new Slip(ctx.widthMm);

  r.hero(ctx.restaurantName);
  r.centre(dict.settings.printTest);
  r.centre(formatDateTime(new Date(), posLocale));
  r.rule();
  r.row(dict.settings.printerColumns, `${ctx.widthMm} mm`);
  // Umlauts, the euro sign and Arabic on one line: the point of the slip is to
  // show that the renderer draws all three, which the old code page could not.
  r.text("ÄÖÜ äöü ß € 0123456789");
  r.text("مرحبا — اختبار الطباعة");
  r.rule();
  r.centre(dict.settings.printTestDone);
  return r.build();
}
