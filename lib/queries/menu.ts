import "server-only";
import { db } from "../db";
import { eurosToCents } from "../pricing";
import type { Locale } from "../i18n/config";
import type { CategoryView, MenuItemView } from "@/types/menu";

type Tr = { locale: string; name: string; description: string | null };

function pick(translations: Tr[], locale: Locale): Tr | undefined {
  return (
    translations.find((t) => t.locale === locale) ?? translations[0]
  );
}
function name(translations: Tr[], locale: Locale): string {
  return pick(translations, locale)?.name ?? "";
}
function nameFor(translations: Tr[], locale: "ar" | "de"): string {
  return translations.find((t) => t.locale === locale)?.name ?? "";
}

/**
 * The full active menu resolved for one locale, prices in integer cents.
 * A single query with translations joined — no N+1. Both language names are
 * returned per item so search can match either script.
 */
export async function getMenu(locale: Locale): Promise<CategoryView[]> {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      translations: true,
      items: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { itemNumber: "asc" }],
        include: {
          translations: true,
          optionGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              translations: true,
              choices: {
                orderBy: { sortOrder: "asc" },
                include: { translations: true },
              },
            },
          },
        },
      },
    },
  });

  return categories
    .filter((c) => c.items.length > 0)
    .map((c): CategoryView => {
      const categoryName = name(c.translations, locale);
      return {
        id: c.id,
        slug: c.slug,
        name: categoryName,
        icon: c.icon,
        items: c.items.map(
          (item): MenuItemView => ({
            id: item.id,
            itemNumber: item.itemNumber,
            basePrice: eurosToCents(item.basePrice.toString()),
            name: name(item.translations, locale),
            nameDe: nameFor(item.translations, "de"),
            nameAr: nameFor(item.translations, "ar"),
            description: pick(item.translations, locale)?.description ?? null,
            categoryId: c.id,
            categorySlug: c.slug,
            categoryName,
            isPopular: item.isPopular,
            groups: item.optionGroups.map((g) => ({
              id: g.id,
              name: name(g.translations, locale),
              kind: g.kind,
              selectionType: g.selectionType,
              isRequired: g.isRequired,
              isCollapsible: g.isCollapsible,
              choices: g.choices.map((ch) => ({
                id: ch.id,
                name: name(ch.translations, locale),
                priceDelta: eurosToCents(ch.priceDelta.toString()),
                isDefault: ch.isDefault,
              })),
            })),
          }),
        ),
      };
    });
}
