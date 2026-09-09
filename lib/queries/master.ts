import "server-only";
import { db } from "../db";
import { REPORTED_METHODS, reportedMethod, type ReportedMethod } from "./orders";
import {
  businessDay,
  businessMonthToDate,
  businessHourIndex,
  businessHourLabel,
  berlinDayOfMonth,
} from "../business-day";
import type { OrderType, UserRole } from "@prisma/client";

/**
 * Read side of the Master (back-office) area: the full catalogue including
 * inactive rows, the staff list, and the sales analytics.
 *
 * Revenue is defined exactly as on the daily report — an order created inside
 * the range, not cancelled, and carrying a payment method. Keeping one
 * definition means the two screens can never disagree.
 */

/* ------------------------------- catalogue ------------------------------- */

export interface MasterCategory {
  id: number;
  slug: string;
  icon: string | null;
  isActive: boolean;
  nameAr: string;
  nameDe: string;
  itemCount: number;
}

/** One size of a dish, with the full price it sells for (euros). */
export interface MasterSize {
  nameAr: string;
  nameDe: string;
  price: number;
}

export interface MasterItem {
  id: number;
  itemNumber: number;
  categoryId: number;
  /** Euros, at the render boundary (stored as Decimal(10,2)). */
  basePrice: number;
  isActive: boolean;
  isPopular: boolean;
  nameAr: string;
  nameDe: string;
  descriptionAr: string | null;
  descriptionDe: string | null;
  /** Empty when the dish has one price; otherwise ordered, first = default. */
  sizes: MasterSize[];
  /** Option groups that are not the size group — dips, drinks, and the like. */
  extraGroupCount: number;
  /** Order lines pointing at this item — a non-zero count blocks deletion. */
  usageCount: number;
}

export interface MasterMenu {
  categories: MasterCategory[];
  items: MasterItem[];
}

type Tr = { locale: string; name: string; description: string | null };
const trName = (rows: Tr[], locale: "ar" | "de") =>
  rows.find((t) => t.locale === locale)?.name ?? "";
const trDesc = (rows: Tr[], locale: "ar" | "de") =>
  rows.find((t) => t.locale === locale)?.description ?? null;

/** The whole catalogue — active and inactive — in one round trip. */
export async function getMasterMenu(): Promise<MasterMenu> {
  const categories = await db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      translations: true,
      items: {
        orderBy: [{ sortOrder: "asc" }, { itemNumber: "asc" }],
        include: {
          translations: true,
          optionGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              choices: {
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                include: { translations: true },
              },
            },
          },
          _count: { select: { orderLines: true } },
        },
      },
    },
  });

  return {
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      icon: c.icon,
      isActive: c.isActive,
      nameAr: trName(c.translations, "ar"),
      nameDe: trName(c.translations, "de"),
      itemCount: c.items.length,
    })),
    items: categories.flatMap((c) =>
      c.items.map((item) => {
        const basePrice = Number(item.basePrice.toString());
        // The size group stores surcharges against the base price; the panel
        // works in full prices, so add the base back on the way out.
        const sizeGroup = item.optionGroups.find((g) => g.kind === "SIZE");
        return {
          id: item.id,
          itemNumber: item.itemNumber,
          categoryId: c.id,
          basePrice,
          isActive: item.isActive,
          isPopular: item.isPopular,
          nameAr: trName(item.translations, "ar"),
          nameDe: trName(item.translations, "de"),
          descriptionAr: trDesc(item.translations, "ar"),
          descriptionDe: trDesc(item.translations, "de"),
          sizes: (sizeGroup?.choices ?? []).map((choice) => ({
            nameAr: trName(choice.translations, "ar"),
            nameDe: trName(choice.translations, "de"),
            price: basePrice + Number(choice.priceDelta.toString()),
          })),
          extraGroupCount: item.optionGroups.filter((g) => g.kind !== "SIZE").length,
          usageCount: item._count.orderLines,
        };
      }),
    ),
  };
}

/* --------------------------------- staff --------------------------------- */

export interface StaffRow {
  id: number;
  name: string;
  role: UserRole;
  isActive: boolean;
  avatarColor: string;
  createdAt: string;
  /** Orders rung up by this user — a non-zero count blocks deletion. */
  orderCount: number;
}

export async function getStaffList(): Promise<StaffRow[]> {
  const users = await db.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      avatarColor: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt.toISOString(),
    orderCount: u._count.orders,
  }));
}

/* --------------------------------- sales --------------------------------- */

/** The two views the panel offers: this day, or this month to date. */
export type SalesPeriod = "day" | "month";

export interface SalesPoint {
  /** Hour of day (`09`) for a day, day of month (`14`) for a month. */
  label: string;
  revenue: number;
  orders: number;
}
export interface Tally {
  count: number;
  total: number;
}
export interface SalesOverview {
  period: SalesPeriod;
  from: string;
  to: string;
  revenue: number;
  orders: number;
  avgTicket: number;
  /** Hour buckets for a day, day buckets for a month. */
  series: SalesPoint[];
  byType: ({ type: OrderType } & Tally)[];
  byMethod: ({ method: ReportedMethod } & Tally)[];
  byCashier: ({ id: number; name: string } & Tally)[];
  byDriver: ({ driverNumber: number } & Tally)[];
  topItems: { name: string; quantity: number; total: number }[];
  cancelled: Tally;
}

