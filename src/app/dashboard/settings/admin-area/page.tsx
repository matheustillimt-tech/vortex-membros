import { AdminAreaForm } from "@/components/dashboard/appearance-forms";
import { getAdmin, getDashboardSettings } from "../../data";

export const metadata = { title: "Painel administrativo" };

export default async function AdminAreaPage() {
  await getAdmin();
  return <AdminAreaForm settings={await getDashboardSettings()} />;
}
