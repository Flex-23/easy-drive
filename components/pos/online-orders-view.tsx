"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Printer, Clock, MapPin, Phone, Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatMoney, formatTime } from "@/lib/money";
import { useToast } from "@/components/ui/toast";
import { acceptOnlineOrder, rejectOnlineOrder } from "@/app/actions/orders";
import type { OrderCard } from "@/lib/queries/orders";

const ACCEPT_WINDOW_MS = 15 * 60 * 1000;

export function OnlineOrdersView({ orders }: { orders: OrderCard[] }) {
  const { locale, dict } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => router.refresh(), 15000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [router]);

  function accept(id: number) {
    start(async () => {
      const res = await acceptOnlineOrder(id, locale);
      toast(res.ok ? dict.toast.onlineOrderAccepted : dict.toast.genericError, res.ok ? "success" : "error");
      router.refresh();
    });
  }
  function reject(id: number) {
    start(async () => {
      const res = await rejectOnlineOrder(id, locale);
      toast(res.ok ? dict.toast.onlineOrderRejected : dict.toast.genericError, res.ok ? "success" : "error");
      router.refresh();
    });
  }

  if (orders.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Globe className="size-12 text-text-faint/50" />
        <p className="text-text-muted">{dict.onlineOrders.empty}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {orders.map((o) => {
        const created = new Date(o.createdAt).getTime();
        const remaining = Math.max(0, created + ACCEPT_WINDOW_MS - now);
        const mm = String(Math.floor(remaining / 60000)).padStart(2, "0");
        const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
        const urgent = remaining < 5 * 60 * 1000;
        const isNew = now - created < 90 * 1000;

        return (
          <div
            key={o.id}
            className="animate-scale-in flex flex-col rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-weak px-2 py-0.5 text-xs font-semibold text-accent">
                  <Globe className="size-3" /> {dict.onlineOrders.source}
                </span>
                {isNew ? (
                  <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">
                    {dict.onlineOrders.newBadge}
                  </span>
                ) : null}
              </div>
              <span
                className={`tnum inline-flex items-center gap-1 text-sm font-bold ${urgent ? "text-danger" : "text-text-muted"}`}
              >
                <Clock className="size-3.5" /> {mm}:{ss}
              </span>
            </div>

            <div className="flex-1 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="tnum text-sm font-bold text-text">{o.orderNumber}</span>
                <span className="tnum text-xs text-text-faint">{formatTime(o.createdAt, locale)}</span>
              </div>
              {o.customerName ? (
                <p className="mt-1 text-sm font-semibold text-text">{o.customerName}</p>
              ) : null}
              {o.customerPhone ? (
                <p className="tnum flex items-center gap-1 text-xs text-text-muted">
                  <Phone className="size-3" /> {o.customerPhone}
                </p>
              ) : null}
              {o.address ? (
                <p className="mt-0.5 flex items-start gap-1 text-xs text-text-muted">
                  <MapPin className="mt-0.5 size-3 shrink-0" /> {o.address}
                </p>
              ) : null}

              <ul className="mt-2 space-y-1 border-t border-border pt-2">
                {o.lines.map((l) => (
                  <li key={l.id} className="text-sm text-text">
                    <span className="tnum font-semibold">{l.quantity}×</span> {l.name}
                    {l.options.length > 0 ? (
                      <span className="block ps-5 text-xs text-text-muted">{l.options.join(", ")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
              <span className="tnum font-bold text-text">{formatMoney(o.total, locale)}</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => window.print()}
                  className="press flex size-9 items-center justify-center rounded-[var(--radius-btn)] border border-border text-text-muted hover:bg-surface-muted"
                  aria-label={dict.onlineOrders.printLabel}
                >
                  <Printer className="size-4" />
                </button>
                <button
                  onClick={() => reject(o.id)}
                  className="press flex size-9 items-center justify-center rounded-[var(--radius-btn)] border border-border text-danger hover:bg-danger-weak"
                  aria-label={dict.onlineOrders.reject}
                >
                  <X className="size-4" />
                </button>
                <button
                  onClick={() => accept(o.id)}
                  className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-success px-3 py-2 text-sm font-bold text-white hover:opacity-90"
                >
                  <Check className="size-4" />
                  {dict.onlineOrders.accept}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
