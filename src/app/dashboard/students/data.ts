import { asc, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { deliveries, products, showcases, tags } from "@/db/schema";
import type { FilterKind } from "./rows";

/** Opções dos chips Produtos, Vitrine, Entrega e Tags (carregadas quando o dropdown abre). Só depois da checagem de admin. */
export async function filterOptions(db: Database, kind: FilterKind): Promise<{ value: string; label: string }[]> {
  switch (kind) {
    case "products": {
      const rows = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .innerJoin(showcases, sql`${showcases.id} = ${products.showcaseId}`)
        .where(isNull(products.deletedAt))
        .orderBy(asc(showcases.position), asc(showcases.id), asc(products.position), asc(products.id));
      return rows.map((r) => ({ value: String(r.id), label: r.name }));
    }
    case "showcases": {
      const rows = await db.select({ id: showcases.id, name: showcases.name }).from(showcases).where(isNull(showcases.deletedAt)).orderBy(asc(sql`lower(${showcases.name})`));
      return rows.map((r) => ({ value: String(r.id), label: r.name }));
    }
    case "deliveries": {
      const rows = await db.select({ id: deliveries.id, name: deliveries.name }).from(deliveries).orderBy(asc(sql`lower(${deliveries.name})`), asc(deliveries.id));
      return rows.map((r) => ({ value: String(r.id), label: r.name }));
    }
    case "tags": {
      const rows = await db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(asc(sql`lower(${tags.name})`), asc(tags.id));
      return rows.map((r) => ({ value: String(r.id), label: r.name }));
    }
  }
}
