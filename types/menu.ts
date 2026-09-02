import type { Cents } from "@/lib/pricing";

/** Menu shapes resolved for the active locale, with prices in integer cents. */
export interface ChoiceView {
  id: number;
  name: string;
  priceDelta: Cents;
  isDefault: boolean;
}

export interface GroupView {
  id: number;
  name: string;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  isCollapsible: boolean;
  choices: ChoiceView[];
}

export interface MenuItemView {
  id: number;
  itemNumber: number;
  basePrice: Cents;
  name: string;
  /** German name, always present — used for RTL-independent search. */
  nameDe: string;
  /** Arabic name, always present — used for cross-language search. */
  nameAr: string;
  description: string | null;
  categoryId: number;
  categorySlug: string;
  categoryName: string;
  isPopular: boolean;
  groups: GroupView[];
}

export interface CategoryView {
  id: number;
  slug: string;
  name: string;
  icon: string | null;
  items: MenuItemView[];
}
