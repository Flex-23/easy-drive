"use client";

import { useTransition } from "react";
import { PlayCircle, Trash2, Clock, User, PauseCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatMoney, formatTime } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import { OrderTypeBadge } from "@/components/ui/badges";
import { EmptyState } from "@/components/ui/empty-state";
import type { OrderCard } from "@/lib/queries/orders";

/**
 * The parked bills. Each one shows what is on it, so the cashier can tell two
 * waiting orders apart before bringing one back to the till.
 */
export function HeldOrdersModal({
  orders,
  busy,
  onClose,
  onResume,
  onDelete,
}: {
  orders: OrderCard[];
  busy: boolean;
  onClose: () => void;
  onResume: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const { locale, dict } = useI18n();
  const [pending, start] = useTransition();
  const t = dict.held;

  const typeLabel = (type: OrderCard["type"]) =>
    type === "DINE_IN"
      ? dict.orderType.dineIn
      : type === "PICKUP"
        ? dict.orderType.pickup
        : dict.orderType.delivery;

  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={dict.common.close}
      title={t.title}
      subtitle={t.subtitle}
      maxWidth="max-w-2xl"
    >
      {orders.length === 0 ? (
        <EmptyState icon={PauseCircle}>{t.empty}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-[var(--radius-btn)] border border-border bg-surface-raised p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="tnum font-bold text-text">{order.orderNumber}</span>
                <OrderTypeBadge label={typeLabel(order.type)} />
                <span className="tnum flex items-center gap-1 text-xs text-text-faint">
                  <Clock className="size-3.5" />
                  {formatTime(order.createdAt, locale)}
                </span>
                {order.customerName ? (
                  <span className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
                    <User className="size-3.5 shrink-0" />
                    <span className="truncate">{order.customerName}</span>
                  </span>
                ) : null}
                <span className="tnum ms-auto font-bold text-text">
                  {formatMoney(order.total, locale)}
                </span>
              </div>

              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                {order.lines.map((line) => (
                  <li key={line.id} className="tnum">
                    {line.quantity}× {line.name}
                    {line.options.length > 0 ? (
                      <span className="text-text-faint"> ({line.options.join("، ")})</span>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => start(() => onResume(order.id))}
                  disabled={busy || pending}
                  className="press flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-2 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
                >
                  <PlayCircle className="size-4" />
                  {t.resume}
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm(t.deleteConfirm)) return;
                    start(() => onDelete(order.id));
                  }}
                  disabled={busy || pending}
                  aria-label={t.delete}
                  title={t.delete}
                  className="press rounded-[var(--radius-btn)] border border-border px-3 text-text-faint hover:bg-danger-weak hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
