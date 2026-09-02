"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { customerSchema } from "@/lib/validations/customer";
import { searchCustomers, type CustomerView } from "@/lib/queries/customers";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

function safeLocale(v: unknown): Locale {
  return typeof v === "string" && isLocale(v) ? v : defaultLocale;
}

export async function searchCustomersAction(
  query: string,
): Promise<CustomerView[]> {
  return searchCustomers(query);
}

export async function upsertCustomer(
  raw: unknown,
): Promise<ActionResult<CustomerView>> {
  const locale = safeLocale((raw as { locale?: string })?.locale);
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "genericError", fieldErrors };
  }

  const { id, name, phone, email, notes, address } = parsed.data;

  try {
    const customer = await db.$transaction(async (tx) => {
      if (id) {
        const updated = await tx.customer.update({
          where: { id },
          data: {
            name,
            phone,
            email: email || null,
            notes: notes || null,
          },
        });
        if (address) {
          const existing = await tx.customerAddress.findFirst({
            where: { customerId: id, isDefault: true },
          });
          if (existing) {
            await tx.customerAddress.update({
              where: { id: existing.id },
              data: { ...address, notes: address.notes || null },
            });
          } else {
            await tx.customerAddress.create({
              data: {
                ...address,
                notes: address.notes || null,
                isDefault: true,
                customerId: id,
              },
            });
          }
        }
        return updated;
      }
      return tx.customer.create({
        data: {
          name,
          phone,
          email: email || null,
          notes: notes || null,
          addresses: address
            ? {
                create: {
                  ...address,
                  notes: address.notes || null,
                  isDefault: true,
                },
              }
            : undefined,
        },
      });
    });

    revalidatePath(`/${locale}`);

    const full = await db.customer.findUnique({
      where: { id: customer.id },
      include: { addresses: true, _count: { select: { orders: true } } },
    });
    const addr = full?.addresses.find((a) => a.isDefault) ?? full?.addresses[0];
    const view: CustomerView = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      orderCount: full?._count.orders ?? 0,
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
    return { ok: true, data: view };
  } catch (e) {
    // Unique constraint on phone → friendly, localized field error.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error: "phoneExists",
        fieldErrors: { phone: "phoneExists" },
      };
    }
    return { ok: false, error: "genericError" };
  }
}
