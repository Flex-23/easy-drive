"use client";

import { useState } from "react";
import { Minus, Plus, X, Percent, Split, PauseCircle, CreditCard, ShoppingCart } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatCents } from "@/lib/money";
import { computeLine, eurosToCents, centsToEuros, type OrderTotals } from "@/lib/pricing";
import type { CartLine } from "@/types/order";
import type { OrderType } from "./order-type-tabs";

export function CartColumn({
  lines,
  totals,
  orderType,
  deliveryFeeCents,
  onDeliveryFee,
  busy,
  onQty,
  onRemove,
  onDiscount,
  onSplit,
  onHold,
  onCharge,
}: {
  lines: CartLine[];
  totals: OrderTotals;
  orderType: OrderType;
  /** What the cashier typed for this delivery, in cents. */
  deliveryFeeCents: number;
  onDeliveryFee: (cents: number) => void;
  busy: boolean;
  onQty: (uid: string, quantity: number) => void;
  onRemove: (uid: string) => void;
  onDiscount: () => void;
  onSplit: () => void;
  onHold: () => void;
  onCharge: () => void;
}) {
  const { locale, dict } = useI18n();
  const empty = lines.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-bold text-text">{dict.cart.title}</h2>
        {!empty ? (
          <span className="tnum rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-muted">
            {lines.reduce((a, l) => a + l.quantity, 0)} {dict.cart.items}
          </span>
        ) : null}
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <ShoppingCart className="size-12 text-text-faint/50" />
          <div>
            <p className="font-semibold text-text-muted">{dict.cart.empty}</p>
            <p className="mt-1 text-sm text-text-faint">{dict.cart.emptyHint}</p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {lines.map((line) => {
            const { lineTotal } = computeLine({
              basePrice: line.basePrice,
              quantity: line.quantity,
              options: line.options,
            });
            return (
              <div
                key={line.uid}
                className="animate-slide-in mb-1.5 rounded-[var(--radius-btn)] border border-border bg-surface-raised p-2.5"
              >
                <div className="flex items-start gap-2">
                  <span className="tnum mt-0.5 text-xs font-semibold text-text-faint">
                    #{line.itemNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{line.name}</p>
                    {line.options.length > 0 ? (
                      <ul className="mt-0.5 space-y-0.5">
                        {line.options.map((o) => (
                          <li key={o.choiceId} className="truncate text-xs text-text-muted">
                            {o.choiceName}
                            {/* A size's delta is the gap to the base price, which
                                reads like a second price under the line total. The
                                total already says what the size costs; only an
                                extra's surcharge is worth naming. */}
                            {o.kind === "EXTRA" && o.priceDelta !== 0 ? (
                              <span className="tnum"> · {formatCents(o.priceDelta, locale)}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {line.kitchenNotes ? (
                      <p className="mt-0.5 truncate text-xs italic text-warning">
                        {line.kitchenNotes}
                      </p>
                    ) : null}
                  </div>
                  <button
                    onClick={() => onRemove(line.uid)}
                    className="press rounded-md p-1 text-text-faint hover:text-danger"
                    aria-label={dict.common.remove}
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 rounded-[var(--radius-btn)] border border-border">
                    <button
                      onClick={() => onQty(line.uid, line.quantity - 1)}
                      className="press flex size-7 items-center justify-center text-text-muted hover:bg-surface-muted"
                      aria-label={dict.common.remove}
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="tnum w-6 text-center text-sm font-bold">{line.quantity}</span>
                    <button
                      onClick={() => onQty(line.uid, line.quantity + 1)}
                      className="press flex size-7 items-center justify-center text-text-muted hover:bg-surface-muted"
                      aria-label={dict.common.add}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <span className="tnum font-bold text-text">{formatCents(lineTotal, locale)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky footer: totals + actions */}
      <div className="border-t border-border p-3">
        <dl className="mb-3 space-y-1 text-sm">
          <Row label={dict.cart.subtotal} value={formatCents(totals.subtotal, locale)} muted />
          {orderType === "DELIVERY" ? (
            <DeliveryFeeRow cents={deliveryFeeCents} onChange={onDeliveryFee} />
          ) : null}
          {totals.discountAmount > 0 ? (
            <Row label={dict.cart.discount} value={`− ${formatCents(totals.discountAmount, locale)}`} muted />
          ) : null}
          <div className="flex items-center justify-between pt-1.5">
            <dt className="text-base font-bold text-text">{dict.cart.total}</dt>
            <dd className="tnum text-2xl font-extrabold text-text">
              {formatCents(totals.total, locale)}
            </dd>
          </div>
        </dl>

        <div className="mb-2 grid grid-cols-3 gap-2">
          <SmallBtn icon={Percent} label={dict.cart.discountBtn} onClick={onDiscount} disabled={empty} />
          <SmallBtn icon={Split} label={dict.cart.splitBill} onClick={onSplit} disabled={empty} />
          <SmallBtn icon={PauseCircle} label={dict.cart.holdOrder} onClick={onHold} disabled={empty || busy} />
        </div>
        <button
          onClick={onCharge}
          disabled={empty || busy}
          className="press flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3.5 text-base font-bold tracking-tight text-accent-fg shadow-[var(--shadow-md)] hover:bg-accent-strong hover:shadow-[var(--shadow-lg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <CreditCard className="size-5" />
          <span>{dict.cart.charge}</span>
          <span className="tnum">· {formatCents(totals.total, locale)}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * The delivery fee is typed per order, not read from Settings — it depends on
 * where the food is going. The box holds text while it is being typed (a
 * trailing comma must survive a keystroke); the order only ever sees cents.
 */
function DeliveryFeeRow({
  cents,
  onChange,
}: {
  cents: number;
  onChange: (cents: number) => void;
}) {
  const { dict } = useI18n();
  const [text, setText] = useState(() => euros(cents));
  // A recalled parked bill brings its own fee; the box follows it. Adjusted
  // during render on a change of `cents`, which is how React asks for it.
  const [seen, setSeen] = useState(cents);
  if (cents !== seen) {
    setSeen(cents);
    if (parse(text) !== cents) setText(euros(cents));
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <dt>
        <label htmlFor="delivery-fee" className="text-text-muted">
          {dict.cart.deliveryFee}
        </label>
      </dt>
      <dd className="relative">
        <input
          id="delivery-fee"
          value={text}
          onChange={(e) => {
            const next = e.target.value.replace(/[^0-9.,]/g, "");
            setText(next);
            onChange(parse(next));
          }}
          onBlur={() => setText(euros(cents))}
          inputMode="decimal"
          dir="ltr"
          placeholder="0,00"
          className="tnum w-24 rounded-md border border-border bg-surface-muted py-1 text-end text-sm text-text outline-none transition-colors placeholder:text-text-faint hover:border-border-strong focus:border-accent focus:bg-surface ps-2 pe-6"
        />
        <span aria-hidden className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs text-text-faint end-2">
          €
        </span>
      </dd>
    </div>
  );
}

/** "2,50" | "2.5" | "" -> cents; anything unreadable is nothing. */
function parse(text: string): number {
  const normalised = text.replace(",", ".");
  return /^\d*(\.\d{0,2})?$/.test(normalised) && normalised !== "" && normalised !== "."
    ? eurosToCents(normalised)
    : 0;
}

/** cents -> what the box shows once typing is over: "2,50", or empty for none. */
function euros(cents: number): string {
  return cents > 0 ? centsToEuros(cents).toFixed(2).replace(".", ",") : "";
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-text-muted" : "text-text"}>{label}</dt>
      <dd className="tnum text-text">{value}</dd>
    </div>
  );
}

function SmallBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Percent;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="press flex min-w-0 flex-col items-center gap-1 rounded-[var(--radius-btn)] border border-border bg-surface px-1.5 py-2 text-xs font-semibold text-text-muted hover:border-accent/40 hover:bg-accent-weak hover:text-accent disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface disabled:hover:text-text-muted"
    >
      <Icon className="size-4" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
