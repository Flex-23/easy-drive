"use client";

import { useMemo, useRef, useState } from "react";
import { Search, LayoutGrid, List } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryIcon } from "@/components/ui/icons";
import { ProductCard } from "./product-card";
import type { CategoryView, MenuItemView } from "@/types/menu";

export function MenuBrowser({
  categories,
  onSelectItem,
}: {
  categories: CategoryView[];
  onSelectItem: (item: MenuItemView) => void;
}) {
  const { dict } = useI18n();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeId, setActiveId] = useState<number>(categories[0]?.id ?? 0);

  const gridRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<number, HTMLElement>>(new Map());

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return categories;
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.nameDe.toLowerCase().includes(q) ||
            i.nameAr.toLowerCase().includes(q) ||
            String(i.itemNumber).includes(q),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, q]);

  function scrollToCategory(id: number) {
    setActiveId(id);
    const el = sectionRefs.current.get(id);
    const container = gridRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
    }
    pillsRef.current
      ?.querySelector<HTMLElement>(`[data-pill="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function onScroll() {
    if (q) return;
    const container = gridRef.current;
    if (!container) return;
    const y = container.scrollTop + 24;
    let current = activeId;
    for (const c of filtered) {
      const el = sectionRefs.current.get(c.id);
      if (el && el.offsetTop <= y) current = c.id;
    }
    if (current !== activeId) setActiveId(current);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      {/* Search + view toggle */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={dict.product.searchPlaceholder}
            className="w-full rounded-[var(--radius-btn)] border border-border bg-surface-sunken py-2.5 text-sm text-text outline-none transition-colors placeholder:text-text-faint hover:border-border-strong focus:border-accent focus:bg-surface ps-9 pe-3"
            aria-label={dict.common.search}
          />
        </div>
        <div className="flex overflow-hidden rounded-[var(--radius-btn)] border border-border">
          <button
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            aria-label={dict.product.gridView}
            className={`press p-2.5 ${view === "grid" ? "bg-accent text-accent-fg" : "text-text-muted hover:bg-surface-muted hover:text-text"}`}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label={dict.product.listView}
            className={`press p-2.5 ${view === "list" ? "bg-accent text-accent-fg" : "text-text-muted hover:bg-surface-muted hover:text-text"}`}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      {/* Horizontal category bar */}
      <div
        ref={pillsRef}
        className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((c) => {
          const active = c.id === activeId && !q;
          return (
            <button
              key={c.id}
              data-pill={c.id}
              onClick={() => scrollToCategory(c.id)}
              className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                active
                  ? "bg-accent text-accent-fg shadow-[var(--shadow-sm)]"
                  : "bg-surface-muted text-text-muted hover:bg-surface-sunken hover:text-text"
              }`}
            >
              <CategoryIcon name={c.icon} className="size-4" />
              <span className="whitespace-nowrap">{c.name}</span>
            </button>
          );
        })}
      </div>

      {/* Product grid */}
      <div ref={gridRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <EmptyState icon={Search}>{dict.product.noProducts}</EmptyState>
        ) : (
          filtered.map((c) => (
            <section
              key={c.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(c.id, el);
              }}
              className="mb-6 scroll-mt-2"
            >
              <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-text">
                <CategoryIcon name={c.icon} className="size-4 text-accent" />
                {c.name}
                <span className="tnum text-xs font-normal text-text-faint">({c.items.length})</span>
              </h3>
              <div
                className={
                  view === "grid"
                    ? "grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr))]"
                    : "flex flex-col gap-2"
                }
              >
                {c.items.map((item) => (
                  <ProductCard key={item.id} item={item} view={view} onSelect={onSelectItem} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
