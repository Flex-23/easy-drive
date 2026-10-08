import { redirect } from "next/navigation";

/** The panel has no overview screen; the catalogue is where work starts. */
export default function PanelIndexPage() {
  redirect("/panel/menu");
}
