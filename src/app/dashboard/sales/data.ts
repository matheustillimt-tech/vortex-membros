import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { sales } from "@/db/schema";

/** Contador da aba "Com erro" (fora da lixeira). Só para quem já passou pela checagem de admin. */
export async function countSaleErrors(db: Database): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(sales)
    .where(and(eq(sales.processing, "error"), isNull(sales.deletedAt)));
  return row?.n ?? 0;
}

/** Opções do chip Gateway: só os gateways que já tiveram venda. */
export async function listSaleGateways(db: Database): Promise<string[]> {
  const rows = await db.selectDistinct({ gateway: sales.gateway }).from(sales).where(isNull(sales.deletedAt));
  return rows.map((r) => r.gateway).sort();
}
