"use client";

import { useEffect, useRef, useState } from "react";
import { UserPlus, UserRound, Phone, MapPin, X, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { NumericKeypad } from "./numeric-keypad";
import { searchCustomersAction } from "@/app/actions/customers";
import type { CustomerView } from "@/lib/queries/customers";
import type { OrderType } from "./order-type-tabs";

export function CustomerPanel({
  orderType,
  customer,
  onSelect,
  onClear,
  onAddCustomer,
}: {
  orderType: OrderType;
  customer: CustomerView | null;
  onSelect: (c: CustomerView) => void;
  onClear: () => void;
  onAddCustomer: (prefillPhone: string) => void;
}) {
  const { dict } = useI18n();
  const [buffer, setBuffer] = useState("");
  const [results, setResults] = useState<CustomerView[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const query = buffer.trim();
    const id = ++reqId.current;
    const t = setTimeout(
      async () => {
        if (query.length < 2) {
          if (id === reqId.current) {
            setResults([]);
            setOpen(false);
            setSearching(false);
          }
          return;
        }
        setSearching(true);
        const res = await searchCustomersAction(query);
        if (id === reqId.current) {
          setResults(res);
          setOpen(true);
          setSearching(false);
        }
      },
      query.length < 2 ? 0 : 250,
    );
    return () => clearTimeout(t);
  }, [buffer]);

  function choose(c: CustomerView) {
    onSelect(c);
    setBuffer("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="border-b border-border p-3">
        {customer ? (
          <div className="rounded-[var(--radius-btn)] border border-border bg-surface-raised p-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-weak text-sm font-bold text-accent">
                  {customer.name.slice(0, 1)}
                </span>
                <div>
                  <p className="font-semibold text-text">{customer.name}</p>
                  <p className="tnum flex items-center gap-1 text-xs text-text-muted">
                    <Phone className="size-3" /> {customer.phone}
                  </p>
                </div>
              </div>
              <button
                onClick={onClear}
                className="press rounded-md p-1 text-text-faint hover:text-danger"
                aria-label={dict.customer.clear}
              >
                <X className="size-4" />
              </button>
            </div>
            {customer.address ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-text-muted">
                <MapPin className="mt-0.5 size-3 shrink-0" />
                <span>
                  {customer.address.street} {customer.address.houseNumber},{" "}
                  {customer.address.postalCode} {customer.address.city}
                </span>
              </p>
            ) : orderType === "DELIVERY" ? (
              <p className="mt-2 text-xs font-semibold text-danger">
                {dict.validation.addressRequired}
              </p>
            ) : null}
            <p className="tnum mt-2 text-xs text-text-faint">
              {customer.orderCount} {dict.customer.pastOrders}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 rounded-[var(--radius-btn)] border border-dashed border-border bg-surface-muted/50 p-4 text-center">
            <UserRound className="size-8 text-text-faint/60" />
            <p className="text-sm text-text-muted">{dict.customer.noCustomer}</p>
            <button
              onClick={() => onAddCustomer(buffer.trim())}
              className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-strong"
            >
              <UserPlus className="size-4" />
              {dict.customer.addCustomer}
            </button>
          </div>
        )}
      </div>

      {/* Keypad + phone lookup */}
      <div className="relative flex min-h-0 flex-1 flex-col p-3">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
          <input
            value={buffer}
            onChange={(e) => setBuffer(e.target.value.replace(/[^0-9\s+/-]/g, ""))}
            placeholder={dict.customer.searchHint}
            inputMode="tel"
            className="tnum w-full rounded-[var(--radius-btn)] border border-border bg-surface-muted py-2 text-sm text-text outline-none placeholder:text-text-faint focus:border-accent ps-9 pe-3"
            aria-label={dict.customer.phone}
          />
          {searching ? (
            <span className="absolute top-1/2 -translate-y-1/2 text-xs text-text-faint end-3">
              …
            </span>
          ) : null}
        </div>

        {open && results.length > 0 ? (
          <div className="animate-slide-in absolute inset-x-3 top-14 z-20 max-h-56 overflow-y-auto rounded-[var(--radius-btn)] border border-border bg-surface-raised shadow-[var(--shadow-lg)]">
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => choose(c)}
                className="press flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-start last:border-0 hover:bg-surface-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-text">{c.name}</span>
                  <span className="tnum block truncate text-xs text-text-muted">{c.phone}</span>
                </span>
                <span className="text-xs text-accent">{dict.customer.select}</span>
              </button>
            ))}
          </div>
        ) : open && !searching ? (
          <div className="animate-slide-in absolute inset-x-3 top-14 z-20 rounded-[var(--radius-btn)] border border-border bg-surface-raised p-3 text-center text-sm text-text-muted shadow-[var(--shadow-lg)]">
            {dict.customer.noResults}
          </div>
        ) : null}

        <div className="mt-auto">
          <NumericKeypad
            onKey={(c) => setBuffer((b) => b + c)}
            onBackspace={() => setBuffer((b) => b.slice(0, -1))}
            onEnter={() => {
              if (results[0]) choose(results[0]);
            }}
            enterLabel={dict.keypad.enter}
            backspaceLabel={dict.keypad.backspace}
          />
        </div>
      </div>
    </div>
  );
}
