import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getCurrentCashier } from "@/lib/session";
import { PosLoginForm } from "@/components/pos/pos-login-form";

export default async function PosLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  if (await getCurrentCashier()) redirect(`/${raw}`);

  return <PosLoginForm />;
}
