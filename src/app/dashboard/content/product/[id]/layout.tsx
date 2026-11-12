import { NomeNoCaminho } from "@/components/dashboard/painel-raiz";
import { ProductTabs } from "@/components/dashboard/product-tabs";
import { getProductScheduleForPage, getProductTreeForPage, parseProductId } from "./data";

export default async function ProductLayout({ children, params }: LayoutProps<"/dashboard/content/product/[id]">) {
  const id = parseProductId((await params).id);
  const [{ product }, { schedule }] = await Promise.all([getProductTreeForPage(id), getProductScheduleForPage(id)]);
  return (
    <div>
      <NomeNoCaminho href={`/dashboard/content/product/${product.id}`} nome={product.name} />
      <ProductTabs product={product} hasSchedule={schedule !== null} />
      {children}
    </div>
  );
}
