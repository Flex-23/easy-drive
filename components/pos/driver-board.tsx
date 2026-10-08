"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  ChevronDown,
  Printer,
  Bike,
  Check,
  X,
  Banknote,
  ShoppingBag,
  ReceiptText,
  ChefHat,
  QrCode,
  RotateCcw,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatMoney, formatTime } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  assignDriver,
  markPaidCash,
  markPaidOnline,
  cancelDriverOrder,
  restoreOrder,
} from "@/app/actions/drivers";
import {
  printPendingReport,
  printProcessedReport,
  printOrderTicket,
  type BoardScope,
  type TicketKind,
} from "@/app/actions/print";
import { EmptyState } from "@/components/ui/empty-state";
import type { DriverBoard as Board, DriverOrder } from "@/lib/queries/drivers";
import type { OrderType } from "@prisma/client";

type Group = {
  key: string;
  kind: "driver" | "cash" | "online" | "cancelled";
  label: string;
  cls: string;
  orders: DriverOrder[];
  sum: number;
};

export function DriverBoard({ board }: { board: Board }) {
  const { locale, dict } = useI18n();
  const errorText = (key: string) =>
    (dict.errors as Record<string, string>)[key] ?? dict.toast.genericError;
  const { toast } = useToast();
  const router = useRouter();
  const [, start] = useTransition();

  const [openId, setOpenId] = useState<number | null>(null);

  /** What the print buttons cover; the paper itself is built on the server. */
  const [scope, setScope] = useState<BoardScope>({ kind: "all" });

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [router]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const selected = useMemo<DriverOrder | null>(
    () =>
      [...board.pending, ...board.processed].find((o) => o.id === openId) ?? null,
    [board, openId],
  );

  // One line per driver (plus grouped online / cancelled rows).
  const groups = useMemo<Group[]>(() => {
    const byDriver = new Map<number, DriverOrder[]>();
    const cash: DriverOrder[] = [];
    const online: DriverOrder[] = [];
    const cancelled: DriverOrder[] = [];
    for (const o of board.processed) {
      if (o.cancelled) cancelled.push(o);
      else if (o.driverNumber !== null) {
        const list = byDriver.get(o.driverNumber) ?? [];
        list.push(o);
        byDriver.set(o.driverNumber, list);
      } else if (o.paidCash) cash.push(o);
      else if (o.paidOnline) online.push(o);
    }
    const out: Group[] = [];
    for (const [num, orders] of [...byDriver.entries()].sort((a, b) => a[0] - b[0])) {
      out.push({
        key: `d${num}`,
        kind: "driver",
        label: `X-${num}`,
        cls: "bg-accent text-accent-fg",
        orders,
        sum: orders.reduce((a, o) => a + o.total, 0),
      });
    }
    if (cash.length)
      out.push({
        key: "cash",
        kind: "cash",
        label: dict.drivers.paidCash,
        cls: "bg-accent-weak text-accent",
        orders: cash,
        sum: cash.reduce((a, o) => a + o.total, 0),
      });
    if (online.length)
      out.push({
        key: "online",
        kind: "online",
        label: dict.drivers.paidOnline,
        cls: "bg-success-weak text-success",
        orders: online,
        sum: online.reduce((a, o) => a + o.total, 0),
      });
    if (cancelled.length)
      out.push({
        key: "cancelled",
        kind: "cancelled",
        label: dict.drivers.cancelled,
        cls: "bg-danger-weak text-danger",
        orders: cancelled,
        sum: 0,
      });
    return out;
  }, [board.processed, dict]);

  /** Hands a print job to the machine and reports what came back. */
  function print(job: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await job();
      if (!res.ok) toast(errorText(res.error ?? "printerFailed"), "error");
    });
  }

  /** Clicking a group selects it for printing; clicking it again releases it. */
  function selectForPrint(key: string) {
    setScope((prev) =>
      prev.kind === "group" && prev.key === key ? { kind: "all" } : { kind: "group", key },
    );
  }

  const scopeLabel =
    scope.kind === "all"
      ? dict.drivers.scopeAll
      : scope.kind === "drivers"
        ? dict.drivers.scopeDrivers
        : (groups.find((g) => g.key === scope.key)?.label ?? dict.drivers.scopeAll);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function run(
    action: () => Promise<{ ok: boolean }>,
    successMsg: string,
  ) {
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast(successMsg, "success");
        setOpenId(null);
        router.refresh();
      } else toast(dict.toast.genericError, "error");
    });
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-4 lg:grid-cols-2">
      {/* Section 1 — pending: newest first, sequence · order number · total */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-text">
            <Package className="size-4 text-accent" />
            {dict.drivers.pending}
          </h2>
          <div className="flex items-center gap-2">
            <span className="tnum inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-fg">
              {board.pendingCount}
            </span>
            <button
              onClick={() => print(printPendingReport)}
              disabled={board.pending.length === 0}
              aria-label={dict.drivers.print}
              title={dict.drivers.print}
              className="press rounded-md p-1.5 text-text-faint hover:bg-surface-muted hover:text-text disabled:opacity-40"
            >
              <Printer className="size-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {board.pending.length === 0 ? (
            <EmptyState icon={Package}>{dict.drivers.noPending}</EmptyState>
          ) : (
            board.pending.map((o, i) => (
              <button
                key={o.id}
                onClick={() => setOpenId(o.id)}
                className="press mb-1.5 flex w-full items-center gap-3 rounded-[var(--radius-btn)] border border-border bg-surface-raised p-3 text-start shadow-[var(--shadow-sm)] hover:border-accent/45 hover:bg-accent-weak/40"
              >
                {/* Arrival sequence: oldest is 1 at the bottom, newest on top. */}
                <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-xs font-bold text-text-muted">
                  {board.pending.length - i}
                </span>
                <span className="tnum flex-1 text-sm font-bold text-text">{o.orderNumber}</span>
                {/* Pickup or delivery — what has to happen to this order. */}
                <TypeBadge type={o.type} />
                <span className="tnum shrink-0 text-sm font-bold text-text">{formatMoney(o.total, locale)}</span>
              </button>
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
          <Stat label={dict.drivers.count} value={String(board.pendingCount)} big />
          <Stat label={dict.drivers.sum} value={formatMoney(board.pendingSum, locale)} big />
        </div>
      </section>

      {/* Section 2 — one line per driver (count + sum), expandable */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-text">
            <ClipboardList className="size-4 text-accent" />
            {dict.drivers.processed}
          </h2>

          <div className="flex items-center gap-1.5">
            {/* What the printer will get: everything, the drivers, or one group */}
            <span
              className="tnum inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-muted"
              title={dict.drivers.printScope}
            >
              {scopeLabel}
              {scope.kind !== "all" ? (
                <button
                  onClick={() => setScope({ kind: "all" })}
                  aria-label={dict.drivers.clearSelection}
                  className="press rounded-full p-0.5 hover:text-danger"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
            <button
              onClick={() =>
                setScope((prev) =>
                  prev.kind === "drivers" ? { kind: "all" } : { kind: "drivers" },
                )
              }
              aria-pressed={scope.kind === "drivers"}
              aria-label={dict.drivers.scopeDrivers}
              title={dict.drivers.scopeDrivers}
              className={`press rounded-md p-1.5 hover:bg-surface-muted ${
                scope.kind === "drivers" ? "text-accent" : "text-text-faint hover:text-text"
              }`}
            >
              <Bike className="size-4" />
            </button>
            <button
              onClick={() => print(() => printProcessedReport(scope))}
              disabled={groups.length === 0}
              aria-label={dict.drivers.print}
              title={dict.drivers.print}
              className="press rounded-md p-1.5 text-text-faint hover:bg-surface-muted hover:text-text disabled:opacity-40"
            >
              <Printer className="size-4" />
            </button>
            <button
              onClick={() => router.refresh()}
              className="press rounded-md p-1.5 text-text-faint hover:bg-surface-muted hover:text-text"
              aria-label={dict.drivers.refresh}
              title={dict.drivers.refresh}
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <EmptyState icon={ClipboardList}>{dict.drivers.noAssigned}</EmptyState>
          ) : (
            groups.map((g) => {
              const open = expanded.has(g.key);
              const picked = scope.kind === "group" && scope.key === g.key;
              return (
                <div key={g.key} className="mb-1.5">
                  <div
                    className={`flex w-full items-center rounded-[var(--radius-btn)] border bg-surface-raised shadow-[var(--shadow-sm)] transition-colors ${
                      picked ? "is-selected" : "border-border hover:border-border-strong"
                    }`}
                  >
                    {/* The whole row selects the group for printing: the easy
                        action gets the big target. Opening it is the chevron's
                        job, which is a deliberate second tap. */}
                    <button
                      onClick={() => selectForPrint(g.key)}
                      role="checkbox"
                      aria-checked={picked}
                      aria-label={`${g.label} — ${dict.drivers.selectForPrint}`}
                      className="press flex min-h-14 flex-1 items-center gap-2.5 rounded-[var(--radius-btn)] px-3 text-start"
                    >
                      <span
                        aria-hidden
                        className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                          picked
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border-strong text-transparent"
                        }`}
                      >
                        <Check className="size-4" strokeWidth={3} />
                      </span>
                      <span className={`tnum shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${g.cls}`}>
                        {g.label}
                      </span>
                      <span className="flex-1" />
                      <span className="tnum inline-flex items-center gap-1 text-sm font-semibold text-text-muted">
                        <span className="text-text-faint">{dict.drivers.count}</span>
                        {g.orders.length}
                      </span>
                      {g.kind !== "cancelled" ? (
                        <span className="tnum w-20 text-end text-sm font-bold text-text">{formatMoney(g.sum, locale)}</span>
                      ) : (
                        <span className="w-20" />
                      )}
                    </button>

                    <button
                      onClick={() => toggle(g.key)}
                      aria-expanded={open}
                      aria-label={g.label}
                      className="press flex min-h-14 w-12 shrink-0 items-center justify-center rounded-[var(--radius-btn)] text-text-faint hover:bg-surface-muted hover:text-text"
                    >
                      <ChevronDown
                        className={`size-5 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
                      />
                    </button>
                  </div>
                  {open ? (
                    <div className="mt-1 ms-3 flex flex-col gap-1 border-s border-border ps-2">
                      {g.orders.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => setOpenId(o.id)}
                          className={`press flex items-center gap-2 rounded-[var(--radius-btn)] border border-border bg-surface p-2 text-start hover:border-border-strong ${
                            o.cancelled ? "opacity-60" : ""
                          }`}
                        >
                          <span className={`tnum flex-1 text-sm font-bold text-text ${o.cancelled ? "line-through" : ""}`}>
                            {o.orderNumber}
                          </span>
                          <TypeBadge type={o.type} />
                          <span className="tnum shrink-0 text-sm font-semibold text-text">{formatMoney(o.total, locale)}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
          <Stat label={dict.drivers.count} value={String(board.processedCount)} big />
          <Stat label={dict.drivers.sum} value={formatMoney(board.processedSum, locale)} big />
        </div>
      </section>

      {selected ? (
      <OrderDetailModal
        key={selected.id}
        order={selected}
        onClose={() => setOpenId(null)}
        onAssign={(id, n) => run(() => assignDriver(id, n, locale), dict.toast.driverAssigned)}
        onPaidCash={(id) => run(() => markPaidCash(id, locale), dict.toast.paidCashMarked)}
        onPaidOnline={(id) => run(() => markPaidOnline(id, locale), dict.toast.paidOnlineMarked)}
        onCancel={(id) => run(() => cancelDriverOrder(id, locale), dict.toast.orderCancelled)}
        onRestore={(id) => run(() => restoreOrder(id, locale), dict.toast.orderRestored)}
        onPrint={(kind) => print(() => printOrderTicket(selected.id, kind))}
      />
      ) : null}
    </div>
  );
}

/** The order form: customer, address, items — and the dispatch actions. */
function OrderDetailModal({
  order,
  onClose,
  onAssign,
  onPaidCash,
  onPaidOnline,
  onCancel,
  onRestore,
  onPrint,
}: {
  order: DriverOrder;
  onClose: () => void;
  onAssign: (id: number, driverNumber: number) => void;
  onPaidCash: (id: number) => void;
  onPaidOnline: (id: number) => void;
  onCancel: (id: number) => void;
  onRestore: (id: number) => void;
  onPrint: (kind: TicketKind) => void;
}) {
  const { locale, dict } = useI18n();
  // Keyed on the order id by the caller, so this seeds once per opened order.
  const [driverInput, setDriverInput] = useState(
    order.driverNumber !== null ? String(order.driverNumber) : "",
  );

  const locked = order.cancelled;
  const isDelivery = order.type === "DELIVERY";

  function submit() {
    if (locked) return;
    const n = Number(driverInput.trim());
    if (!Number.isInteger(n) || n < 1) return;
    onAssign(order.id, n);
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={dict.common.close}
      maxWidth="max-w-lg"
      title={
        <span className="flex items-center gap-2">
          <span className="tnum">{order.orderNumber}</span>
          <TypeBadge type={order.type} />
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
              order.cancelled
                ? "bg-danger-weak text-danger"
                : order.paid
                  ? "bg-success-weak text-success"
                  : "bg-warning-weak text-warning"
            }`}
          >
            {order.cancelled
              ? dict.drivers.cancelled
              : order.paid
                ? dict.drivers.paid
                : dict.drivers.unpaid}
          </span>
        </span>
      }
      subtitle={isDelivery ? dict.drivers.deliveryHint : dict.drivers.pickupHint}
      footer={
        locked ? (
          // A cancelled order can do one thing: come back.
          <button
            onClick={() => onRestore(order.id)}
            className="press flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-border py-2.5 text-sm font-bold text-text hover:border-accent hover:bg-accent-weak hover:text-accent"
          >
            <RotateCcw className="size-4" />
            {dict.drivers.restore}
          </button>
        ) : (
          <div className="space-y-2">
            {/* Any order can go out with a driver — a pickup too, if the
                customer asks for it after all. */}
            <div className="flex items-center gap-2">
              <input
                data-autofocus
                value={driverInput}
                onChange={(e) => setDriverInput(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                inputMode="numeric"
                placeholder={dict.drivers.driverInputHint}
                className="tnum w-full flex-1 rounded-[var(--radius-btn)] border border-border bg-surface-muted px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-faint focus:border-accent"
                aria-label={dict.drivers.driverId}
              />
              <button
                onClick={submit}
                disabled={!driverInput.trim()}
                className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-accent px-3 py-2.5 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-40"
              >
                <CornerDownLeft className="size-4" />
                {dict.drivers.assign}
              </button>
            </div>
            {/* Settling: a pickup is usually paid at the counter, so cash leads
                there; a delivery's cash comes back with the driver. */}
            <div className={`grid gap-2 ${isDelivery ? "grid-cols-2" : "grid-cols-3"}`}>
              {!isDelivery ? (
                <button
                  onClick={() => onPaidCash(order.id)}
                  className="press flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-accent bg-accent-weak py-2 text-sm font-bold text-accent hover:bg-accent hover:text-accent-fg"
                >
                  <Banknote className="size-4" />
                  {dict.drivers.payCash}
                </button>
              ) : null}
              <button
                onClick={() => onPaidOnline(order.id)}
                className="press flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-border py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted"
              >
                <CreditCard className="size-4" />
                {dict.drivers.payOnline}
              </button>
              <button
                onClick={() => onCancel(order.id)}
                className="press flex items-center justify-center gap-1.5 rounded-[var(--radius-btn)] border border-border py-2 text-sm font-semibold text-danger hover:bg-danger-weak"
              >
                <XCircle className="size-4" />
                {dict.drivers.cancel}
              </button>
            </div>
          </div>
        )
      }
    >
      <div className="rounded-[var(--radius-btn)] border border-border p-3">
        <p className="text-base font-semibold text-text">
          {order.customerName ?? dict.customer.noCustomer}
        </p>
        {order.customerPhone ? (
          <p className="tnum mt-1 flex items-center gap-1.5 text-sm text-text-muted">
            <Phone className="size-3.5" /> {order.customerPhone}
          </p>
        ) : null}
        {order.address ? (
          <p className="mt-1 flex items-start gap-1.5 text-sm text-text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" /> {order.address}
          </p>
        ) : null}
        {order.address && order.addressNotes ? (
          <p className="mt-0.5 text-sm italic text-warning ps-5">{order.addressNotes}</p>
        ) : null}
        <p className="tnum mt-1.5 flex items-center gap-1.5 text-xs text-text-faint">
          <Clock className="size-3.5" /> {formatTime(order.createdAt, locale)}
        </p>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            <Package className="size-4 text-accent" />
            {dict.drivers.items}
          </h3>
          <span className="tnum text-sm font-bold text-text">
            {formatMoney(order.total, locale)}
          </span>
        </div>
        <ul className="space-y-2">
          {order.lines.map((l) => (
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
      </div>

      {/* Three papers this order can produce. */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
        <TicketButton
          icon={ReceiptText}
          label={dict.tickets.receipt}
          onClick={() => onPrint("receipt")}
        />
        <TicketButton
          icon={ChefHat}
          label={dict.tickets.kitchen}
          onClick={() => onPrint("kitchen")}
        />
        <TicketButton
          icon={QrCode}
          label={dict.tickets.label}
          onClick={() => onPrint("label")}
        />
      </div>
    </Modal>
  );
}

/** One of the three papers an order can produce. */
function TicketButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Printer;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="press flex flex-col items-center gap-1 rounded-[var(--radius-btn)] border border-border py-2 text-xs font-semibold text-text-muted hover:bg-surface-muted hover:text-text"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

/** Pickup or delivery, in one glance. */
function TypeBadge({ type }: { type: OrderType }) {
  const { dict } = useI18n();
  const delivery = type === "DELIVERY";
  const Icon = delivery ? Bike : ShoppingBag;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        delivery ? "bg-accent-weak text-accent" : "bg-surface-muted text-text-muted"
      }`}
    >
      <Icon className="size-3.5" />
      {delivery ? dict.orderType.delivery : dict.orderType.pickup}
    </span>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-[var(--radius-btn)] border border-border p-2 text-center">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`tnum font-bold text-text ${big ? "text-lg" : "text-base"}`}>{value}</p>
    </div>
  );
}
