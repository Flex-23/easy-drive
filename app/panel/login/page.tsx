import { redirect } from "next/navigation";
import { getPanelSession } from "@/lib/auth/master-session";
import { PanelLoginForm } from "@/components/master/panel-login-form";

export default async function PanelLoginPage() {
  if (await getPanelSession()) redirect("/panel");
  return <PanelLoginForm />;
}
