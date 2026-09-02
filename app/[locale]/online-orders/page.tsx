import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { requireCashier } from "@/lib/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getOnlineOrders } from "@/lib/queries/orders";
import { OnlineOrdersView } from "@/components/pos/online-orders-view";

export default async function OnlineOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  await requireCashier(locale);

  const dict = getDictionary(locale);
  const orders = await getOnlineOrders();

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold text-text">{dict.onlineOrders.title}</h1>
        {orders.length > 0 ? (
          <span className="tnum rounded-full bg-accent-weak px-2.5 py-0.5 text-sm font-semibold text-accent">
            {orders.length} {dict.onlineOrders.pendingCount}
          </span>
        ) : null}
      </div>
      <OnlineOrdersView orders={orders} />
    </div>
  );
}
