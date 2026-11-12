import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { fullAccess, productAccess, products } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";

/** Marcador do acesso completo na consulta única (ids de produto são sempre positivos). */
const FULL_ACCESS_MARKER = -1;

/**
 * Ids dos produtos com acesso ativo do aluno. Uma consulta só (acessos por produto + um marcador de
 * "acesso completo"); com acesso completo ativo, uma consulta a mais lê todos os produtos não excluídos
 * (inclusive os criados depois da venda).
 */
export async function getActiveAccessProductIds(db: Database, userId: number, now: Date = new Date()): Promise<Set<number>> {
  const perProduct = db
    .select({ productId: productAccess.productId })
    .from(productAccess)
    .where(
      and(
        eq(productAccess.userId, userId),
        lte(productAccess.startsAt, now),
        isNull(productAccess.revokedAt),
        or(isNull(productAccess.expiresAt), gt(productAccess.expiresAt, now)),
      ),
    );
  const full = db
    .select({ productId: sql<number>`${FULL_ACCESS_MARKER}::bigint`.mapWith(Number).as("product_id") })
    .from(fullAccess)
    .where(
      and(
        eq(fullAccess.userId, userId),
        lte(fullAccess.startsAt, now),
        isNull(fullAccess.revokedAt),
        or(isNull(fullAccess.expiresAt), gt(fullAccess.expiresAt, now)),
      ),
    );
  const rows = await perProduct.unionAll(full);
  const ids = new Set(rows.map((r) => Number(r.productId)));
  if (!ids.delete(FULL_ACCESS_MARKER)) return ids;
  const all = await db.select({ id: products.id }).from(products).where(isNull(products.deletedAt));
  for (const p of all) ids.add(p.id);
  return ids;
}

export async function hasActiveAccess(db: Database, user: User, productId: number, now: Date = new Date()): Promise<boolean> {
  if (user.role === "admin") return true;
  const [product] = await db
    .select({ isFree: products.isFree })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)));
  if (product?.isFree) return true;
  return (await getActiveAccessProductIds(db, user.id, now)).has(productId);
}

/** Igual a hasActiveAccess, para quem já leu o produto (sem reler `is_free`): no máximo uma consulta. */
export async function hasActiveAccessToProduct(
  db: Database,
  user: User,
  product: { id: number; isFree: boolean },
  now: Date = new Date(),
): Promise<boolean> {
  if (user.role === "admin" || product.isFree) return true;
  return (await getActiveAccessProductIds(db, user.id, now)).has(product.id);
}
