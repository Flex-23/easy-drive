import "server-only";
import { db } from "../db";
import { eurosToCents } from "../pricing";
import type { Locale } from "../i18n/config";
import {
  businessDay,
  businessHourIndex,
  businessHourLabel,
} from "../business-day";
import type { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

const dec = (v: { toString(): string }) => eurosToCents(v.toString());

/**
 * Payment as the reports state it: cash, or electronic. A card terminal and an
 * online payment are the same thing to the shop — the money did not go into the
 * drawer — so `CARD` is reported as `ONLINE`. Orders keep their exact method.
 */
export const REPORTED_METHODS = ["CASH", "ONLINE"] as const;
export type ReportedMethod = (typeof REPORTED_METHODS)[number];

export function reportedMethod(method: PaymentMethod | null): ReportedMethod | null {
  if (method === null) return null;
  return method === "CASH" ? "CASH" : "ONLINE";
}

export interface OrderCardLine {
  id: number;
  name: string;
  quantity: number;
  options: string[];
}
export interface OrderCard {
  id: number;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  total: number;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  tableNumber: string | null;
  lines: OrderCardLine[];
}

async function toOrderCards(where: object): Promise<OrderCard[]> {
  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      customer: { select: { name: true, phone: true } },
      address: true,
      lines: { include: { options: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    type: o.type,
    status: o.status,
    total: Number(o.total.toString()),
    createdAt: o.createdAt.toISOString(),
    customerName: o.customer?.name ?? null,
    customerPhone: o.customer?.phone ?? null,
    address: o.address
      ? [
          `${o.address.street} ${o.address.houseNumber}`,
          o.address.area,
          o.address.postalCode
            ? `${o.address.postalCode} ${o.address.city}`
            : o.address.city,
        ]
          .filter(Boolean)
          .join(", ")
      : null,
    tableNumber: o.tableNumber,
    lines: o.lines.map((l) => ({
      id: l.id,
      name: l.itemNameSnapshot,
      quantity: l.quantity,
      options: l.options.map((op) => op.choiceNameSnapshot),
    })),
  }));
}

/** The parked bills, oldest first. */
export function getHeldOrders(): Promise<OrderCard[]> {
  return toOrderCards({ status: "HELD" });
}

export interface DailyReportRow {
  id: number;
  orderNumber: string;
  time: string;
  type: OrderType;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  driverNumber: number | null;
  total: number;
}

/** One delivery driver's share of the day. */
export interface DriverTally {
  driverNumber: number;
  count: number;
  total: number;
}

export interface DailyReport {
  date: string;
  rows: DailyReportRow[];
  totalOrders: number;
  totalRevenue: number;
  averageTicket: number;
  byMethod: { method: ReportedMethod; count: number; total: number }[];
  /** Paid orders split by how they were served — the printed sheet lists these. */
  byType: { type: OrderType; count: number; total: number }[];
  /** Money taken per hour of the business day, 05:00 first (bar chart). */
  revenueByHour: { label: string; revenue: number }[];
  /** Deliveries still out (not date-bound — it is a live figure). */
  activeDeliveries: number;
  /** Every delivery that left the shop today (driver or paid online). */
  delivery: { count: number; total: number };
  byDriver: DriverTally[];
  paidOnline: { count: number; total: number };
  cancelled: { count: number; total: number };
}

