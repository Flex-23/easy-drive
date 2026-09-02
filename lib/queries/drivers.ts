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
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  lines: DriverOrderLine[];
}

export interface DriverBoard {
  unassigned: DriverOrder[];
  assigned: DriverOrder[];
  unassignedCount: number;
  assignedCount: number;
  assignedSum: number;
}

/** Delivery orders that still need handling on the dispatch board. */
export async function getDriverBoard(): Promise<DriverBoard> {
  const orders = await db.order.findMany({
    where: {
      type: "DELIVERY",
      status: { in: ["PENDING", "PREPARING", "READY"] },
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
  const unassigned = all.filter((o) => o.driverNumber === null);
  const assigned = all.filter((o) => o.driverNumber !== null);

  return {
    unassigned,
    assigned,
    unassignedCount: unassigned.length,
    assignedCount: assigned.length,
    assignedSum: assigned.reduce((acc, o) => acc + o.total, 0),
  };
}
