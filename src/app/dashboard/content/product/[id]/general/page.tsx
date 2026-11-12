import { GeneralForm } from "@/components/dashboard/product-settings-forms";
import { getProductSettingsForPage, parseProductId } from "../data";

export const metadata = { title: "Geral" };

export default async function GeneralSettingsPage({ params }: PageProps<"/dashboard/content/product/[id]/general">) {
  const product = await getProductSettingsForPage(parseProductId((await params).id));
  return <GeneralForm key={product.id} product={product} />;
}
