import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { listProductOptions } from "@/lib/admin/content";
import { getBannerForEdit } from "@/lib/admin/banners";
import { AdminError } from "@/lib/admin/errors";
import { BannerEditor } from "@/components/dashboard/banner-editor";
import { getAdmin } from "../../../data";
import { parseProductId } from "../../product/[id]/data";

export const metadata = { title: "Banner" };

export default async function BannerEditorPage({ params }: PageProps<"/dashboard/content/banners/[id]">) {
  const { id } = await params;
  const bannerId = parseProductId(id);
  const user = await getAdmin();
  const db = getDb();
  let banner;
  try {
    banner = await getBannerForEdit(db, user, bannerId);
  } catch (e) {
    if (e instanceof AdminError) notFound();
    throw e;
  }
  const products = await listProductOptions(db, user);
  return <BannerEditor key={banner.id} banner={banner} products={products} />;
}
