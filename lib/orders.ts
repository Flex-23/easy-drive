import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  computeOrderTotals,
  eurosToCents,
  centsToDecimalString,
  type Cents,
} from "./pricing";
import { businessDay } from "./business-day";
import type { Locale } from "./i18n/config";
import type { OrderLineInput } from "./validations/order";

const Dc = (cents: Cents) => new Prisma.Decimal(centsToDecimalString(cents));

export type BuildResult =
  | { ok: true; linesCreate: Prisma.OrderLineCreateWithoutOrderInput[]; totals: ReturnType<typeof computeOrderTotals> }
  | { ok: false; error: string };

/**
 * Recomputes an order entirely from the database. The client sends only item
 * ids, choice ids, and quantities — every price is looked up server-side and
 * every required option group is enforced here (same rule as the Zod schema).
 * Names and prices are snapshotted so later menu edits never rewrite history.
 */
export async function buildOrderData(
  lines: OrderLineInput[],
  discountCents: number,
  deliveryCents: number,
  taxRate: number,
  locale: Locale,
): Promise<BuildResult> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const items = await db.menuItem.findMany({
    where: { id: { in: itemIds }, isActive: true },
    include: {
      translations: true,
      optionGroups: {
        include: { translations: true, choices: { include: { translations: true } } },
      },
    },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const trName = (t: { locale: string; name: string }[]) =>
    t.find((x) => x.locale === locale)?.name ?? t[0]?.name ?? "";

  const linesCreate: Prisma.OrderLineCreateWithoutOrderInput[] = [];
  const priceLines: {
    basePrice: Cents;
    quantity: number;
    options: { priceDelta: Cents }[];
  }[] = [];

  for (const line of lines) {
    const item = itemMap.get(line.itemId);
    if (!item) return { ok: false, error: "genericError" };

    const chosen = new Set(line.choiceIds);
    const optionSnapshots: Prisma.OrderLineOptionCreateWithoutOrderLineInput[] = [];
    const optionPrices: { priceDelta: Cents }[] = [];

    for (const group of item.optionGroups) {
      const selectedInGroup = group.choices.filter((c) => chosen.has(c.id));
      if (group.isRequired && selectedInGroup.length === 0) {
        return { ok: false, error: "optionRequired" };
      }
      if (group.selectionType === "SINGLE" && selectedInGroup.length > 1) {
        return { ok: false, error: "genericError" };
      }
      for (const choice of selectedInGroup) {
        const delta = eurosToCents(choice.priceDelta.toString());
        optionPrices.push({ priceDelta: delta });
        optionSnapshots.push({
          groupNameSnapshot: trName(group.translations),
          choiceNameSnapshot: trName(choice.translations),
          priceDelta: Dc(delta),
        });
      }
    }

    const basePrice = eurosToCents(item.basePrice.toString());
    priceLines.push({ basePrice, quantity: line.quantity, options: optionPrices });

    linesCreate.push({
      menuItem: { connect: { id: item.id } },
      itemNameSnapshot: trName(item.translations),
      unitPrice: new Prisma.Decimal(0), // set below once computed
      quantity: line.quantity,
      lineTotal: new Prisma.Decimal(0),
      kitchenNotes: line.kitchenNotes || null,
      options: { create: optionSnapshots },
    });
  }

  const totals = computeOrderTotals({
    lines: priceLines,
    discountAmount: discountCents,
    deliveryFee: deliveryCents,
    taxRate,
  });

  totals.lines.forEach((computed, i) => {
    linesCreate[i].unitPrice = Dc(computed.unitPrice);
    linesCreate[i].lineTotal = Dc(computed.lineTotal);
  });

  return { ok: true, linesCreate, totals };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The day's four letters, e.g. `KX…ZR`. They are the day itself written in
 * base 26, so two different days can never produce the same pair — which is
 * what makes the order number unique without a lookup or a retry loop. Four
 * letters carry about 1250 years of days.
 */
function dayLetters(dayStart: Date): { prefix: string; suffix: string } {
  let index = Math.floor(dayStart.getTime() / 86_400_000) % (26 ** 4);
  const chars: string[] = [];
  for (let i = 0; i < 4; i++) {
    chars.unshift(LETTERS[index % 26]);
    index = Math.floor(index / 26);
  }
  return { prefix: chars[0] + chars[1], suffix: chars[2] + chars[3] };
}

/**
 * `KX042ZR` — two letters, the order's number within the business day, then two
 * letters. Short enough to call across the counter, and it carries the day with
 * it. The counter follows the 05:00 business day, so the first order after the
 * morning boundary is 001.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<string> {
  const { start, end } = businessDay(now);
  const { prefix, suffix } = dayLetters(start);
  const count = await tx.order.count({
    where: { createdAt: { gte: start, lt: end } },
  });
  return `${prefix}${String(count + 1).padStart(3, "0")}${suffix}`;
}

export { Dc as decimalFromCents };
