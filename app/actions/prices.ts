"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { locales } from "@/lib/i18n/config";
import { eurosToCents, centsToDecimalString } from "@/lib/pricing";
import { itemPricesSchema } from "@/lib/validations/master";
import { requireCashier } from "@/lib/session";
import type { ActionResult } from "@/types/order";

/**
 * The one catalogue change the till is allowed: what a dish costs. Everything
 * else about the menu belongs to the Master panel. A public POST endpoint like
 * every action, so it opens with the cashier guard.
 *
 * A one-price dish takes one price; a dish sold in sizes takes one full price
 * per size, in the order the sizes are kept — the first becomes the base price
 * and the rest their difference from it, exactly as the panel stores them.
 */
export async function saveItemPrices(
  raw: unknown,
): Promise<ActionResult<{ id: number }>> {
  await requireCashier();
  const parsed = itemPricesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "genericError" };
  const { itemId, prices } = parsed.data;

  try {
    const sizeGroup = await db.optionGroup.findFirst({
      where: { menuItemId: itemId, kind: "SIZE" },
      select: {
        choices: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } },
      },
    });
    const sizes = sizeGroup?.choices ?? [];
    // One price per thing that has one — anything else is a stale screen.
    if (prices.length !== Math.max(1, sizes.length)) {
      return { ok: false, error: "genericError" };
    }

    const baseCents = eurosToCents(prices[0]);
    await db.$transaction([
      db.menuItem.update({
        where: { id: itemId },
        data: { basePrice: centsToDecimalString(baseCents) },
      }),
      ...sizes.map((size, i) =>
        db.optionChoice.update({
          where: { id: size.id },
          data: { priceDelta: centsToDecimalString(eurosToCents(prices[i]) - baseCents) },
        }),
      ),
    ]);
    // The menu the till reads on every screen just changed.
    for (const l of locales) revalidatePath(`/${l}`, "layout");
    return { ok: true, data: { id: itemId } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}
