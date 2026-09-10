import { notFound } from "next/navigation";
import {
  Banknote,
  Globe,
  CircleDollarSign,
  ReceiptText,
  TrendingUp,
  Bike,
  XCircle,
} from "lucide-react";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { requireCashier } from "@/lib/session";
import { getDailyReport } from "@/lib/queries/orders";
import { formatMoney, formatNumber, formatTime, formatDate } from "@/lib/money";
import { StatusBadge } from "@/components/ui/badges";
import { PrintButton } from "@/components/pos/print-button";
import type { OrderType, PaymentMethod } from "@prisma/client";

export default async function DailyReportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  await requireCashier();

  const dict = getDictionary(locale);
  const report = await getDailyReport();

  const typeLabel = (t: OrderType) =>
    t === "DINE_IN" ? dict.orderType.dineIn : t === "PICKUP" ? dict.orderType.pickup : dict.orderType.delivery;
  const methodLabel = (m: PaymentMethod | null) =>
    m === "CASH" ? dict.payment.cash : m === null ? "—" : dict.payment.online;
  const methodIcon = { CASH: Banknote, ONLINE: Globe } as const;

  const maxHour = Math.max(1, ...report.revenueByHour.map((h) => h.revenue));

  const tiles = [
    { label: dict.dailyReport.revenueToday, value: formatMoney(report.totalRevenue, locale), icon: CircleDollarSign },
    { label: dict.dailyReport.orderCount, value: formatNumber(report.totalOrders, locale), icon: ReceiptText },
    { label: dict.dailyReport.averageTicket, value: formatMoney(report.averageTicket, locale), icon: TrendingUp },
    { label: dict.dailyReport.activeDeliveries, value: formatNumber(report.activeDeliveries, locale), icon: Bike },
  ];

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">{dict.dailyReport.title}</h1>
          <p className="tnum text-sm text-text-muted">{formatDate(report.date, locale)}</p>
        </div>
        <PrintButton />
      </div>

      {/* KPI tiles */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="card-lift rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]"
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

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Closing summary */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-3 font-bold text-text">{dict.dailyReport.closingSummary}</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">{dict.dailyReport.totalOrders}</dt>
              <dd className="tnum font-bold text-text">{formatNumber(report.totalOrders, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">{dict.dailyReport.averageTicket}</dt>
              <dd className="tnum font-bold text-text">{formatMoney(report.averageTicket, locale)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="font-bold text-text">{dict.dailyReport.totalRevenue}</dt>
              <dd className="tnum text-lg font-extrabold text-text">{formatMoney(report.totalRevenue, locale)}</dd>
            </div>
          </dl>
        </section>

        {/* Payment breakdown */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="mb-3 font-bold text-text">{dict.dailyReport.paymentBreakdown}</h2>
          <div className="grid grid-cols-2 gap-3">
            {report.byMethod.map((m) => {
              const Icon = methodIcon[m.method];
              return (
                <div key={m.method} className="rounded-[var(--radius-btn)] border border-border p-3">
                  <div className="flex items-center gap-2 text-text-muted">
                    <Icon className="size-4" />
                    <span className="text-sm">{methodLabel(m.method)}</span>
                  </div>
                  <p className="tnum mt-2 text-lg font-bold text-text">{formatMoney(m.total, locale)}</p>
                  <p className="tnum text-xs text-text-faint">
                    {formatNumber(m.count, locale)} {dict.dailyReport.orders}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Delivery / driver breakdown — the basis of the printed sheet */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-bold text-text">{dict.dailyReport.deliveryBreakdown}</h2>
            <span className="tnum text-sm text-text-muted">
              {formatNumber(report.delivery.count, locale)} {dict.dailyReport.orders} ·{" "}
              <span className="font-bold text-text">{formatMoney(report.delivery.total, locale)}</span>
            </span>
          </div>

          {report.byDriver.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">{dict.dailyReport.noDeliveries}</p>
          ) : (
            <ul className="divide-y divide-border">
              {report.byDriver.map((d) => (
                <li key={d.driverNumber} className="flex items-center gap-3 py-2">
                  <span className="tnum rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-accent-fg">
                    X-{d.driverNumber}
                  </span>
                  <span className="tnum flex-1 text-sm text-text-muted">
                    {formatNumber(d.count, locale)} {dict.dailyReport.orders}
                  </span>
                  <span className="tnum text-sm font-bold text-text">{formatMoney(d.total, locale)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div className="rounded-[var(--radius-btn)] border border-border p-3">
              <div className="flex items-center gap-2 text-text-muted">
                <Globe className="size-4" />
                <span className="text-sm">{dict.dailyReport.paidOnlineOrders}</span>
              </div>
              <p className="tnum mt-1 text-lg font-bold text-text">{formatMoney(report.paidOnline.total, locale)}</p>
              <p className="tnum text-xs text-text-faint">
                {formatNumber(report.paidOnline.count, locale)} {dict.dailyReport.orders}
              </p>
            </div>
            <div className="rounded-[var(--radius-btn)] border border-border p-3">
              <div className="flex items-center gap-2 text-text-muted">
                <XCircle className="size-4" />
                <span className="text-sm">{dict.dailyReport.cancelledOrders}</span>
              </div>
              <p className="tnum mt-1 text-lg font-bold text-danger">{formatMoney(report.cancelled.total, locale)}</p>
              <p className="tnum text-xs text-text-faint">
                {formatNumber(report.cancelled.count, locale)} {dict.dailyReport.orders}
              </p>
            </div>
          </div>
        </section>

        {/* Revenue by hour */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-4 font-bold text-text">{dict.dailyReport.revenueByHour}</h2>
          <div className="flex h-52 items-end gap-1.5">
            {report.revenueByHour.map((h) => (
              <div key={h.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-accent/80 transition-all"
                    style={{ height: `${Math.max(2, (h.revenue / maxHour) * 100)}%` }}
                    title={formatMoney(h.revenue, locale)}
                  />
                </div>
                <span className="tnum text-[10px] text-text-faint">{h.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Orders table */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 font-bold text-text">{dict.dailyReport.orders}</h2>
        {report.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">{dict.dailyReport.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs text-text-faint">
                  <th className="px-4 py-2 text-start font-semibold">{dict.dailyReport.orderNumber}</th>
                  <th className="px-4 py-2 text-start font-semibold">{dict.dailyReport.time}</th>
                  <th className="px-4 py-2 text-start font-semibold">{dict.dailyReport.type}</th>
                  <th className="px-4 py-2 text-start font-semibold">{dict.dailyReport.driver}</th>
                  <th className="px-4 py-2 text-start font-semibold">{dict.dailyReport.status}</th>
                  <th className="px-4 py-2 text-start font-semibold">{dict.payment.method}</th>
                  <th className="px-4 py-2 text-end font-semibold">{dict.dailyReport.amount}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-muted/60">
                    <td className="tnum px-4 py-2 font-semibold text-text">{r.orderNumber}</td>
                    <td className="tnum px-4 py-2 text-text-muted">{formatTime(r.time, locale)}</td>
                    <td className="px-4 py-2 text-text-muted">{typeLabel(r.type)}</td>
                    <td className="tnum px-4 py-2 text-text-muted">
                      {r.driverNumber !== null ? `X-${r.driverNumber}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} label={dict.status[r.status]} />
                    </td>
                    <td className="px-4 py-2 text-text-muted">{methodLabel(r.paymentMethod)}</td>
                    <td className="tnum px-4 py-2 text-end font-bold text-text">{formatMoney(r.total, locale)}</td>
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
