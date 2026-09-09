"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { locales } from "@/lib/i18n/config";
import { eurosToCents, centsToDecimalString } from "@/lib/pricing";
import { categorySchema, menuItemSchema } from "@/lib/validations/master";
import type { DishSizeInput } from "@/lib/validations/master";
import { getPanelSession } from "@/lib/auth/master-session";
import type { Prisma } from "@prisma/client";
import type { ActionResult } from "@/types/order";

/**
 * Catalogue mutations for the Master area. The menu these write is the one the
 * POS reads on every screen, so each mutation revalidates the whole locale
 * layout rather than a single path.
 */

const LOCALES = ["ar", "de"] as const;

function revalidateMenu() {
  for (const l of locales) revalidatePath(`/${l}`, "layout");
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

/** Every action here is a public POST endpoint — the panel session is the gate. */
async function denied(): Promise<boolean> {
  return (await getPanelSession()) === null;
}

function fieldError(field: string, message: string): ActionResult<never> {
  return { ok: false, error: "genericError", fieldErrors: { [field]: message } };
}

/* ------------------------------- categories ------------------------------ */

/** Create or update a category together with both of its translations. */
export async function saveCategory(
  raw: unknown,
): Promise<ActionResult<{ id: number }>> {
  if (await denied()) return { ok: false, error: "unauthorized" };
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const key = i.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = i.message;
    }
    return { ok: false, error: "genericError", fieldErrors };
  }
  const d = parsed.data;
  // One entered name, stored for both locales.
  const names = { ar: d.name, de: d.name } as const;

  try {
    if (d.id === undefined) {
      const created = await db.category.create({
        data: {
          slug: d.slug,
          icon: d.icon || null,
          isActive: d.isActive,
          translations: {
            create: LOCALES.map((l) => ({ locale: l, name: names[l] })),
          },
        },
        select: { id: true },
      });
      revalidateMenu();
      return { ok: true, data: { id: created.id } };
    }

    const id = d.id;
    await db.$transaction([
      db.category.update({
        where: { id },
        data: {
          slug: d.slug,
          icon: d.icon || null,
          isActive: d.isActive,
        },
      }),
      ...LOCALES.map((l) =>
        db.categoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: id, locale: l } },
          create: { categoryId: id, locale: l, name: names[l] },
          update: { name: names[l] },
        }),
      ),
    ]);
    revalidateMenu();
    return { ok: true, data: { id } };
  } catch (e) {
    if (isUniqueViolation(e)) return fieldError("slug", "slugExists");
    return { ok: false, error: "genericError" };
  }
}

/**
 * Delete a category. Refused while it still holds items — the schema would
 * cascade them away, taking their menu history with them.
 */
