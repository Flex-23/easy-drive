import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { requireCashier } from "@/lib/session";
import { About } from "@/components/pos/about";
import pkg from "@/package.json";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireCashier();

  return (
    <div className="h-full overflow-y-auto p-5">
      <About version={pkg.version} />
    </div>
  );
}
