"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { formatCents } from "@/lib/money";
import { eurosToCents } from "@/lib/pricing";
import { Modal } from "@/components/ui/modal";

export function DiscountModal({
  open,
  current,
  subtotal,
  onClose,
  onApply,
}: {
  open: boolean;
  current: number;
  subtotal: number;
  onClose: () => void;
  onApply: (cents: number) => void;
}) {
  const { locale, dict } = useI18n();
  const [value, setValue] = useState(() =>
    current > 0 ? (current / 100).toFixed(2) : "",
  );

  function parse(): number {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return 0;
    const cents = eurosToCents(normalized);
    return Math.min(Math.max(0, cents), subtotal);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={dict.common.close}
      title={dict.cart.discountBtn}
      maxWidth="max-w-sm"
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => onApply(0)}
            className="press flex-1 rounded-[var(--radius-btn)] border border-border py-2.5 text-sm font-semibold text-text-muted hover:bg-surface-muted"
          >
            {dict.common.clear}
          </button>
          <button
            onClick={() => onApply(parse())}
            className="press flex-[2] rounded-[var(--radius-btn)] bg-accent px-4 py-2.5 text-sm font-bold text-accent-fg hover:bg-accent-strong"
          >
            {dict.common.apply}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <span className="absolute top-1/2 -translate-y-1/2 text-text-muted end-3">€</span>
          <input
            data-autofocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ""))}
            inputMode="decimal"
            placeholder="0,00"
            className="tnum w-full rounded-[var(--radius-btn)] border border-border bg-surface-muted px-3 py-3 text-lg font-bold text-text outline-none focus:border-accent"
          />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 5, 10].map((v) => (
            <button
              key={v}
              onClick={() => setValue(v.toFixed(2))}
              className="press tnum rounded-[var(--radius-btn)] border border-border py-2 text-sm font-semibold text-text-muted hover:border-border-strong hover:text-text"
            >
              {formatCents(v * 100, locale)}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
