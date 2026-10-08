import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  computeOrderTotals,
  eurosToCents,
  centsToDecimalString,
  type Cents,
} from "./pricing";
import { businessDay, businessDayLabel } from "./business-day";
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
  locale: Locale,
): Promise<BuildResult> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const items = await db.menuItem.findMany({
    relationLoadStrategy: "join",
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

    const chosen = new Map(line.choices.map((c) => [c.id, c.priceCents]));
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
        // A size is what the menu says it is. An extra costs what was typed
        // for it at the till; an order that arrived without a price (the online
        // channel) falls back to the menu's figure.
        const typed = chosen.get(choice.id);
        const delta =
          group.kind === "EXTRA" && typed !== undefined
            ? typed
            : eurosToCents(choice.priceDelta.toString());
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
  });

  totals.lines.forEach((computed, i) => {
    linesCreate[i].unitPrice = Dc(computed.unitPrice);
    linesCreate[i].lineTotal = Dc(computed.lineTotal);
  });

  return { ok: true, linesCreate, totals };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LENGTH = 6;

/**
 * `K7M2QX` — six characters, each a capital letter or a digit drawn fresh.
 * Short enough to read out across the counter, and it says nothing about the
 * order: not the day, not how many came before it, not how the shop is doing.
 * A customer holding two receipts learns nothing from the pair.
 *
 * 36⁶ is about 2 billion, so a collision is vanishingly unlikely — but
 * `orderNumber` is unique in the database, and "unlikely" is not a guarantee
 * anyone should have to sell food on. `withOrderNumber` draws another and
 * tries again if the improbable happens.
 */
export function randomOrderNumber(): string {
  let out = "";
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * The order's place in its business day — 1, 2, 3 — which is the number called
 * out when the food is ready. The order number cannot supply it any more, so it
 * comes from `OrderCounter`.
 *
 * Not by counting rows: recalling or deleting a parked bill lowers the count, so
 * two orders end up called the same number, and two terminals saving in the same
 * instant read the same count. The statement below moves the day's counter and
 * reads the new value in one step, which the row lock makes atomic.
 */
async function nextDaySequence(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<number> {
  const [{ last }] = await tx.$queryRaw<[{ last: number }]>`
    INSERT INTO "OrderCounter" ("day", "last")
    VALUES (${businessDayLabel(businessDay(now))}, 1)
    ON CONFLICT ("day") DO UPDATE SET "last" = "OrderCounter"."last" + 1
    RETURNING "last"`;
  return last;
}

/** What every order is stamped with the moment it is written. */
export interface OrderIdentity {
  orderNumber: string;
  daySequence: number;
}

/** Postgres refusing a duplicate `orderNumber`, as Prisma reports it. */
function isNumberTaken(e: unknown): boolean {
  const error = e as { code?: string; meta?: { target?: unknown } };
  if (error?.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes("orderNumber") : true;
}

const NUMBER_ATTEMPTS = 5;

/**
 * Writes an order inside a transaction, handing `write` the number and the day's
 * sequence to stamp it with. If the drawn number turns out to be taken, the
 * whole transaction is rolled back and retried with a fresh one — which is why
 * the number is drawn in here rather than by the caller.
 *
 * Every order in the app is created through this, so the retry exists once.
 */
export async function withOrderNumber<T>(
  now: Date,
  write: (tx: Prisma.TransactionClient, identity: OrderIdentity) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const daySequence = await nextDaySequence(tx, now);
        return write(tx, { orderNumber: randomOrderNumber(), daySequence });
      });
    } catch (e) {
      if (attempt >= NUMBER_ATTEMPTS || !isNumberTaken(e)) throw e;
      // A retry costs this day's sequence a number, since the counter rolled
      // back with everything else. A gap in the tally is worth less than a sale
      // that cannot be rung up.
    }
  }
}

export { Dc as decimalFromCents };
