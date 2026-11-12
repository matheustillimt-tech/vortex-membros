import { SharingSettings } from "@/components/dashboard/appearance-forms";
import { getAdmin, getDashboardSettings } from "../../data";

export const metadata = { title: "Compartilhamento" };

export default async function SharingSettingsPage() {
  await getAdmin();
  return <SharingSettings settings={await getDashboardSettings()} />;
}
