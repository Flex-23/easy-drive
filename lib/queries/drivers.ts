import "server-only";
import { db } from "../db";
import { businessDay } from "../business-day";
import { Prisma } from "@prisma/client";
import type { OrderStatus, OrderType } from "@prisma/client";

export interface DriverOrderLine {
  id: number;
  itemNumber: number | null;
  name: string;
  quantity: number;
  /** Euros — the tickets print prices, the kitchen copy does not. */
  lineTotal: number;
  options: string[];
  kitchenNotes: string | null;
}

export interface DriverOrder {
  id: number;
  orderNumber: string;
  /** Pickup or delivery — the board shows this as the order's state. */
  type: OrderType;
  total: number;
  driverNumber: number | null;
  status: OrderStatus;
  paid: boolean;
  paidCash: boolean;
  paidOnline: boolean;
  cancelled: boolean;
  createdAt: string;
  /** The bill, so a receipt can be printed from the board. */
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  cashierName: string;
  customerName: string | null;
  customerPhone: string | null;
  /** Where the order is going — null for a pickup. */
  address: string | null;
  /** The customer's address on file, whether or not this order is a delivery. */
  customerAddress: string | null;
  lines: DriverOrderLine[];
}

export interface DriverBoard {
  /** Section 1: orders nobody has settled yet — no driver, no payment. */
  pending: DriverOrder[];
  /** Section 2: sent with a driver, paid at the counter, or cancelled. */
  processed: DriverOrder[];
  pendingCount: number;
  pendingSum: number;
  processedCount: number;
  /** Total of processed orders excluding cancelled ones. */
  processedSum: number;
}

const ORDER_INCLUDE = {
  customer: {
    select: {
      name: true,
      phone: true,
      addresses: { orderBy: { isDefault: "desc" }, take: 1 },
    },
  },
  cashier: { select: { name: true } },
  address: true,
  lines: {
    include: {
      options: true,
      menuItem: { select: { itemNumber: true } },
    },
  },
} as const;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

type AddressRow = {
  street: string;
  houseNumber: string;
  area: string | null;
  postalCode: string | null;
  city: string;
};

const formatAddress = (a: AddressRow) =>
  [
    `${a.street} ${a.houseNumber}`,
    a.area,
    a.postalCode ? `${a.postalCode} ${a.city}` : a.city,
  ]
    .filter(Boolean)
    .join(", ");

/** One database row as the board and the printed tickets see it. */
function toDriverOrder(o: OrderRow): DriverOrder {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    type: o.type,
    total: Number(o.total.toString()),
    driverNumber: o.driverNumber,
    status: o.status,
    paid: o.paidAt !== null,
    paidCash: o.paymentMethod === "CASH",
    paidOnline: o.paymentMethod === "ONLINE",
    cancelled: o.status === "CANCELLED",
    createdAt: o.createdAt.toISOString(),
    subtotal: Number(o.subtotal.toString()),
    discount: Number(o.discountAmount.toString()),
    deliveryFee: Number(o.deliveryFee.toString()),
    tax: Number(o.taxAmount.toString()),
    cashierName: o.cashier.name,
    customerName: o.customer?.name ?? null,
    customerPhone: o.customer?.phone ?? null,
    address: o.address ? formatAddress(o.address) : null,
    customerAddress: o.customer?.addresses[0]
      ? formatAddress(o.customer.addresses[0])
      : null,
    lines: o.lines.map((l) => ({
      id: l.id,
      itemNumber: l.menuItem?.itemNumber ?? null,
      name: l.itemNameSnapshot,
      quantity: l.quantity,
      lineTotal: Number(l.lineTotal.toString()),
      options: l.options.map((op) => op.choiceNameSnapshot),
      kitchenNotes: l.kitchenNotes,
    })),
  };
}

/** One order, ready to be printed as a receipt, a kitchen bon or a label. */
export async function getOrderForTicket(id: number): Promise<DriverOrder | null> {
  const order = await db.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  return order ? toDriverOrder(order) : null;
}

/**
 * The orders board for the running business day (05:00 to 05:00 Berlin). At
 * 05:00 it therefore empties itself: yesterday's rows stay in the database and
 * in the reports, they simply stop crowding the dispatcher's screen.
 *
 * It carries both pickup and delivery orders, because this screen — not a modal
 * at the till — is where an order is settled: handed to a driver, or paid.
 */
export async function getDriverBoard(): Promise<DriverBoard> {
  const { start, end } = businessDay();
  const orders = await db.order.findMany({
    where: {
      type: { in: ["DELIVERY", "PICKUP"] },
      status: { in: ["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"] },
      createdAt: { gte: start, lt: end },
    },
    orderBy: { createdAt: "asc" },
    include: ORDER_INCLUDE,
  });

  const all = orders.map(toDriverOrder);

  // Pending: still waiting for someone to settle it — newest first.
  const pending = all
    .filter((o) => !o.cancelled && o.driverNumber === null && !o.paid)
    .reverse();
  // Processed: sent with a driver, paid at the counter, or cancelled.
  const processed = all.filter(
    (o) => o.driverNumber !== null || o.paid || o.cancelled,
  );

  return {
    pending,
    processed,
    pendingCount: pending.length,
    pendingSum: pending.reduce((acc, o) => acc + o.total, 0),
    processedCount: processed.length,
    processedSum: processed
      .filter((o) => !o.cancelled)
      .reduce((acc, o) => acc + o.total, 0),
  };
}
