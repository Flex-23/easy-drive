"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tags, Check, UtensilsCrossed } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatNumber } from "@/lib/money";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { CategoryIcon } from "@/components/ui/icons";
import { saveItemPrices } from "@/app/actions/prices";
import type { MasterMenu, MasterItem } from "@/lib/queries/master";
import type { Locale } from "@/lib/i18n/config";

/**
 * Every dish under its category, with nothing editable but what it costs — the
 * one catalogue change the till is trusted with. The Master panel owns the rest.
 * A quick pass after a supplier raises prices: change a number, press the tick,
 * move on; there is no form to touch anything else by accident.
 */
export function PriceList({ menu }: { menu: MasterMenu }) {
  const { locale, dict } = useI18n();
  const t = dict.settings;
  const label = (row: { nameAr: string; nameDe: string }) => preferred(row.nameAr, row.nameDe, locale);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-text">
          <Tags className="size-4 text-accent" />
          {t.prices}
        </h2>
        <p className="text-sm text-text-muted">{t.pricesHint}</p>
      </header>

      {menu.items.length === 0 ? (
        <EmptyState icon={UtensilsCrossed}>{t.pricesEmpty}</EmptyState>
      ) : (
        menu.categories.map((category) => {
          const items = menu.items.filter((i) => i.categoryId === category.id);
          if (items.length === 0) return null;
          return (
            <section
              key={category.id}
              className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
            >
              <h3 className="flex items-center gap-2 border-b border-border bg-surface-muted/60 px-4 py-2.5 text-sm font-bold text-text">
                <CategoryIcon name={category.icon} className="size-4 text-accent" />
                {label(category)}
                <span className="tnum text-xs font-normal text-text-faint">
                  ({formatNumber(items.length, locale)})
                </span>
                {category.isActive ? null : (
                  <span className="ms-auto rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-muted">
                    {t.inactive}
                  </span>
                )}
              </h3>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <PriceRow key={item.id} item={item} name={label(item)} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

/** One dish: its number and name, then a box per price, then the tick. */
function PriceRow({ item, name }: { item: MasterItem; name: string }) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [saving, start] = useTransition();
  const t = dict.settings;

  // A one-price dish is a size list of one: the row reads the same either way.
  const prices = item.sizes.length > 0
    ? item.sizes.map((s) => ({ key: s.id, label: preferred(s.nameAr, s.nameDe, locale), price: s.price }))
    : [{ key: 0, label: null, price: item.basePrice }];

  const [texts, setTexts] = useState(() => prices.map((p) => euros(p.price)));
  const parsed = texts.map(parse);
  const dirty = parsed.some((cents, i) => cents !== Math.round(prices[i].price * 100));
  const valid = parsed.every((cents) => cents !== null);

  function save() {
    if (!dirty || !valid) return;
    start(async () => {
      const res = await saveItemPrices({
        itemId: item.id,
        prices: parsed.map((cents) => (cents as number) / 100),
      });
      if (res.ok) {
        toast(t.priceSaved, "success");
        router.refresh();
      } else {
        toast(dict.toast.genericError, "error");
      }
    });
  }

  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 ${item.isActive ? "" : "opacity-60"}`}>
      <span className="tnum w-12 shrink-0 text-xs font-semibold text-text-faint">{item.itemNumber}</span>
      <span className="min-w-40 flex-1 truncate text-sm font-medium text-text">{name}</span>

      <div className="flex flex-wrap items-center gap-2">
        {prices.map((p, i) => (
          <label key={p.key} className="flex items-center gap-1.5">
            {p.label ? <span className="text-xs text-text-muted">{p.label}</span> : null}
            <span dir="ltr">
              <input
                value={texts[i]}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^0-9.,]/g, "");
                  setTexts((prev) => prev.map((v, j) => (j === i ? next : v)));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                inputMode="decimal"
                dir="ltr"
                aria-label={p.label ?? t.price}
                className={`tnum w-24 rounded-md border bg-surface-muted px-2 py-1.5 text-end text-sm text-text outline-none transition-colors focus:border-accent focus:bg-surface ${
                  parsed[i] === null ? "border-danger" : "border-border hover:border-border-strong"
                }`}
              />
            </span>
          </label>
        ))}
      </div>

      <button
        onClick={save}
        disabled={!dirty || !valid || saving}
        aria-label={dict.common.save}
        title={dict.common.save}
        className={`press flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-btn)] transition-colors ${
          dirty && valid
            ? "bg-accent text-accent-fg shadow-[var(--shadow-sm)] hover:bg-accent-strong"
            : "border border-border text-text-faint"
        } disabled:opacity-50`}
      >
        <Check className="size-4" strokeWidth={2.5} />
      </button>
    </li>
  );
}

/** The text in the language in use, falling back to the other one. */
function preferred(ar: string, de: string, locale: Locale): string {
  return locale === "ar" ? ar || de : de || ar;
}

/** "12,50" | "12.5" -> 1250; null when it is not a price. Nothing costs nothing. */
function parse(text: string): number | null {
  const normalised = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalised)) return null;
  const cents = Math.round(Number(normalised) * 100);
  return cents > 0 ? cents : null;
}

function euros(price: number): string {
  return price.toFixed(2).replace(".", ",");
}
