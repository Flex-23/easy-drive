"use client";

import { useEffect, useRef, useState } from "react";
import { MapPinned, Phone, MapPin } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatNumber } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { searchCustomersByAddressAction } from "@/app/actions/customers";
import type { CustomerView } from "@/lib/queries/customers";

/**
 * Find customers by where they live — a street, a district, a postal code —
 * and see how many there are. Tapping one puts them on the order.
 */
export function AddressSearchModal({
  onClose,
  onAttach,
}: {
  onClose: () => void;
  onAttach: (c: CustomerView) => void;
}) {
  const { locale, dict } = useI18n();
  const t = dict.customer;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerView[] | null>(null);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

  const q = query.trim();
  const tooShort = q.length < 2;

  // Debounced: the list follows the typing, the server is asked once per pause.
  useEffect(() => {
    if (q.length < 2) return;
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const rows = await searchCustomersByAddressAction(q);
      if (id === reqId.current) {
        setResults(rows);
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={dict.common.close}
      title={t.addressSearchTitle}
      maxWidth="max-w-2xl"
    >
      <div className="relative">
        <MapPinned className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
        <input
          data-autofocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.addressSearchHint}
          aria-label={t.addressSearchTitle}
          className="w-full rounded-[var(--radius-btn)] border border-border bg-surface-sunken py-2.5 text-sm text-text outline-none transition-colors placeholder:text-text-faint hover:border-border-strong focus:border-accent focus:bg-surface ps-9 pe-8"
        />
        {searching ? (
          <span className="absolute top-1/2 -translate-y-1/2 text-xs text-text-faint end-3">…</span>
        ) : null}
      </div>

      {tooShort || results === null ? (
        <p className="mt-6 text-center text-sm text-text-faint">{t.addressSearchHint}</p>
      ) : results.length === 0 ? (
        <EmptyState icon={MapPinned}>{t.addressSearchEmpty}</EmptyState>
      ) : (
        <>
          {/* The count is the point: how many people live where was typed. */}
          <p className="tnum mt-4 mb-2 text-sm font-semibold text-text">
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg">
              {formatNumber(results.length, locale)}
            </span>{" "}
            {t.customersFound}
          </p>
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-[var(--radius-btn)] border border-border">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onAttach(c)}
                  className="press flex w-full items-start gap-3 px-3 py-2.5 text-start hover:bg-surface-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-btn)] bg-accent-weak text-sm font-bold text-accent">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-sm font-semibold text-text">{c.name}</span>
                      <span className="tnum flex items-center gap-1 text-xs text-text-muted" dir="ltr">
                        <Phone className="size-3" />
                        {c.phone}
                      </span>
                    </span>
                    {c.address ? (
                      <span className="mt-0.5 flex items-start gap-1 text-xs text-text-muted">
                        <MapPin className="mt-0.5 size-3 shrink-0" />
                        <span>
                          {c.address.street} {c.address.houseNumber}
                          {", "}
                          {[c.address.postalCode, c.address.city].filter(Boolean).join(" ")}
                          {c.address.area ? ` · ${c.address.area}` : ""}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
