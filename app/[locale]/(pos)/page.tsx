import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { requireCashier } from "@/lib/session";
import { getMenu } from "@/lib/queries/menu";
import { getHeldOrders } from "@/lib/queries/orders";
import { getSettings } from "@/lib/queries/settings";
import { OrderWorkspace } from "@/components/pos/order-workspace";

export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireCashier(locale);

  const [categories, settings, heldOrders] = await Promise.all([
    getMenu(locale),
    getSettings(),
    getHeldOrders(),
  ]);

  return (
    <OrderWorkspace
      categories={categories}
      taxRate={settings.taxRate}
      deliveryFee={settings.deliveryFee}
      heldOrders={heldOrders}
    />
  );
}
