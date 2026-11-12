import { ProductSchedule } from "@/components/dashboard/product-schedule";
import { getProductScheduleForPage, getProductTreeForPage, parseProductId } from "../data";

export const metadata = { title: "Conteúdo programado" };

export default async function ProductSchedulePage({ params }: PageProps<"/dashboard/content/product/[id]/schedule">) {
  const id = parseProductId((await params).id);
  const [tree, { schedule, rules }] = await Promise.all([getProductTreeForPage(id), getProductScheduleForPage(id)]);
  return <ProductSchedule productId={id} schedule={schedule} modules={tree.modules} rules={rules} />;
}
