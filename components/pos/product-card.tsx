"use client";

import { useI18n } from "@/lib/i18n/context";
import { formatCents } from "@/lib/money";
import type { MenuItemView } from "@/types/menu";

/**
 * The thing a cashier taps a few hundred times a day. It reads as a physical
 * key: a raised surface that lifts under the pointer, warms at its edge, and
 * gives way under the press. The price carries the accent because that is what
 * the eye checks last before tapping.
 */
export function ProductCard({
  item,
  view,
  onSelect,
}: {
  item: MenuItemView;
  view: "grid" | "list";
  onSelect: (item: MenuItemView) => void;
}) {
  const { locale, dict } = useI18n();

  // A dish sold in sizes has no single price — the card quotes its cheapest.
  const sizes = item.groups.find((g) => g.kind === "SIZE");
  const cheapest = sizes
    ? Math.min(...sizes.choices.map((c) => item.basePrice + c.priceDelta))
    : item.basePrice;
  const price = sizes
    ? `${dict.product.priceFrom} ${formatCents(cheapest, locale)}`
    : formatCents(item.basePrice, locale);

  if (view === "list") {
    return (
      <button
        onClick={() => onSelect(item)}
        className="card-lift press group flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface-raised p-3 text-start shadow-[var(--shadow-sm)] hover:border-accent/45"
      >
        <span className="tnum shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold text-text-faint transition-colors group-hover:bg-accent-weak group-hover:text-accent">
          {item.itemNumber}
        </span>
        <span className="flex-1 truncate font-semibold text-text">{item.name}</span>
        <span className="tnum shrink-0 font-bold text-text">{price}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(item)}
      className="card-lift press group relative flex aspect-[4/3] flex-col items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-raised p-3 text-center shadow-[var(--shadow-sm)] hover:border-accent/45"
    >
      {/* The accent washes in from the top on hover — a hint of warmth, not a
          colour change that would fight the card's own surface. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-accent-weak to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />

      <span className="tnum absolute start-2.5 top-2 text-[11px] font-semibold text-text-faint transition-colors group-hover:text-accent">
        {item.itemNumber}
      </span>

      <span className="relative line-clamp-2 px-1 text-[15px] font-bold leading-snug text-text">
        {item.name}
      </span>
      <span className="tnum relative text-[17px] font-extrabold tracking-tight text-accent">
        {price}
      </span>

      <span className="absolute inset-x-2 bottom-2 truncate text-[11px] text-text-faint">
        {item.categoryName}
      </span>
    </button>
  );
}
