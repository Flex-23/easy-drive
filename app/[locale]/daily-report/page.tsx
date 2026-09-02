import { notFound } from "next/navigation";
import { Banknote, CreditCard, Globe } from "lucide-react";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { requireCashier } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getDailyReport } from "@/lib/queries/orders";
import { formatMoney, formatNumber, formatTime, formatDate } from "@/lib/money";
import { StatusBadge } from "@/components/ui/badges";
import { DatePicker } from "@/components/pos/date-picker";
import type { OrderType, PaymentMethod } from "@prisma/client";

function localDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function DailyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  await requireCashier(locale);

  const dict = getDictionary(locale);
  const sp = await searchParams;
  const today = localDateString(new Date());
  const dateStr = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const report = await getDailyReport(new Date(`${dateStr}T12:00:00`));

  const typeLabel = (t: OrderType) =>
    t === "DINE_IN" ? dict.orderType.dineIn : t === "PICKUP" ? dict.orderType.pickup : dict.orderType.delivery;
  const methodLabel = (m: PaymentMethod | null) =>
    m === "CASH" ? dict.payment.cash : m === "CARD" ? dict.payment.card : m === "ONLINE" ? dict.payment.online : "—";
  const methodIcon = { CASH: Banknote, CARD: CreditCard, ONLINE: Globe } as const;

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-text">{dict.dailyReport.title}</h1>
        <DatePicker value={dateStr} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Closing summary */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 className="mb-3 font-bold text-text">{dict.dailyReport.closingSummary}</h2>
          <p className="mb-3 text-sm text-text-muted">{formatDate(dateStr, locale)}</p>
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
          <div className="grid grid-cols-3 gap-3">
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
                  <th className="px-4 py-2 text-start font-semibold">{dict.dailyReport.status}</th>
                  <th className="px-4 py-2 text-start font-semibold">{dict.payment.method}</th>
                  <th className="px-4 py-2 text-end font-semibold">{dict.dailyReport.amount}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="tnum px-4 py-2 font-semibold text-text">{r.orderNumber}</td>
                    <td className="tnum px-4 py-2 text-text-muted">{formatTime(r.time, locale)}</td>
                    <td className="px-4 py-2 text-text-muted">{typeLabel(r.type)}</td>
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
