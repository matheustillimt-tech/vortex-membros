import { AuthSettingsForm } from "@/components/dashboard/auth-settings-form";
import { getPlatformSettings } from "@/lib/settings";
import { getDb } from "@/db";
import { getAdmin } from "../../../data";

export const metadata = { title: "Autenticação" };

export default async function AuthSettingsPage() {
  await getAdmin();
  const settings = await getPlatformSettings(getDb());
  return <AuthSettingsForm auth={settings.auth} />;
}
