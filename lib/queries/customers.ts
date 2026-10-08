import "server-only";
import { db } from "../db";

export interface CustomerView {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  orderCount: number;
  address: {
    id: number;
    street: string;
    houseNumber: string;
    area: string | null;
    postalCode: string | null;
    city: string;
    /** How to find the door — floor, bell name, "gate is at the back". */
    notes: string | null;
  } | null;
}

type AddressRow = {
  id: number;
  street: string;
  houseNumber: string;
  area: string | null;
  postalCode: string | null;
  city: string;
  notes: string | null;
  isDefault: boolean;
};

/** The customer's default address (or the first on file), as the till sees it. */
export function pickAddress(addresses: AddressRow[]): CustomerView["address"] {
  const addr = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  return addr
    ? {
        id: addr.id,
        street: addr.street,
        houseNumber: addr.houseNumber,
        area: addr.area,
        postalCode: addr.postalCode,
        city: addr.city,
        notes: addr.notes,
      }
    : null;
}

function mapCustomer(c: {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  addresses: AddressRow[];
  _count: { orders: number };
}): CustomerView {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    orderCount: c._count.orders,
    address: pickAddress(c.addresses),
  };
}

/**
 * A search hit. Deliberately lighter than `CustomerView`: the lookup list shows
 * a name, a phone and (once picked) an address, so it does not pay for the
 * order-count subquery on every keystroke.
 */
export interface CustomerMatch {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: CustomerView["address"];
}

/**
 * Type-ahead lookup. Digits search the phone, letters search the name — one
 * column instead of both, since a cashier is never searching for a name with a
 * keypad. Capped at eight rows; only the columns the list needs are read.
 *
 * The name search is case-insensitive (`ILIKE`, not `LIKE`): nobody types a
 * capital into a till, and without this "ahmed" simply did not find "Ahmed".
 */
export async function searchCustomers(query: string): Promise<CustomerMatch[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const byPhone = /^[0-9+/\s-]+$/.test(q);

  const customers = await db.customer.findMany({
    relationLoadStrategy: "join",
    where: byPhone
      ? { phone: { contains: q } }
      : { name: { contains: q, mode: "insensitive" } },
    take: 8,
    orderBy: byPhone ? { phone: "asc" } : { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      addresses: {
        select: {
          id: true,
          street: true,
          houseNumber: true,
          area: true,
          postalCode: true,
          city: true,
          notes: true,
          isDefault: true,
        },
      },
    },
  });

  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: pickAddress(c.addresses),
  }));
}

export async function getCustomer(id: number): Promise<CustomerView | null> {
  const c = await db.customer.findUnique({
    relationLoadStrategy: "join",
    where: { id },
    include: { addresses: true, _count: { select: { orders: true } } },
  });
  return c ? mapCustomer(c) : null;
}

/**
 * Everyone who lives somewhere: customers whose address mentions the street,
 * the district or the postal code typed. For the cashier who has a name on
 * the phone but only "the one in Bruchhausen" in their head — and for seeing
 * at a glance how many customers a run to one district would serve.
 */
export async function searchCustomersByAddress(query: string): Promise<CustomerView[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const customers = await db.customer.findMany({
    relationLoadStrategy: "join",
    where: {
      addresses: {
        some: {
          OR: [
            { street: { contains: q, mode: "insensitive" } },
            { area: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { postalCode: { startsWith: q } },
          ],
        },
      },
    },
    take: 100,
    orderBy: { name: "asc" },
    include: { addresses: true, _count: { select: { orders: true } } },
  });
  return customers.map(mapCustomer);
}
