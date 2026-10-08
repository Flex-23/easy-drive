import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { requireCashier } from "@/lib/session";
import { getSettings } from "@/lib/queries/settings";
import { getMasterMenu } from "@/lib/queries/master";
import { SettingsForm } from "@/components/pos/settings-form";
import { PriceList } from "@/components/pos/price-list";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  await requireCashier();

  const dict = getDictionary(locale);
  const [settings, menu] = await Promise.all([getSettings(), getMasterMenu()]);

  return (
    <div className="h-full overflow-y-auto p-5">
      <h1 className="mb-4 text-xl font-bold text-text">{dict.settings.title}</h1>
      <SettingsForm initial={settings} />
      {/* The one piece of the menu the till may change: what things cost. */}
      <div className="mx-auto mt-6 max-w-3xl">
        <PriceList menu={menu} />
      </div>
    </div>
  );
}
