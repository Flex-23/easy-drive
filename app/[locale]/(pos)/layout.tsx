import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getSettings } from "@/lib/queries/settings";
import { requireCashier } from "@/lib/session";
import { PosHeader } from "@/components/pos/pos-header";
import pkg from "@/package.json";

/**
 * The till itself. Everything under here needs a signed-in **cashier**; an
 * admin session from the Master panel grants nothing on this side.
 */
export default async function PosLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();

  const cashier = await requireCashier();
  const settings = await getSettings();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PosHeader
        restaurantName={settings.restaurantName}
        cashierName={cashier.name}
        version={pkg.version}
      />
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
