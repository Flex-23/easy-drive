import Link from "next/link";
import { Banknote, Globe, CircleDollarSign, ReceiptText, TrendingUp, XCircle } from "lucide-react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { panelLocale } from "@/lib/i18n/config";

import { requirePanel } from "@/lib/auth/master-session";
import { getSalesOverview, type SalesPeriod } from "@/lib/queries/master";
import type { ReportedMethod } from "@/lib/queries/orders";
import { formatMoney, formatNumber } from "@/lib/money";
import type { OrderType } from "@prisma/client";

const PERIODS: SalesPeriod[] = ["day", "month"];

export default async function PanelSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePanel();
  const locale = panelLocale;
  const query = await searchParams;
  const dict = getDictionary(locale);
  const t = dict.master.sales;

  const period: SalesPeriod =
    query.period === "month" ? "month" : "day";
  const sales = await getSalesOverview(period);

  const periodLabel: Record<SalesPeriod, string> = { day: t.day, month: t.month };
  const typeLabel = (type: OrderType) =>
    type === "DINE_IN"
      ? dict.orderType.dineIn
      : type === "PICKUP"
        ? dict.orderType.pickup
        : dict.orderType.delivery;
  const methodLabel = (m: ReportedMethod) =>
    m === "CASH" ? dict.payment.cash : dict.payment.online;
  const methodIcon = { CASH: Banknote, ONLINE: Globe } as const;

  const maxBar = Math.max(1, ...sales.series.map((p) => p.revenue));
  const tiles = [
    { label: t.revenue, value: formatMoney(sales.revenue, locale), icon: CircleDollarSign },
    { label: t.orders, value: formatNumber(sales.orders, locale), icon: ReceiptText },
    { label: t.avgTicket, value: formatMoney(sales.avgTicket, locale), icon: TrendingUp },
    { label: t.cancelled, value: formatNumber(sales.cancelled.count, locale), icon: XCircle },
  ];

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-text">{t.title}</h2>
        <div className="inline-flex overflow-hidden rounded-[var(--radius-btn)] border border-border">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`?period=${p}`}
              aria-current={p === period ? "page" : undefined}
              className={`press px-4 py-2 text-sm font-semibold ${
                p === period ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
              }`}
            >
              {periodLabel[p]}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.label}
              className="card-lift rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">{tile.label}</span>
                <Icon className="size-4 text-accent" />
              </div>
              <p className="tnum mt-2 text-2xl font-extrabold text-text">{tile.value}</p>
            </div>
          );
        })}
      </div>

      {/* Revenue by hour (day) or by day (month) */}
      <section className="mb-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 className="mb-4 font-bold text-text">
          {period === "day" ? t.byHour : t.byDay}
        </h2>
        <div className="flex h-52 items-end gap-1 overflow-x-auto">
          {sales.series.map((p) => (
            <div key={p.label} className="flex min-w-6 flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-accent/80"
                  style={{ height: `${Math.max(2, (p.revenue / maxBar) * 100)}%` }}
                  title={`${p.label} — ${formatMoney(p.revenue, locale)}`}
                />
              </div>
              <span className="tnum text-[10px] text-text-faint">{p.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* By order type */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-3 font-bold text-text">{t.byType}</h2>
          <div className="grid grid-cols-3 gap-3">
            {sales.byType.map((row) => (
              <div key={row.type} className="rounded-[var(--radius-btn)] border border-border p-3">
                <span className="text-sm text-text-muted">{typeLabel(row.type)}</span>
                <p className="tnum mt-1 text-lg font-bold text-text">
                  {formatMoney(row.total, locale)}
                </p>
                <p className="tnum text-xs text-text-faint">
                  {formatNumber(row.count, locale)} {t.orders}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* By payment method */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-3 font-bold text-text">{t.byMethod}</h2>
          <div className="grid grid-cols-2 gap-3">
            {sales.byMethod.map((row) => {
              const Icon = methodIcon[row.method];
              return (
                <div key={row.method} className="rounded-[var(--radius-btn)] border border-border p-3">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Icon className="size-4" />
                    <span className="text-sm">{methodLabel(row.method)}</span>
                  </div>
                  <p className="tnum mt-1 text-lg font-bold text-text">
                    {formatMoney(row.total, locale)}
                  </p>
                  <p className="tnum text-xs text-text-faint">
                    {formatNumber(row.count, locale)} {t.orders}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* By cashier */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-3 font-bold text-text">{t.byCashier}</h2>
          {sales.byCashier.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">{t.noData}</p>
          ) : (
            <ul className="divide-y divide-border">
              {sales.byCashier.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                    {c.name}
                  </span>
                  <span className="tnum text-sm text-text-muted">
                    {formatNumber(c.count, locale)} {t.orders}
                  </span>
                  <span className="tnum w-24 text-end text-sm font-bold text-text">
                    {formatMoney(c.total, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* By driver */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-3 font-bold text-text">{t.byDriver}</h2>
          {sales.byDriver.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">{t.noData}</p>
          ) : (
            <ul className="divide-y divide-border">
              {sales.byDriver.map((d) => (
                <li key={d.driverNumber} className="flex items-center gap-3 py-2">
                  <span className="tnum rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-accent-fg">
                    X-{d.driverNumber}
                  </span>
                  <span className="tnum flex-1 text-sm text-text-muted">
                    {formatNumber(d.count, locale)} {t.orders}
                  </span>
                  <span className="tnum text-sm font-bold text-text">
                    {formatMoney(d.total, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Top items */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 font-bold text-text">{t.topItems}</h2>
        {sales.topItems.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">{t.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-faint">
                  <th className="px-4 py-2 text-start font-semibold">{t.item}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t.quantity}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t.amount}</th>
                </tr>
              </thead>
              <tbody>
                {sales.topItems.map((item) => (
                  <tr key={item.name} className="border-b border-border transition-colors last:border-0 hover:bg-surface-muted/60">
                    <td className="px-4 py-2 font-medium text-text">{item.name}</td>
                    <td className="tnum px-4 py-2 text-end text-text-muted">
                      {formatNumber(item.quantity, locale)}
                    </td>
                    <td className="tnum px-4 py-2 text-end font-bold text-text">
                      {formatMoney(item.total, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
