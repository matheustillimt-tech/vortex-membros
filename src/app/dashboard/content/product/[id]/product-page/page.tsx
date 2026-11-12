import { ProductPageForm } from "@/components/dashboard/product-settings-forms";
import { getProductSettingsForPage, parseProductId } from "../data";

export const metadata = { title: "Página do produto" };

export default async function ProductPageSettingsPage({ params }: PageProps<"/dashboard/content/product/[id]/product-page">) {
  const product = await getProductSettingsForPage(parseProductId((await params).id));
  return <ProductPageForm key={product.id} product={product} />;
}
