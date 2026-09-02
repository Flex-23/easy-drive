import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";
import { getActiveUsers } from "@/lib/queries/users";
import { SwitchUserView } from "@/components/pos/switch-user-view";

export default async function SwitchUserPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const users = await getActiveUsers();
  return <SwitchUserView users={users} />;
}
