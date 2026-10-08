"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, ChevronDown, Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatCents } from "@/lib/money";
import { eurosToCents } from "@/lib/pricing";
import { Modal } from "@/components/ui/modal";
import type { MenuItemView, GroupView } from "@/types/menu";
import type { CartLine } from "@/types/order";

/** A choice the cashier tapped, and what it costs on this line. */
interface Picked {
  choiceId: number;
  cents: number;
}

/**
 * The main choices are the required groups — the size, the pasta type; the
 * extras are everything else. The dish opens with nothing chosen: a cashier
 * decides the size, not a default, and only then do the extras unlock and the
 * price appear. An extra costs what the cashier types for it, not what the
 * menu file says.
 */
export function ProductModal({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItemView | null;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const { locale, dict } = useI18n();
  const [selection, setSelection] = useState<Record<number, Picked[]>>({});
  /** The price typed above each extras group, as text while it is being typed. */
  const [extraPrice, setExtraPrice] = useState<Record<number, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(() => {
    const c: Record<number, boolean> = {};
    item?.groups.forEach((g) => (c[g.id] = g.isCollapsible));
    return c;
  });

  const picked = (g: GroupView) => selection[g.id] ?? [];
  const ready = useMemo(
    () => (item ? item.groups.every((g) => !g.isRequired || (selection[g.id]?.length ?? 0) > 0) : false),
    [item, selection],
  );
  const unitPrice = useMemo(() => {
    if (!item) return 0;
    const extras = Object.values(selection).flat().reduce((acc, p) => acc + p.cents, 0);
    return item.basePrice + extras;
  }, [item, selection]);

  if (!item) return null;

  function toggle(group: GroupView, choiceId: number) {
    const current = picked(group);
    const already = current.some((p) => p.choiceId === choiceId);
    // A main choice is priced by the menu; an extra by the box above it.
    const cents = group.isRequired
      ? (group.choices.find((c) => c.id === choiceId)?.priceDelta ?? 0)
      : parsePrice(extraPrice[group.id] ?? "");
    setSelection((prev) => ({
      ...prev,
      [group.id]:
        group.selectionType === "SINGLE"
          ? already && !group.isRequired
            ? []
            : [{ choiceId, cents }]
          : already
            ? current.filter((p) => p.choiceId !== choiceId)
            : [...current, { choiceId, cents }],
    }));
  }

  function add() {
    if (!ready || !item) return;
    const options = item.groups.flatMap((g) =>
      picked(g).map((p) => {
        const choice = g.choices.find((c) => c.id === p.choiceId)!;
        return {
          groupId: g.id,
          choiceId: choice.id,
          kind: g.kind,
          groupName: g.name,
          choiceName: choice.name,
          priceDelta: p.cents,
        };
      }),
    );
    onAdd({
      uid: `${item.id}-${Date.now()}`,
      itemId: item.id,
      itemNumber: item.itemNumber,
      name: item.name,
      categoryName: item.categoryName,
      basePrice: item.basePrice,
      quantity,
      kitchenNotes: notes.trim() || undefined,
      options,
    });
    onClose();
  }

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      closeLabel={dict.common.close}
      title={
        <span className="flex items-baseline gap-2">
          <span className="tnum text-sm font-normal text-text-faint">
            #{item.itemNumber}
          </span>
          <span>{item.name}</span>
        </span>
      }
      subtitle={item.description ? <em className="not-italic">{item.description}</em> : undefined}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-[var(--radius-btn)] border border-border p-1">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="press flex size-9 items-center justify-center rounded-[calc(var(--radius-btn)-2px)] text-text-muted hover:bg-surface-muted"
              aria-label={dict.common.remove}
            >
              <Minus className="size-4" />
            </button>
            <span className="tnum w-8 text-center text-lg font-bold">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="press flex size-9 items-center justify-center rounded-[calc(var(--radius-btn)-2px)] text-text-muted hover:bg-surface-muted"
              aria-label={dict.common.add}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <button
            onClick={add}
            disabled={!ready}
            className="press flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3 font-bold text-accent-fg hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>{dict.modal.addToOrder}</span>
            {/* The price is only stated once there is a dish to price. */}
            {ready ? <span className="tnum">({formatCents(unitPrice * quantity, locale)})</span> : null}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {item.groups.map((g) => {
          const isPriceGroup = g.kind === "SIZE";
          // Extras wait for the main choices; the main choices never wait.
          const locked = !g.isRequired && !ready;
          const open = !collapsed[g.id];
          const chosen = picked(g);
          return (
            <fieldset key={g.id} disabled={locked} className={locked ? "opacity-50" : ""}>
              <legend className="mb-2 flex w-full items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-text">
                  {locked ? <Lock className="size-3.5 text-text-faint" /> : null}
                  {g.name}
                  {g.isRequired ? (
                    <span className="text-xs font-semibold text-danger">
                      {dict.modal.selectionRequired}
                    </span>
                  ) : (
                    <span className="text-xs font-normal text-text-faint">
                      {locked ? dict.modal.chooseSizeFirst : dict.modal.extraPriceHint}
                    </span>
                  )}
                </span>
                {g.isCollapsible ? (
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
                    className="press text-text-faint hover:text-text"
                    aria-expanded={open}
                    aria-label={g.name}
                  >
                    <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />
                  </button>
                ) : null}
              </legend>
              {open ? (
                <>
                  {!g.isRequired ? (
                    <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-muted">
                      {dict.modal.extraPrice}
                      <span className="relative">
                        <input
                          value={extraPrice[g.id] ?? ""}
                          onChange={(e) =>
                            setExtraPrice((p) => ({
                              ...p,
                              [g.id]: e.target.value.replace(/[^0-9.,]/g, ""),
                            }))
                          }
                          inputMode="decimal"
                          dir="ltr"
                          placeholder="0,00"
                          aria-label={dict.modal.extraPrice}
                          className="tnum w-24 rounded-md border border-border bg-surface-muted py-1.5 text-end text-sm font-semibold text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent focus:bg-surface ps-2 pe-6"
                        />
                        <span aria-hidden className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs text-text-faint end-2">
                          €
                        </span>
                      </span>
                    </label>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    {g.choices.map((c) => {
                      const pick = chosen.find((p) => p.choiceId === c.id);
                      const selected = pick !== undefined;
                      // A size shows what it costs; a main choice its surcharge;
                      // an extra the price it was given when tapped.
                      const priceLabel = isPriceGroup
                        ? formatCents(item.basePrice + c.priceDelta, locale)
                        : g.isRequired
                          ? c.priceDelta !== 0
                            ? `+ ${formatCents(c.priceDelta, locale)}`
                            : null
                          : selected
                            ? formatCents(pick.cents, locale)
                            : null;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggle(g, c.id)}
                          aria-pressed={selected}
                          className={`press flex flex-col items-start rounded-[var(--radius-btn)] border p-2.5 text-start transition-colors disabled:cursor-not-allowed ${
                            selected
                              ? "border-accent bg-accent-weak"
                              : "border-border bg-surface hover:border-border-strong"
                          }`}
                        >
                          <span className={`text-sm font-semibold ${selected ? "text-accent" : "text-text"}`}>
                            {c.name}
                          </span>
                          {priceLabel ? (
                            <span className="tnum mt-0.5 text-xs text-text-muted">{priceLabel}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </fieldset>
          );
        })}

        <div>
          <label htmlFor="kitchen-notes" className="mb-1.5 block text-sm font-bold text-text">
            {dict.modal.kitchenNotes}
          </label>
          <textarea
            id="kitchen-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={dict.modal.kitchenNotesPlaceholder}
            rows={2}
            className="w-full resize-none rounded-[var(--radius-btn)] border border-border bg-surface-muted p-2.5 text-sm text-text outline-none placeholder:text-text-faint focus:border-accent"
          />
        </div>
      </div>
    </Modal>
  );
}

/** "1,50" | "1.5" | "" -> cents; anything unreadable is nothing. */
function parsePrice(text: string): number {
  const normalised = text.replace(",", ".");
  return /^\d+(\.\d{0,2})?$/.test(normalised) ? eurosToCents(normalised) : 0;
}
