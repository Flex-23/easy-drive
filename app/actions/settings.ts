"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/validations/settings";
import { requireCashier } from "@/lib/session";
import { locales } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

/**
 * The shop's settings, written from the till's Settings screen. This is a
 * public POST endpoint, so the guard is not optional.
 */
export async function updateSettings(
  raw: unknown,
): Promise<ActionResult<{ defaultLocale: string }>> {
  await requireCashier();
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "genericError", fieldErrors };
  }

  const d = parsed.data;
  const rows: { key: string; value: string; type: "STRING" | "NUMBER" | "LOCALE" }[] = [
    { key: "restaurantName", value: d.restaurantName, type: "STRING" },
    { key: "defaultLocale", value: d.defaultLocale, type: "LOCALE" },
    { key: "currency", value: d.currency, type: "STRING" },
    { key: "receiptHeader", value: d.receiptHeader, type: "STRING" },
    { key: "receiptFooter", value: d.receiptFooter, type: "STRING" },
    { key: "printerName", value: d.printerName, type: "STRING" },
    { key: "printerColumns", value: String(d.printerColumns), type: "NUMBER" },
  ];

  try {
    await db.$transaction(
      rows.map((r) =>
        db.setting.upsert({
          where: { key: r.key },
          create: r,
          update: { value: r.value, type: r.type },
        }),
      ),
    );
    for (const l of locales) revalidatePath(`/${l}`, "layout");
    return { ok: true, data: { defaultLocale: d.defaultLocale } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}
