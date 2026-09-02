import "server-only";
import { db } from "../db";
import { eurosToCents } from "../pricing";
import type { Locale } from "../i18n/config";
import type { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

const dec = (v: { toString(): string }) => eurosToCents(v.toString());

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function getPendingOnlineCount(): Promise<number> {
  return db.order.count({
    where: { source: "ONLINE", status: "PENDING" },
  });
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
          o.address.mahalla,
          o.address.area,
          o.address.postalCode
            ? `${o.address.postalCode} ${o.address.city}`
            : o.address.city,
        ]
          .filter(Boolean)
          .join("، ")
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

export function getOnlineOrders(): Promise<OrderCard[]> {
  return toOrderCards({ source: "ONLINE", status: "PENDING" });
}

export function getHeldOrders(): Promise<OrderCard[]> {
  return toOrderCards({ status: "HELD" });
}

export interface DashboardData {
  revenueToday: number;
  orderCount: number;
  avgTicket: number;
  activeDeliveries: number;
  revenueByHour: { hour: number; revenue: number }[];
  recentOrders: {
    id: number;
    orderNumber: string;
    type: OrderType;
    status: OrderStatus;
    total: number;
    createdAt: string;
    customerName: string | null;
  }[];
}

export async function getDashboard(now = new Date()): Promise<DashboardData> {
  const { start, end } = dayBounds(now);

  const todaysCompleted = await db.order.findMany({
    where: {
      status: "COMPLETED",
      createdAt: { gte: start, lt: end },
    },
    select: { total: true, createdAt: true },
  });

  const revenueToday = todaysCompleted.reduce(
    (acc, o) => acc + Number(o.total.toString()),
    0,
  );
  const orderCount = todaysCompleted.length;
  const avgTicket = orderCount > 0 ? revenueToday / orderCount : 0;

  const activeDeliveries = await db.order.count({
    where: {
      type: "DELIVERY",
      status: { in: ["PENDING", "PREPARING", "READY"] },
    },
  });

  const buckets = new Map<number, number>();
  for (let h = 9; h <= 23; h++) buckets.set(h, 0);
  for (const o of todaysCompleted) {
    const h = o.createdAt.getHours();
    buckets.set(h, (buckets.get(h) ?? 0) + Number(o.total.toString()));
  }
  const revenueByHour = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, revenue]) => ({ hour, revenue }));

  const recent = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { customer: { select: { name: true } } },
  });
  const recentOrders = recent.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    type: o.type,
    status: o.status,
    total: Number(o.total.toString()),
    createdAt: o.createdAt.toISOString(),
    customerName: o.customer?.name ?? null,
  }));

  return {
    revenueToday,
    orderCount,
    avgTicket,
    activeDeliveries,
    revenueByHour,
    recentOrders,
  };
}

export interface DailyReportRow {
  id: number;
  orderNumber: string;
  time: string;
  type: OrderType;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  total: number;
}
export interface DailyReport {
  date: string;
  rows: DailyReportRow[];
  totalOrders: number;
  totalRevenue: number;
  averageTicket: number;
  byMethod: { method: PaymentMethod; count: number; total: number }[];
}

export async function getDailyReport(date: Date): Promise<DailyReport> {
  const { start, end } = dayBounds(date);
  const orders = await db.order.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      status: { not: "CANCELLED" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      type: true,
      status: true,
      paymentMethod: true,
      total: true,
    },
  });

  const rows = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    time: o.createdAt.toISOString(),
    type: o.type,
    status: o.status,
    paymentMethod: o.paymentMethod,
    total: Number(o.total.toString()),
  }));

  const completed = rows.filter((r) => r.status === "COMPLETED");
  const totalRevenue = completed.reduce((acc, r) => acc + r.total, 0);
  const totalOrders = completed.length;

  const methods: PaymentMethod[] = ["CASH", "CARD", "ONLINE"];
  const byMethod = methods.map((method) => {
    const subset = completed.filter((r) => r.paymentMethod === method);
    return {
      method,
      count: subset.length,
      total: subset.reduce((acc, r) => acc + r.total, 0),
    };
  });

  return {
    date: start.toISOString(),
    rows,
    totalOrders,
    totalRevenue,
    averageTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    byMethod,
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
