import { requirePanel } from "@/lib/auth/master-session";
import { getMasterMenu } from "@/lib/queries/master";
import { MenuManager } from "@/components/master/menu-manager";

export default async function PanelMenuPage() {
  await requirePanel();
  const menu = await getMasterMenu();
  return <MenuManager menu={menu} />;
}
