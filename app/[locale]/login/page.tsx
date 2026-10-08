import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

/**
 * Login is disabled on the till. The path is kept only so old links and the
 * browser's saved URL still resolve — straight into the New Order screen.
 */
export default async function PosLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  redirect(`/${raw}`);
}
