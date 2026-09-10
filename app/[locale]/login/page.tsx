import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getPosSession } from "@/lib/auth/pos-session";
import { PosLoginForm } from "@/components/pos/pos-login-form";

export default async function PosLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  // The reverse of the guard: already signed in, so skip the sign-in screen.
  if (await getPosSession()) redirect(`/${raw}`);

  return <PosLoginForm />;
}
