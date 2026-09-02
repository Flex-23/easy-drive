"use client";

import { useMemo, useState } from "react";
import { Banknote, CreditCard, Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatCents } from "@/lib/money";
import { computeChange, eurosToCents } from "@/lib/pricing";
import { Modal } from "@/components/ui/modal";
import { NumericKeypad } from "./numeric-keypad";

type Method = "CASH" | "CARD" | "ONLINE";

export function PaymentModal({
  open,
  total,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  total: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (method: Method, tenderedCents: number | null) => void;
}) {
  const { locale, dict } = useI18n();
  const [method, setMethod] = useState<Method>("CASH");
  const [tendered, setTendered] = useState("");

  const tenderedCents = useMemo(() => {
    const n = tendered.replace(",", ".").trim();
    return n ? eurosToCents(n) : 0;
  }, [tendered]);

  const insufficient = method === "CASH" && tenderedCents < total;
  const change = computeChange(total, tenderedCents);

  const suggestions = useMemo(() => {
    const base = Math.ceil(total / 100) * 100;
    const set = new Set<number>([total, base, base + 500, base + 1000, 2000, 5000]);
    return [...set].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  const methods: { key: Method; label: string; icon: typeof Banknote }[] = [
    { key: "CASH", label: dict.payment.cash, icon: Banknote },
    { key: "CARD", label: dict.payment.card, icon: CreditCard },
    { key: "ONLINE", label: dict.payment.online, icon: Globe },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={dict.common.close}
      title={dict.payment.title}
      footer={
        <button
          onClick={() => onConfirm(method, method === "CASH" ? tenderedCents : null)}
          disabled={busy || insufficient}
          className="press flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3.5 text-base font-bold text-accent-fg hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {dict.payment.complete} · {formatCents(total, locale)}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface-muted p-4 text-center">
          <p className="text-sm text-text-muted">{dict.payment.amountDue}</p>
          <p className="tnum text-4xl font-extrabold text-text">{formatCents(total, locale)}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {methods.map((m) => {
            const active = method === m.key;
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                aria-pressed={active}
                className={`press flex flex-col items-center gap-1.5 rounded-[var(--radius-btn)] border p-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-accent bg-accent-weak text-accent"
                    : "border-border text-text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                <Icon className="size-5" />
                {m.label}
              </button>
            );
          })}
        </div>

        {method === "CASH" ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-btn)] border border-border p-3 text-center">
                <p className="text-xs text-text-muted">{dict.payment.cashTendered}</p>
                <p className="tnum text-xl font-bold text-text">
                  {formatCents(tenderedCents, locale)}
                </p>
              </div>
              <div className="rounded-[var(--radius-btn)] border border-border p-3 text-center">
                <p className="text-xs text-text-muted">{dict.payment.change}</p>
                <p className="tnum text-xl font-bold text-success">
                  {formatCents(change, locale)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {suggestions.map((v) => (
                <button
                  key={v}
                  onClick={() => setTendered((v / 100).toFixed(2))}
                  className="press tnum rounded-[var(--radius-btn)] border border-border py-2 text-sm font-semibold text-text-muted hover:border-border-strong hover:text-text"
                >
                  {formatCents(v, locale)}
                </button>
              ))}
            </div>
            <NumericKeypad
              onKey={(c) => setTendered((b) => b + c)}
              onBackspace={() => setTendered((b) => b.slice(0, -1))}
              onEnter={() => {
                if (!insufficient) onConfirm("CASH", tenderedCents);
              }}
              enterLabel={dict.payment.complete}
              backspaceLabel={dict.keypad.backspace}
            />
            {insufficient && tenderedCents > 0 ? (
              <p className="text-center text-sm font-semibold text-danger">
                {dict.payment.insufficientCash}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-text-muted">
            {method === "CARD" ? dict.payment.card : dict.payment.online}
          </p>
        )}
      </div>
    </Modal>
  );
}
