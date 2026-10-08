import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Customer writes that more than one caller needs. Reads live in
 * `queries/customers.ts`; this is the same split `orders.ts` follows.
 */

/** The address fields the till's customer form and an online order share. */
export interface AddressInput {
  street: string;
  houseNumber: string;
  area?: string | null;
  postalCode?: string | null;
  city: string;
  notes?: string | null;
}

/**
 * Put `address` on file as the customer's default, replacing whatever was there.
 *
 * A customer has one address that matters — the one a driver is sent to — so it
 * is updated in place rather than growing a list nobody prunes. Every blank
 * field is written as NULL rather than skipped, so clearing a line clears it.
 *
 * Both callers go through here on purpose. The online endpoint used to create an
 * address only inside the *create* half of its customer upsert, which meant a
 * returning customer's delivery was sent to whatever old address was on file —
 * or, if they had only ever collected in person, to no address at all.
 */
export async function setDefaultAddress(
  tx: Prisma.TransactionClient,
  customerId: number,
  address: AddressInput,
): Promise<{ id: number }> {
  const data = {
    street: address.street,
    houseNumber: address.houseNumber,
    area: address.area || null,
    postalCode: address.postalCode || null,
    city: address.city,
    notes: address.notes || null,
    isDefault: true,
  };

  const existing = await tx.customerAddress.findFirst({
    where: { customerId, isDefault: true },
    select: { id: true },
  });

  return existing
    ? tx.customerAddress.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      })
    : tx.customerAddress.create({
        data: { ...data, customerId },
        select: { id: true },
      });
}