/** The closing report for a single day; defaults to today. */
export async function getDailyReport(date: Date = new Date()): Promise<DailyReport> {
  const { start, end } = businessDay(date);
  const orders = await db.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      paidAt: true,
      type: true,
      status: true,
      paymentMethod: true,
      driverNumber: true,
      total: true,
    },
  });

  const all = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    time: o.createdAt.toISOString(),
    paidAt: o.paidAt,
    type: o.type,
    status: o.status,
    paymentMethod: o.paymentMethod,
    driverNumber: o.driverNumber,
    total: Number(o.total.toString()),
  }));

  const live = all.filter((r) => r.status !== "CANCELLED");
  const rows: DailyReportRow[] = live.map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    time: r.time,
    type: r.type,
    status: r.status,
    paymentMethod: r.paymentMethod,
    driverNumber: r.driverNumber,
    total: r.total,
  }));

  // Paid orders drive the revenue figures (a delivery can be paid but still out).
  const paid = live.filter((r) => r.paymentMethod !== null);
  const totalRevenue = paid.reduce((acc, r) => acc + r.total, 0);
  const totalOrders = paid.length;

  // Card and online are one and the same for the till: money that arrived
  // electronically rather than as notes in the drawer. Only cash is separate.
  const byMethod = REPORTED_METHODS.map((method) => {
    const subset = paid.filter((r) => reportedMethod(r.paymentMethod) === method);
    return {
      method,
      count: subset.length,
      total: subset.reduce((acc, r) => acc + r.total, 0),
    };
  });

  const orderTypes: OrderType[] = ["DELIVERY", "PICKUP", "DINE_IN"];
  const byType = orderTypes.map((type) => {
    const subset = paid.filter((r) => r.type === type);
    return {
      type,
      count: subset.length,
      total: subset.reduce((acc, r) => acc + r.total, 0),
    };
  });

  // One slot per hour of the business day: 05:00 first, 04:00 last.
  const buckets = new Array<number>(24).fill(0);
  for (const o of live) {
    if (!o.paidAt) continue;
    buckets[businessHourIndex(o.paidAt)] += o.total;
  }
  const revenueByHour = buckets.map((revenue, index) => ({
    label: businessHourLabel(index),
    revenue,
  }));

  const activeDeliveries = await db.order.count({
    where: {
      type: "DELIVERY",
      status: { in: ["PENDING", "PREPARING", "READY"] },
    },
  });

  // --- Delivery breakdown: what went out, with whom, and what was voided. ---
  const deliveries = all.filter((r) => r.type === "DELIVERY");
  const dispatched = deliveries.filter(
    (r) => r.status !== "CANCELLED" && (r.driverNumber !== null || r.paymentMethod === "ONLINE"),
  );

  const driverMap = new Map<number, DriverTally>();
  for (const o of dispatched) {
    if (o.driverNumber === null) continue;
    const tally = driverMap.get(o.driverNumber) ?? {
      driverNumber: o.driverNumber,
      count: 0,
      total: 0,
    };
    tally.count += 1;
    tally.total += o.total;
    driverMap.set(o.driverNumber, tally);
  }
  const byDriver = [...driverMap.values()].sort(
    (a, b) => a.driverNumber - b.driverNumber,
  );

  const online = dispatched.filter(
    (r) => r.driverNumber === null && r.paymentMethod === "ONLINE",
  );
  const voided = deliveries.filter((r) => r.status === "CANCELLED");

  return {
    date: start.toISOString(),
    rows,
    totalOrders,
    totalRevenue,
    averageTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    byMethod,
    byType,
    revenueByHour,
    activeDeliveries,
    delivery: {
      count: dispatched.length,
      total: dispatched.reduce((acc, r) => acc + r.total, 0),
    },
    byDriver,
    paidOnline: {
      count: online.length,
      total: online.reduce((acc, r) => acc + r.total, 0),
    },
    cancelled: {
      count: voided.length,
      total: voided.reduce((acc, r) => acc + r.total, 0),
    },
  };
}

/** Load a HELD order back into a cart payload (cents), localized. */
export async function getOrderForResume(id: number, locale: Locale) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          options: true,
          menuItem: { include: { translations: true } },
        },
      },
    },
  });
  if (!order) return null;
  return {
    id: order.id,
    type: order.type,
    tableNumber: order.tableNumber,
    customerId: order.customerId,
    addressId: order.addressId,
    discount: dec(order.discountAmount),
    lines: order.lines.map((l) => ({
      itemId: l.menuItemId,
      name:
        l.menuItem?.translations.find((t) => t.locale === locale)?.name ??
        l.itemNameSnapshot,
      quantity: l.quantity,
      unitPrice: dec(l.unitPrice),
      options: l.options.map((o) => ({
        groupName: o.groupNameSnapshot,
        choiceName: o.choiceNameSnapshot,
        priceDelta: dec(o.priceDelta),
      })),
    })),
  };
}
