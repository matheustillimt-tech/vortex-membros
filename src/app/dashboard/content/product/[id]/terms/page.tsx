import { TermsForm } from "@/components/dashboard/product-settings-forms";
import { getProductSettingsForPage, parseProductId } from "../data";

export const metadata = { title: "Termo de aceite" };

export default async function TermsSettingsPage({ params }: PageProps<"/dashboard/content/product/[id]/terms">) {
  const product = await getProductSettingsForPage(parseProductId((await params).id));
  return <TermsForm key={product.id} product={product} />;
}
