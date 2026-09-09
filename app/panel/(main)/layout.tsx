import { redirect } from "next/navigation";
import { getPanelSession } from "@/lib/auth/master-session";
import { PanelHeader } from "@/components/master/panel-header";

/** Everything under this layout requires a signed-in admin. */
export default async function PanelMainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPanelSession();
  if (!session) redirect("/panel/login");

  return (
    <>
      <PanelHeader adminName={session.name} />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </>
  );
}