const ORDER_TYPES: OrderType[] = ["DELIVERY", "PICKUP", "DINE_IN"];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Sales for the running business day (05:00 to 05:00 Berlin) or for the business
 * month to date. Both are bucketed on `createdAt`, the same field the revenue
 * filter uses, so the bars always add up to the headline figure.
 */
export async function getSalesOverview(
  period: SalesPeriod,
): Promise<SalesOverview> {
  const now = new Date();
  const { start, end } =
    period === "day" ? businessDay(now) : businessMonthToDate(now);

  const [orders, lines] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        total: true,
        type: true,
        status: true,
        paymentMethod: true,
        driverNumber: true,
        cashier: { select: { id: true, name: true } },
      },
    }),
    db.orderLine.findMany({
      where: {
        order: {
          createdAt: { gte: start, lt: end },
          status: { not: "CANCELLED" },
        },
      },
      select: { itemNameSnapshot: true, quantity: true, lineTotal: true },
    }),
  ]);

  const rows = orders.map((o) => ({
    createdAt: o.createdAt,
    total: Number(o.total.toString()),
    type: o.type,
    status: o.status,
    paymentMethod: o.paymentMethod,
    driverNumber: o.driverNumber,
    cashier: o.cashier,
  }));

  const live = rows.filter((r) => r.status !== "CANCELLED");
  const paid = live.filter((r) => r.paymentMethod !== null);
  const revenue = paid.reduce((acc, r) => acc + r.total, 0);
  const voided = rows.filter((r) => r.status === "CANCELLED");

  // Empty buckets are kept so a quiet hour or day still shows on the chart.
  const series: SalesPoint[] = [];
  const index = new Map<string, SalesPoint>();
  const add = (label: string) => {
    const point: SalesPoint = { label, revenue: 0, orders: 0 };
    series.push(point);
    index.set(label, point);
  };
  if (period === "day") {
    for (let slot = 0; slot < 24; slot++) add(businessHourLabel(slot));
  } else {
    for (let d = 1; d <= berlinDayOfMonth(now); d++) add(pad(d));
  }
  for (const r of paid) {
    const label =
      period === "day"
        ? businessHourLabel(businessHourIndex(r.createdAt))
        : pad(berlinDayOfMonth(r.createdAt));
    const point = index.get(label);
    if (!point) continue;
    point.revenue += r.total;
    point.orders += 1;
  }

  const tally = <T>(items: typeof paid, of: (r: (typeof paid)[number]) => T) => {
    const map = new Map<T, Tally>();
    for (const r of items) {
      const key = of(r);
      const cur = map.get(key) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += r.total;
      map.set(key, cur);
    }
    return map;
  };

  const typeMap = tally(paid, (r) => r.type);
  // Card money and online money are one bucket — see reportedMethod().
  const methodMap = tally(paid, (r) => reportedMethod(r.paymentMethod)!);

  const cashierMap = new Map<number, { id: number; name: string } & Tally>();
  for (const r of paid) {
    const cur = cashierMap.get(r.cashier.id) ?? {
      id: r.cashier.id,
      name: r.cashier.name,
      count: 0,
      total: 0,
    };
    cur.count += 1;
    cur.total += r.total;
    cashierMap.set(cur.id, cur);
  }

  const driverMap = new Map<number, { driverNumber: number } & Tally>();
  for (const r of live) {
    if (r.type !== "DELIVERY" || r.driverNumber === null) continue;
    const cur = driverMap.get(r.driverNumber) ?? {
      driverNumber: r.driverNumber,
      count: 0,
      total: 0,
    };
    cur.count += 1;
    cur.total += r.total;
    driverMap.set(cur.driverNumber, cur);
  }

  const itemMap = new Map<string, { name: string; quantity: number; total: number }>();
  for (const l of lines) {
    const cur = itemMap.get(l.itemNameSnapshot) ?? {
      name: l.itemNameSnapshot,
      quantity: 0,
      total: 0,
    };
    cur.quantity += l.quantity;
    cur.total += Number(l.lineTotal.toString());
    itemMap.set(cur.name, cur);
  }

  return {
    period,
    from: start.toISOString(),
    to: end.toISOString(),
    revenue,
    orders: paid.length,
    avgTicket: paid.length > 0 ? revenue / paid.length : 0,
    series,
    byType: ORDER_TYPES.map((type) => ({
      type,
      ...(typeMap.get(type) ?? { count: 0, total: 0 }),
    })),
    byMethod: REPORTED_METHODS.map((method) => ({
      method,
      ...(methodMap.get(method) ?? { count: 0, total: 0 }),
    })),
    byCashier: [...cashierMap.values()].sort((a, b) => b.total - a.total),
    byDriver: [...driverMap.values()].sort((a, b) => a.driverNumber - b.driverNumber),
    topItems: [...itemMap.values()].sort((a, b) => b.total - a.total).slice(0, 10),
    cancelled: {
      count: voided.length,
      total: voided.reduce((acc, r) => acc + r.total, 0),
    },
  };
}
