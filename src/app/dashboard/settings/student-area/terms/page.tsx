import { FirstAccessTermsForm } from "@/components/dashboard/appearance-forms";
import { getAdmin, getDashboardSettings } from "../../../data";

export const metadata = { title: "Termo de aceite no primeiro acesso" };

export default async function FirstAccessTermsPage() {
  await getAdmin();
  const { firstAccessTerms } = await getDashboardSettings();
  return <FirstAccessTermsForm enabled={firstAccessTerms.enabled} html={firstAccessTerms.html ?? ""} />;
}
