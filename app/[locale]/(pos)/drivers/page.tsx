import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { requireCashier } from "@/lib/session";
import { getDriverBoard } from "@/lib/queries/drivers";
import { DriverBoard } from "@/components/pos/driver-board";

export default async function DriversPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  await requireCashier(locale);

  const dict = getDictionary(locale);
  const board = await getDriverBoard();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-4 pt-3">
        <h1 className="text-xl font-bold text-text">{dict.drivers.title}</h1>
      </div>
      <div className="min-h-0 flex-1">
        <DriverBoard board={board} />
      </div>
    </div>
  );
}
