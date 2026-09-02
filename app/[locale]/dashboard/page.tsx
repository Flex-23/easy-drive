import { notFound } from "next/navigation";
import { TrendingUp, ReceiptText, CircleDollarSign, Bike } from "lucide-react";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { requireCashier } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getDashboard } from "@/lib/queries/orders";
import { formatMoney, formatNumber, formatTime } from "@/lib/money";
import { StatusBadge, OrderTypeBadge } from "@/components/ui/badges";
import type { OrderType } from "@prisma/client";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  await requireCashier(locale);

  const dict = getDictionary(locale);
  const data = await getDashboard();

  const typeLabel = (t: OrderType) =>
    t === "DINE_IN" ? dict.orderType.dineIn : t === "PICKUP" ? dict.orderType.pickup : dict.orderType.delivery;

  const maxHour = Math.max(1, ...data.revenueByHour.map((h) => h.revenue));

  const tiles = [
    { label: dict.dashboard.revenueToday, value: formatMoney(data.revenueToday, locale), icon: CircleDollarSign },
    { label: dict.dashboard.orderCount, value: formatNumber(data.orderCount, locale), icon: ReceiptText },
    { label: dict.dashboard.avgTicket, value: formatMoney(data.avgTicket, locale), icon: TrendingUp },
    { label: dict.dashboard.activeDeliveries, value: formatNumber(data.activeDeliveries, locale), icon: Bike },
  ];

  return (
    <div className="h-full overflow-y-auto p-5">
      <h1 className="mb-4 text-xl font-bold text-text">{dict.dashboard.title}</h1>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">{t.label}</span>
                <Icon className="size-4 text-accent" />
              </div>
              <p className="tnum mt-2 text-2xl font-extrabold text-text">{t.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Revenue by hour */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-4 font-bold text-text">{dict.dashboard.revenueByHour}</h2>
          <div className="flex h-52 items-end gap-1.5">
            {data.revenueByHour.map((h) => (
              <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-accent/80 transition-all"
                    style={{ height: `${Math.max(2, (h.revenue / maxHour) * 100)}%` }}
                    title={formatMoney(h.revenue, locale)}
                  />
                </div>
                <span className="tnum text-[10px] text-text-faint">{h.hour}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Recent orders */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-3 font-bold text-text">{dict.dashboard.recentOrders}</h2>
          {data.recentOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">{dict.dashboard.noOrders}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="tnum text-sm font-semibold text-text">{o.orderNumber}</p>
                    <p className="truncate text-xs text-text-muted">
                      {o.customerName ?? dict.customer.noCustomer} · {formatTime(o.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <OrderTypeBadge label={typeLabel(o.type)} />
                    <StatusBadge status={o.status} label={dict.status[o.status]} />
                    <span className="tnum w-16 text-end text-sm font-bold text-text">
                      {formatMoney(o.total, locale)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
