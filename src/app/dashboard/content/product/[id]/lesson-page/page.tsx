import { getDb } from "@/db";
import { listProductOptions } from "@/lib/admin/content";
import { LessonPageForm } from "@/components/dashboard/product-settings-forms";
import { getAdmin } from "../../../../data";
import { getProductSettingsForPage, parseProductId } from "../data";

export const metadata = { title: "Página da aula" };

export default async function LessonPageSettingsPage({ params }: PageProps<"/dashboard/content/product/[id]/lesson-page">) {
  const id = parseProductId((await params).id);
  const [product, user] = await Promise.all([getProductSettingsForPage(id), getAdmin()]);
  const products = await listProductOptions(getDb(), user);
  return <LessonPageForm key={product.id} product={product} products={products} />;
}
