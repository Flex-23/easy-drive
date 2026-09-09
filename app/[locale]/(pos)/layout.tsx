import { notFound, redirect } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getSettings } from "@/lib/queries/settings";
import { getCurrentCashier } from "@/lib/session";
import { IconRail } from "@/components/pos/icon-rail";
import { TopBar } from "@/components/pos/top-bar";
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
  const locale: Locale = raw;

  const cashier = await getCurrentCashier();
  if (!cashier) redirect(`/${locale}/login`);

  const settings = await getSettings();

  return (
    <>
      <IconRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          restaurantName={settings.restaurantName}
          cashierName={cashier.name}
          version={pkg.version}
        />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </>
  );
}
