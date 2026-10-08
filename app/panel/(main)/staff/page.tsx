import { requirePanel } from "@/lib/auth/master-session";
import { getStaffList } from "@/lib/queries/master";
import { StaffManager } from "@/components/master/staff-manager";

export default async function PanelStaffPage() {
  await requirePanel();
  const staff = await getStaffList();
  return <StaffManager staff={staff} />;
}
