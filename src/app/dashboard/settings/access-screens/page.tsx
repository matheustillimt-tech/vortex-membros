import { AccessScreensForm } from "@/components/dashboard/appearance-forms";
import { getAdmin, getDashboardSettings } from "../../data";

export const metadata = { title: "Telas de acesso" };

export default async function AccessScreensPage() {
  await getAdmin();
  return <AccessScreensForm settings={await getDashboardSettings()} />;
}
