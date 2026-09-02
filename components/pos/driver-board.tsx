"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  CreditCard,
  XCircle,
  Bike,
  Phone,
  MapPin,
  Package,
  CornerDownLeft,
  Clock,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatMoney, formatTime } from "@/lib/money";
import { useToast } from "@/components/ui/toast";
import {
  assignDriver,
  markPaidOnline,
  cancelDriverOrder,
} from "@/app/actions/drivers";
import type { DriverBoard as Board, DriverOrder } from "@/lib/queries/drivers";

export function DriverBoard({ board }: { board: Board }) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [, start] = useTransition();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [driverInput, setDriverInput] = useState("");
  const driverRef = useRef<HTMLInputElement>(null);

  // Keep the board fresh as the cashier submits new orders.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [router]);

  const selected = useMemo<DriverOrder | null>(
    () =>
      [...board.unassigned, ...board.assigned].find((o) => o.id === selectedId) ??
      null,
    [board, selectedId],
  );

  function select(o: DriverOrder) {
    setSelectedId(o.id);
    setDriverInput(o.driverNumber ? String(o.driverNumber) : "");
    requestAnimationFrame(() => driverRef.current?.focus());
  }

  function doAssign() {
    if (!selected) return;
    const n = Number(driverInput.trim());
    if (!Number.isInteger(n) || n < 1) return;
    start(async () => {
      const res = await assignDriver(selected.id, n, locale);
      if (res.ok) {
        toast(dict.toast.driverAssigned, "success");
        setDriverInput("");
        router.refresh();
      } else {
        toast(dict.toast.genericError, "error");
      }
    });
  }

  function doPaidOnline() {
    if (!selected) return;
    start(async () => {
      const res = await markPaidOnline(selected.id, locale);
      toast(res.ok ? dict.toast.paidOnlineMarked : dict.toast.genericError, res.ok ? "success" : "error");
      router.refresh();
    });
  }

  function doCancel() {
    if (!selected) return;
    start(async () => {
      const res = await cancelDriverOrder(selected.id, locale);
      if (res.ok) {
        toast(dict.toast.orderCancelled, "success");
        setSelectedId(null);
        router.refresh();
      } else {
        toast(dict.toast.genericError, "error");
      }
    });
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-4 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1.35fr]">
      {/* Section 1 — pending / unassigned */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-text">
            <Package className="size-4 text-accent" />
            {dict.drivers.pending}
          </h2>
          <span className="tnum inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-fg">
            {board.unassignedCount}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {board.unassigned.length === 0 ? (
            <p className="mt-8 text-center text-sm text-text-muted">{dict.drivers.noPending}</p>
          ) : (
            board.unassigned.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                active={o.id === selectedId}
                onClick={() => select(o)}
                locale={locale}
                paidLabel={dict.drivers.paid}
                unpaidLabel={dict.drivers.unpaid}
              />
            ))
          )}
        </div>

        {/* Action bar for the selected order */}
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={driverRef}
                value={driverInput}
                onChange={(e) => setDriverInput(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    doAssign();
                  }
                }}
                inputMode="numeric"
                disabled={!selected}
                placeholder={dict.drivers.driverInputHint}
                className="tnum w-full rounded-[var(--radius-btn)] border border-border bg-surface-muted px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-faint focus:border-accent disabled:opacity-50"
                aria-label={dict.drivers.driverId}
              />
            </div>
            <button
              onClick={doAssign}
              disabled={!selected || !driverInput.trim()}
              className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-accent px-3 py-2.5 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-40"
            >
              <CornerDownLeft className="size-4" />
              {dict.drivers.assign}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={doPaidOnline}
              disabled={!selected}
              className="press flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-border py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted disabled:opacity-40"
            >
              <CreditCard className="size-4" />
              {dict.drivers.paidOnline}
            </button>
            <button
              onClick={doCancel}
              disabled={!selected}
              className="press flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-border py-2 text-sm font-semibold text-danger hover:bg-danger-weak disabled:opacity-40"
            >
              <XCircle className="size-4" />
              {dict.drivers.cancel}
            </button>
          </div>
        </div>
      </section>

      {/* Section 2 — assigned / in transit */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-text">
            <Bike className="size-4 text-accent" />
            {dict.drivers.assigned}
          </h2>
          <button
            onClick={() => router.refresh()}
            className="press rounded-md p-1 text-text-faint hover:text-text"
            aria-label={dict.drivers.refresh}
            title={dict.drivers.refresh}
          >
            <RefreshCw className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {board.assigned.length === 0 ? (
            <p className="mt-8 text-center text-sm text-text-muted">{dict.drivers.noAssigned}</p>
          ) : (
            board.assigned.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                active={o.id === selectedId}
                onClick={() => select(o)}
                locale={locale}
                paidLabel={dict.drivers.paid}
                unpaidLabel={dict.drivers.unpaid}
                driverTag
              />
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
          <div className="rounded-[var(--radius-btn)] border border-border p-2.5 text-center">
            <p className="text-xs text-text-muted">{dict.drivers.count}</p>
            <p className="tnum text-lg font-bold text-text">{board.assignedCount}</p>
          </div>
          <div className="rounded-[var(--radius-btn)] border border-border p-2.5 text-center">
            <p className="text-xs text-text-muted">{dict.drivers.sum}</p>
            <p className="tnum text-lg font-bold text-text">{formatMoney(board.assignedSum, locale)}</p>
          </div>
        </div>
      </section>

      {/* Section 3 — details preview */}
      <section className="hidden min-h-0 flex-col gap-3 xl:flex">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <span className="tnum text-lg font-bold text-text">{selected.orderNumber}</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${selected.paid ? "bg-success-weak text-success" : "bg-warning-weak text-warning"}`}
                >
                  {selected.paid ? dict.drivers.paid : dict.drivers.unpaid}
                </span>
              </div>
              <p className="mt-2 text-base font-semibold text-text">
                {selected.customerName ?? dict.customer.noCustomer}
              </p>
              {selected.customerPhone ? (
                <p className="tnum mt-0.5 flex items-center gap-1.5 text-sm text-text-muted">
                  <Phone className="size-3.5" /> {selected.customerPhone}
                </p>
              ) : null}
              {selected.address ? (
                <p className="mt-1 flex items-start gap-1.5 text-sm text-text-muted">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" /> {selected.address}
                </p>
              ) : null}
              <p className="tnum mt-2 flex items-center gap-1.5 text-xs text-text-faint">
                <Clock className="size-3.5" /> {formatTime(selected.createdAt, locale)}
              </p>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">{dict.drivers.selectHint}</p>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text">
              <Package className="size-4 text-accent" />
              {dict.drivers.items}
            </h3>
            {selected ? (
              <span className="tnum text-sm font-bold text-text">{formatMoney(selected.total, locale)}</span>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {selected ? (
              <ul className="space-y-2">
                {selected.lines.map((l) => (
                  <li key={l.id} className="flex items-start gap-2 border-b border-border pb-2 last:border-0">
                    {l.itemNumber ? (
                      <span className="tnum mt-0.5 text-xs font-semibold text-text-faint">#{l.itemNumber}</span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">{l.name}</p>
                      {l.options.length > 0 ? (
                        <p className="text-xs text-text-muted">{l.options.join("، ")}</p>
                      ) : null}
                      {l.kitchenNotes ? (
                        <p className="text-xs italic text-warning">{l.kitchenNotes}</p>
                      ) : null}
                    </div>
                    <span className="tnum shrink-0 text-sm font-bold text-text">×{l.quantity}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-text-muted">{dict.drivers.selectHint}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function OrderRow({
  order,
  active,
  onClick,
  locale,
  paidLabel,
  unpaidLabel,
  driverTag,
}: {
  order: DriverOrder;
  active: boolean;
  onClick: () => void;
  locale: "ar" | "de";
  paidLabel: string;
  unpaidLabel: string;
  driverTag?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`press mb-1.5 flex w-full items-center gap-3 rounded-[var(--radius-btn)] border p-3 text-start transition-colors ${
        active ? "border-accent bg-accent-weak" : "border-border bg-surface-raised hover:border-border-strong"
      }`}
    >
      {driverTag && order.driverNumber ? (
        <span className="tnum flex shrink-0 items-center justify-center rounded-md bg-accent px-2 py-1 text-xs font-bold text-accent-fg">
          X-{order.driverNumber}
        </span>
      ) : null}
      <span className="tnum shrink-0 text-sm font-bold text-text">{order.orderNumber}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
        {order.customerName ?? ""}
      </span>
      <span
        className={`size-2 shrink-0 rounded-full ${order.paid ? "bg-success" : "bg-warning"}`}
        title={order.paid ? paidLabel : unpaidLabel}
      />
      <span className="tnum shrink-0 text-sm font-bold text-text">{formatMoney(order.total, locale)}</span>
    </button>
  );
}
