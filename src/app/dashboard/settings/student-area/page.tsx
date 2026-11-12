import { StudentAreaSettings } from "@/components/dashboard/appearance-forms";
import { getAdmin, getDashboardSettings } from "../../data";

export const metadata = { title: "Área do aluno" };

export default async function StudentAreaSettingsPage() {
  await getAdmin();
  return <StudentAreaSettings settings={await getDashboardSettings()} />;
}
