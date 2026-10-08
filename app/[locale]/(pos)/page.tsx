import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { requireCashier } from "@/lib/session";
import { getMenu } from "@/lib/queries/menu";
import { getHeldOrders } from "@/lib/queries/orders";
import { OrderWorkspace } from "@/components/pos/order-workspace";

export default async function NewOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireCashier();

  const [categories, heldOrders] = await Promise.all([getMenu(locale), getHeldOrders()]);

  return (
    <OrderWorkspace
      categories={categories}
      heldOrders={heldOrders}
    />
  );
}
