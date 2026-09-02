"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatCents } from "@/lib/money";
import { Modal } from "@/components/ui/modal";

export function SplitModal({
  open,
  total,
  onClose,
}: {
  open: boolean;
  total: number;
  onClose: () => void;
}) {
  const { locale, dict } = useI18n();
  const [ways, setWays] = useState(2);
  const per = Math.ceil(total / ways);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={dict.common.close}
      title={dict.cart.splitBill}
      maxWidth="max-w-sm"
    >
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWays((w) => Math.max(2, w - 1))}
            className="press flex size-10 items-center justify-center rounded-[var(--radius-btn)] border border-border text-text-muted hover:bg-surface-muted"
            aria-label={dict.common.remove}
          >
            <Minus className="size-4" />
          </button>
          <span className="tnum w-10 text-center text-2xl font-extrabold text-text">{ways}</span>
          <button
            onClick={() => setWays((w) => Math.min(8, w + 1))}
            className="press flex size-10 items-center justify-center rounded-[var(--radius-btn)] border border-border text-text-muted hover:bg-surface-muted"
            aria-label={dict.common.add}
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="w-full rounded-[var(--radius-card)] border border-border bg-surface-muted p-4 text-center">
          <p className="text-sm text-text-muted">{dict.cart.total}</p>
          <p className="tnum text-lg font-bold text-text">{formatCents(total, locale)}</p>
          <p className="tnum mt-2 text-3xl font-extrabold text-accent">
            {formatCents(per, locale)}
          </p>
        </div>
      </div>
    </Modal>
  );
}
