"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  CreditCard,
  XCircle,
  ClipboardList,
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

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [router]);

  const selected = useMemo<DriverOrder | null>(
    () =>
      [...board.pending, ...board.processed].find((o) => o.id === selectedId) ??
      null,
    [board, selectedId],
  );

  const locked = !selected || selected.cancelled;

  function select(o: DriverOrder) {
    setSelectedId(o.id);
    setDriverInput(o.driverNumber ? String(o.driverNumber) : "");
    requestAnimationFrame(() => driverRef.current?.focus());
  }

  function doAssign() {
    if (locked || !selected) return;
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
    if (locked || !selected) return;
    start(async () => {
      const res = await markPaidOnline(selected.id, locale);
      toast(res.ok ? dict.toast.paidOnlineMarked : dict.toast.genericError, res.ok ? "success" : "error");
      router.refresh();
    });
  }

  function doCancel() {
    if (locked || !selected) return;
    start(async () => {
      const res = await cancelDriverOrder(selected.id, locale);
      if (res.ok) {
        toast(dict.toast.orderCancelled, "success");
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
            {board.pendingCount}
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {board.pending.length === 0 ? (
            <p className="mt-8 text-center text-sm text-text-muted">{dict.drivers.noPending}</p>
          ) : (
            board.pending.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                active={o.id === selectedId}
                onClick={() => select(o)}
                locale={locale}
                dict={dict}
              />
            ))
          )}
        </div>

        {/* Pending totals */}
        <div className="grid grid-cols-2 gap-2 border-t border-border px-3 pt-3">
          <div className="rounded-[var(--radius-btn)] border border-border p-2 text-center">
            <p className="text-xs text-text-muted">{dict.drivers.count}</p>
            <p className="tnum text-base font-bold text-text">{board.pendingCount}</p>
          </div>
          <div className="rounded-[var(--radius-btn)] border border-border p-2 text-center">
            <p className="text-xs text-text-muted">{dict.drivers.sum}</p>
            <p className="tnum text-base font-bold text-text">{formatMoney(board.pendingSum, locale)}</p>
          </div>
        </div>

        {/* Action bar for the selected order */}
        <div className="p-3">
          <div className="mb-2 flex items-center gap-2">
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
              disabled={locked}
              placeholder={dict.drivers.driverInputHint}
              className="tnum w-full flex-1 rounded-[var(--radius-btn)] border border-border bg-surface-muted px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-faint focus:border-accent disabled:opacity-50"
              aria-label={dict.drivers.driverId}
            />
            <button
              onClick={doAssign}
              disabled={locked || !driverInput.trim()}
              className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-accent px-3 py-2.5 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-40"
            >
              <CornerDownLeft className="size-4" />
              {dict.drivers.assign}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={doPaidOnline}
              disabled={locked}
              className="press flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-border py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted disabled:opacity-40"
            >
              <CreditCard className="size-4" />
              {dict.drivers.paidOnline}
            </button>
            <button
              onClick={doCancel}
              disabled={locked}
              className="press flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-border py-2 text-sm font-semibold text-danger hover:bg-danger-weak disabled:opacity-40"
            >
              <XCircle className="size-4" />
              {dict.drivers.cancel}
            </button>
          </div>
        </div>
      </section>

      {/* Section 2 — processed (driver / paid online / cancelled) */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-text">
            <ClipboardList className="size-4 text-accent" />
            {dict.drivers.processed}
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
          {board.processed.length === 0 ? (
            <p className="mt-8 text-center text-sm text-text-muted">{dict.drivers.noAssigned}</p>
          ) : (
            board.processed.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                active={o.id === selectedId}
                onClick={() => select(o)}
                locale={locale}
                dict={dict}
                showTag
              />
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
          <div className="rounded-[var(--radius-btn)] border border-border p-2.5 text-center">
            <p className="text-xs text-text-muted">{dict.drivers.count}</p>
            <p className="tnum text-lg font-bold text-text">{board.processedCount}</p>
          </div>
          <div className="rounded-[var(--radius-btn)] border border-border p-2.5 text-center">
            <p className="text-xs text-text-muted">{dict.drivers.sum}</p>
            <p className="tnum text-lg font-bold text-text">{formatMoney(board.processedSum, locale)}</p>
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
  dict,
  showTag,
}: {
  order: DriverOrder;
  active: boolean;
  onClick: () => void;
  locale: "ar" | "de";
  dict: ReturnType<typeof useI18n>["dict"];
  showTag?: boolean;
}) {
  let tag: { text: string; cls: string } | null = null;
  if (showTag) {
    if (order.cancelled) tag = { text: dict.drivers.cancelled, cls: "bg-danger-weak text-danger" };
    else if (order.driverNumber) tag = { text: `X-${order.driverNumber}`, cls: "bg-accent text-accent-fg" };
    else if (order.paidOnline) tag = { text: dict.drivers.paidOnline, cls: "bg-success-weak text-success" };
  }

  return (
    <button
      onClick={onClick}
      className={`press mb-1.5 flex w-full items-center gap-2.5 rounded-[var(--radius-btn)] border p-3 text-start transition-colors ${
        active
          ? "border-accent bg-accent-weak"
          : "border-border bg-surface-raised hover:border-border-strong"
      } ${order.cancelled ? "opacity-60" : ""}`}
    >
      {tag ? (
        <span className={`tnum shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${tag.cls}`}>
          {tag.text}
        </span>
      ) : null}
      <span className={`tnum shrink-0 text-sm font-bold text-text ${order.cancelled ? "line-through" : ""}`}>
        {order.orderNumber}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{order.customerName ?? ""}</span>
      {!showTag ? (
        <span
          className={`size-2 shrink-0 rounded-full ${order.paid ? "bg-success" : "bg-warning"}`}
          title={order.paid ? dict.drivers.paid : dict.drivers.unpaid}
        />
      ) : null}
      <span className="tnum shrink-0 text-sm font-bold text-text">{formatMoney(order.total, locale)}</span>
    </button>
  );
}
