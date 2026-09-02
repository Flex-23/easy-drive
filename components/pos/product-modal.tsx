"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatCents } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import type { MenuItemView, GroupView } from "@/types/menu";
import type { CartLine } from "@/types/order";

function initialSelection(groups: GroupView[]): Record<number, number[]> {
  const sel: Record<number, number[]> = {};
  for (const g of groups) {
    const defaults = g.choices.filter((c) => c.isDefault).map((c) => c.id);
    if (defaults.length > 0) sel[g.id] = g.selectionType === "SINGLE" ? [defaults[0]] : defaults;
    else if (g.isRequired && g.selectionType === "SINGLE" && g.choices[0])
      sel[g.id] = [g.choices[0].id];
    else sel[g.id] = [];
  }
  return sel;
}

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
  const [selection, setSelection] = useState<Record<number, number[]>>(() =>
    item ? initialSelection(item.groups) : {},
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>(() => {
    const c: Record<number, boolean> = {};
    item?.groups.forEach((g) => (c[g.id] = g.isCollapsible));
    return c;
  });

  const selectedChoiceIds = useMemo(
    () => Object.values(selection).flat(),
    [selection],
  );

  const unitPrice = useMemo(() => {
    if (!item) return 0;
    const deltas = item.groups
      .flatMap((g) => g.choices)
      .filter((c) => selectedChoiceIds.includes(c.id))
      .reduce((acc, c) => acc + c.priceDelta, 0);
    return item.basePrice + deltas;
  }, [item, selectedChoiceIds]);

  if (!item) return null;

  const missingRequired = item.groups.some(
    (g) => g.isRequired && (selection[g.id]?.length ?? 0) === 0,
  );

  function toggle(group: GroupView, choiceId: number) {
    setSelection((prev) => {
      const current = prev[group.id] ?? [];
      if (group.selectionType === "SINGLE") {
        return { ...prev, [group.id]: [choiceId] };
      }
      return {
        ...prev,
        [group.id]: current.includes(choiceId)
          ? current.filter((id) => id !== choiceId)
          : [...current, choiceId],
      };
    });
  }

  function add() {
    if (missingRequired || !item) return;
    const options = item.groups.flatMap((g) =>
      g.choices
        .filter((c) => (selection[g.id] ?? []).includes(c.id))
        .map((c) => ({
          groupId: g.id,
          choiceId: c.id,
          groupName: g.name,
          choiceName: c.name,
          priceDelta: c.priceDelta,
        })),
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
            disabled={missingRequired}
            className="press flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3 font-bold text-accent-fg hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>{dict.modal.addToOrder}</span>
            <span className="tnum">({formatCents(unitPrice * quantity, locale)})</span>
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {item.groups.map((g) => {
          const isPriceGroup =
            g.selectionType === "SINGLE" && g.choices.some((c) => c.priceDelta !== 0);
          const open = !collapsed[g.id];
          return (
            <fieldset key={g.id}>
              <legend className="mb-2 flex w-full items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-text">
                  {g.name}
                  {g.isRequired ? (
                    <span className="text-xs font-semibold text-danger">
                      {dict.modal.selectionRequired}
                    </span>
                  ) : (
                    <span className="text-xs font-normal text-text-faint">
                      {g.selectionType === "SINGLE" ? dict.modal.chooseOne : dict.modal.chooseMany}
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
                <div className="grid grid-cols-2 gap-2">
                  {g.choices.map((c) => {
                    const selected = (selection[g.id] ?? []).includes(c.id);
                    const priceLabel = isPriceGroup
                      ? formatCents(item.basePrice + c.priceDelta, locale)
                      : c.priceDelta !== 0
                        ? `+ ${formatCents(c.priceDelta, locale)}`
                        : null;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggle(g, c.id)}
                        aria-pressed={selected}
                        className={`press flex flex-col items-start rounded-[var(--radius-btn)] border p-2.5 text-start transition-colors ${
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
