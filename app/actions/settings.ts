"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/validations/settings";
import { locales } from "@/lib/i18n/config";
import type { ActionResult } from "@/types/order";

export async function updateSettings(
  raw: unknown,
): Promise<ActionResult<{ defaultLocale: string }>> {
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
    { key: "taxRate", value: (d.taxRatePercent / 100).toString(), type: "NUMBER" },
    { key: "deliveryFee", value: d.deliveryFee.toFixed(2), type: "NUMBER" },
    { key: "receiptHeader", value: d.receiptHeader, type: "STRING" },
    { key: "receiptFooter", value: d.receiptFooter, type: "STRING" },
    { key: "printerName", value: d.printerName, type: "STRING" },
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
