"use client";

import { useI18n } from "@/lib/i18n/context";
import { formatCents } from "@/lib/money";
import type { MenuItemView } from "@/types/menu";

export function ProductCard({
  item,
  view,
  onSelect,
}: {
  item: MenuItemView;
  view: "grid" | "list";
  onSelect: (item: MenuItemView) => void;
}) {
  const { locale } = useI18n();
  const price = formatCents(item.basePrice, locale);

  if (view === "list") {
    return (
      <button
        onClick={() => onSelect(item)}
        className="card-lift press flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface-raised p-3 text-start"
      >
        <span className="tnum shrink-0 text-xs font-semibold text-text-faint">
          #{item.itemNumber}
        </span>
        <span className="flex-1 truncate font-semibold text-text">{item.name}</span>
        <span className="tnum shrink-0 font-bold text-text">{price}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(item)}
      className="card-lift press group relative flex aspect-[4/3] flex-col items-center justify-center rounded-[var(--radius-card)] border border-border bg-surface-raised p-3 text-center"
    >
      <span className="tnum absolute start-2.5 top-2 text-[11px] font-semibold text-text-faint">
        #{item.itemNumber}
      </span>
      <span className="line-clamp-2 px-1 text-[15px] font-bold leading-snug text-text">
        {item.name}
      </span>
      <span className="tnum mt-1 font-bold text-accent">{price}</span>
      <span className="absolute inset-x-2 bottom-2 truncate text-[11px] text-text-faint">
        {item.categoryName}
      </span>
    </button>
  );
}
