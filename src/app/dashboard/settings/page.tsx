import { SettingsIndex } from "@/components/dashboard/appearance-forms";
import { getAdmin } from "../data";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await getAdmin();
  return <SettingsIndex />;
}
