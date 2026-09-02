import "server-only";
import { db } from "../db";
import type { OrderStatus } from "@prisma/client";

export interface DriverOrderLine {
  id: number;
  itemNumber: number | null;
  name: string;
  quantity: number;
  options: string[];
  kitchenNotes: string | null;
}

export interface DriverOrder {
  id: number;
  orderNumber: string;
  total: number;
  driverNumber: number | null;
  status: OrderStatus;
  paid: boolean;
  paidOnline: boolean;
  cancelled: boolean;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  lines: DriverOrderLine[];
}

export interface DriverBoard {
  /** Section 1: active delivery orders still waiting to be handled. */
  pending: DriverOrder[];
  /** Section 2: orders with a driver, paid online, or cancelled. */
  processed: DriverOrder[];
  pendingCount: number;
  pendingSum: number;
  processedCount: number;
  /** Total of processed orders excluding cancelled ones. */
  processedSum: number;
}

/** The orders board (delivery orders in their operational lifecycle). */
export async function getDriverBoard(): Promise<DriverBoard> {
  const orders = await db.order.findMany({
    where: {
      type: "DELIVERY",
      status: { in: ["PENDING", "PREPARING", "READY", "CANCELLED"] },
    },
    orderBy: { createdAt: "asc" },
    include: {
      customer: { select: { name: true, phone: true } },
      address: true,
      lines: {
        include: {
          options: true,
          menuItem: { select: { itemNumber: true } },
        },
      },
    },
  });

  const map = (o: (typeof orders)[number]): DriverOrder => ({
    id: o.id,
    orderNumber: o.orderNumber,
    total: Number(o.total.toString()),
    driverNumber: o.driverNumber,
    status: o.status,
    paid: o.paidAt !== null,
    paidOnline: o.paymentMethod === "ONLINE",
    cancelled: o.status === "CANCELLED",
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
          .join("، ")
      : null,
    lines: o.lines.map((l) => ({
      id: l.id,
      itemNumber: l.menuItem?.itemNumber ?? null,
      name: l.itemNameSnapshot,
      quantity: l.quantity,
      options: l.options.map((op) => op.choiceNameSnapshot),
      kitchenNotes: l.kitchenNotes,
    })),
  });

  const all = orders.map(map);

  // Pending: unassigned, active, and not paid online.
  const pending = all.filter(
    (o) => !o.cancelled && o.driverNumber === null && !o.paidOnline,
  );
  // Processed: has a driver, or paid online, or cancelled.
  const processed = all.filter(
    (o) => o.driverNumber !== null || o.paidOnline || o.cancelled,
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
