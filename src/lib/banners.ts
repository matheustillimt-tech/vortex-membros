import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { banners, products } from "@/db/schema";
import { safeImageUrl } from "@/lib/theme";

export type Banner = typeof banners.$inferSelect;

/**
 * Banner da home: o primeiro publicado e não excluído, pela posição, que tenha imagem (desktop ou
 * celular; o celular cai na de desktop). Se a ação aponta para um produto excluído ou oculto, o banner
 * aparece sem link.
 */
export async function getHomeBanner(db: Database): Promise<Banner | null> {
  const rows = await db
    .select()
    .from(banners)
    .where(and(eq(banners.status, "published"), isNull(banners.deletedAt)))
    .orderBy(asc(banners.position), asc(banners.id));
  const row = rows.find((b) => safeImageUrl(b.config.desktopImageUrl) || safeImageUrl(b.config.mobileImageUrl));
  if (!row) return null;
  const action = row.config.action;
  if (action?.type === "product") {
    const id = action.productId;
    const [p] = Number.isSafeInteger(id)
      ? await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, id!), isNull(products.deletedAt), eq(products.status, "published")))
      : [];
    if (!p) return { ...row, config: { ...row.config, action: { type: "none" } } };
  }
  return row;
}
