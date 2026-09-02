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
    postalCode: string;
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
    postalCode: string;
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
          postalCode: addr.postalCode,
          city: addr.city,
        }
      : null,
  };
}

export async function searchCustomers(query: string): Promise<CustomerView[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const customers = await db.customer.findMany({
    where: {
      OR: [{ phone: { contains: q } }, { name: { contains: q } }],
    },
    take: 8,
    orderBy: { name: "asc" },
    include: {
      addresses: true,
      _count: { select: { orders: true } },
    },
  });
  return customers.map(mapCustomer);
}

export async function getCustomer(id: number): Promise<CustomerView | null> {
  const c = await db.customer.findUnique({
    where: { id },
    include: { addresses: true, _count: { select: { orders: true } } },
  });
  return c ? mapCustomer(c) : null;
}
