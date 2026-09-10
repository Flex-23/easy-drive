"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { customerSchema } from "@/lib/validations/customer";
import { setDefaultAddress } from "@/lib/customers";
import {
  searchCustomers,
  type CustomerView,
  type CustomerMatch,
} from "@/lib/queries/customers";
import { requireCashier } from "@/lib/session";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

/**
 * The customer book. Both exports are public POST endpoints, and between them
 * they can read out and rewrite every name, phone number and address the shop
 * holds — so both open with the guard.
 */

function safeLocale(v: unknown): Locale {
  return typeof v === "string" && isLocale(v) ? v : defaultLocale;
}

export async function searchCustomersAction(
  query: string,
): Promise<CustomerMatch[]> {
  await requireCashier();
  return searchCustomers(query);
}

export async function upsertCustomer(
  raw: unknown,
): Promise<ActionResult<CustomerView>> {
  await requireCashier();
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
      const saved = id
        ? await tx.customer.update({
            where: { id },
            data: { name, phone, email: email || null, notes: notes || null },
          })
        : await tx.customer.create({
            data: { name, phone, email: email || null, notes: notes || null },
          });
      if (address) await setDefaultAddress(tx, saved.id, address);
      return saved;
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
