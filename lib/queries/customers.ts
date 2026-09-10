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
  } | null;
}

function mapCustomer(c: {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  addresses: {
    id: number;
    street: string;
    houseNumber: string;
    area: string | null;
    postalCode: string | null;
    city: string;
    isDefault: boolean;
  }[];
  _count: { orders: number };
}): CustomerView {
  const addr =
    c.addresses.find((a) => a.isDefault) ?? c.addresses[0] ?? null;
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    orderCount: c._count.orders,
    address: addr
      ? {
          id: addr.id,
          street: addr.street,
          houseNumber: addr.houseNumber,
          area: addr.area,
          postalCode: addr.postalCode,
          city: addr.city,
        }
      : null,
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
          isDefault: true,
        },
      },
    },
  });

  return customers.map((c) => {
    const addr = c.addresses.find((a) => a.isDefault) ?? c.addresses[0] ?? null;
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: addr
        ? {
            id: addr.id,
            street: addr.street,
            houseNumber: addr.houseNumber,
            area: addr.area,
            postalCode: addr.postalCode,
            city: addr.city,
          }
        : null,
    };
  });
}

export async function getCustomer(id: number): Promise<CustomerView | null> {
  const c = await db.customer.findUnique({
    where: { id },
    include: { addresses: true, _count: { select: { orders: true } } },
  });
  return c ? mapCustomer(c) : null;
}