export async function deleteCategory(
  id: number,
): Promise<ActionResult<{ id: number }>> {
  if (await denied()) return { ok: false, error: "unauthorized" };
  try {
    const items = await db.menuItem.count({ where: { categoryId: id } });
    if (items > 0) return { ok: false, error: "categoryNotEmpty" };
    await db.category.delete({ where: { id } });
    revalidateMenu();
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

/* ---------------------------------- items -------------------------------- */

/**
 * The size group's own name — what the POS prints as the legend above the size
 * buttons. Kept identical to the seeded groups so a dish that already had sizes
 * keeps reading the same on screen and on paper.
 */
const SIZE_GROUP_NAME = { ar: "الحجم", de: "Größe" } as const;

/**
 * The panel enters a full price per size; the POS prices a line as the dish's
 * base price plus the surcharge of each chosen option. So the first size sets
 * the base price and every size becomes its difference from it — the first one
 * therefore 0, and the default the cashier starts on.
 */
function sizeChoices(
  sizes: DishSizeInput[],
  baseCents: number,
): Prisma.OptionChoiceCreateWithoutOptionGroupInput[] {
  return sizes.map((size, i) => ({
    priceDelta: centsToDecimalString(eurosToCents(size.price) - baseCents),
    isDefault: i === 0,
    sortOrder: i,
    translations: {
      create: LOCALES.map((l) => ({ locale: l, name: size.name })),
    },
  }));
}

/** A size group is always one required choice out of the list. */
function sizeGroupData(sizes: DishSizeInput[], baseCents: number) {
  return {
    kind: "SIZE",
    selectionType: "SINGLE",
    isRequired: true,
    isCollapsible: false,
    sortOrder: 0,
    translations: {
      create: LOCALES.map((l) => ({ locale: l, name: SIZE_GROUP_NAME[l] })),
    },
    choices: { create: sizeChoices(sizes, baseCents) },
  } satisfies Prisma.OptionGroupCreateWithoutMenuItemInput;
}

/** Create or update a dish together with both of its translations. */
export async function saveMenuItem(
  raw: unknown,
): Promise<ActionResult<{ id: number }>> {
  if (await denied()) return { ok: false, error: "unauthorized" };
  const parsed = menuItemSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const key = i.path.join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = i.message;
    }
    return { ok: false, error: "genericError", fieldErrors };
  }
  const d = parsed.data;
  // With sizes, the first one is the price of the dish; the field is ignored.
  const baseCents = eurosToCents(
    d.sizes.length > 0 ? d.sizes[0].price : d.basePrice,
  );
  const price = centsToDecimalString(baseCents);
  // One entered name/description, stored for both locales.
  const text = { name: d.name, description: d.description || null };
  const tr = { ar: text, de: text } as const;

  try {
    const category = await db.category.findUnique({
      where: { id: d.categoryId },
      select: { id: true },
    });
    if (!category) return fieldError("categoryId", "required");

    if (d.id === undefined) {
      const created = await db.menuItem.create({
        data: {
          itemNumber: d.itemNumber,
          categoryId: d.categoryId,
          basePrice: price,
          isActive: d.isActive,
          isPopular: d.isPopular,
          translations: {
            create: LOCALES.map((l) => ({ locale: l, ...tr[l] })),
          },
          ...(d.sizes.length > 0
            ? { optionGroups: { create: [sizeGroupData(d.sizes, baseCents)] } }
            : {}),
        },
        select: { id: true },
      });
      revalidateMenu();
      return { ok: true, data: { id: created.id } };
    }

    const id = d.id;
    // Only the size group is the panel's to rewrite; extras (dips, drinks) are
    // left exactly as they are.
    const sizeGroup = await db.optionGroup.findFirst({
      where: { menuItemId: id, kind: "SIZE" },
      select: { id: true },
    });

    await db.$transaction([
      db.menuItem.update({
        where: { id },
        data: {
          itemNumber: d.itemNumber,
          categoryId: d.categoryId,
          basePrice: price,
          isActive: d.isActive,
          isPopular: d.isPopular,
        },
      }),
      ...LOCALES.map((l) =>
        db.menuItemTranslation.upsert({
          where: { menuItemId_locale: { menuItemId: id, locale: l } },
          create: { menuItemId: id, locale: l, ...tr[l] },
          update: { ...tr[l] },
        }),
      ),
      // Choices are rewritten rather than diffed: an order stores the size it
      // was sold with as a text snapshot, so no history hangs off these rows.
      ...(d.sizes.length === 0
        ? sizeGroup
          ? [db.optionGroup.delete({ where: { id: sizeGroup.id } })]
          : []
        : sizeGroup
          ? [
              db.optionGroup.update({
                where: { id: sizeGroup.id },
                data: {
                  selectionType: "SINGLE",
                  isRequired: true,
                  isCollapsible: false,
                  choices: {
                    deleteMany: {},
                    create: sizeChoices(d.sizes, baseCents),
                  },
                },
              }),
            ]
          : [
              db.optionGroup.create({
                data: { menuItemId: id, ...sizeGroupData(d.sizes, baseCents) },
              }),
            ]),
    ]);
    revalidateMenu();
    return { ok: true, data: { id } };
  } catch (e) {
    if (isUniqueViolation(e)) return fieldError("itemNumber", "itemNumberExists");
    return { ok: false, error: "genericError" };
  }
}

/** Show/hide a dish on the POS without touching its history. */
export async function setMenuItemActive(
  id: number,
  isActive: boolean,
): Promise<ActionResult<{ id: number }>> {
  if (await denied()) return { ok: false, error: "unauthorized" };
  try {
    await db.menuItem.update({ where: { id }, data: { isActive } });
    revalidateMenu();
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}

/**
 * Delete a dish. Refused once it appears on an order — deactivate it instead,
 * so past receipts keep their link to the catalogue.
 */
export async function deleteMenuItem(
  id: number,
): Promise<ActionResult<{ id: number }>> {
  if (await denied()) return { ok: false, error: "unauthorized" };
  try {
    const used = await db.orderLine.count({ where: { menuItemId: id } });
    if (used > 0) return { ok: false, error: "itemInUse" };
    await db.menuItem.delete({ where: { id } });
    revalidateMenu();
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, error: "genericError" };
  }
}
