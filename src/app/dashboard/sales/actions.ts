"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { sales } from "@/db/schema";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import { updatePlatformSettings } from "@/lib/admin/platform-settings";
import { getAppUrl } from "@/lib/auth/app-url";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeErrorSummary } from "@/lib/log";
import { scheduleOutboxFlush } from "@/lib/email/send-now";
import { processSale } from "@/lib/sales/process-sale";
import { getSale, listSales, deleteSale } from "@/lib/sales/sales-store";
import { cleanIgnoredProductIds, IGNORED_PRODUCT_ID_MAX, IGNORED_PRODUCTS_MAX } from "@/lib/settings";
import { BAD_REQUEST, BadRequest, GENERIC_ERROR, int, runAdminAction, type ActionResult } from "../action-utils";
import { countSaleErrors } from "./data";
import { listOptions, parseSalesFilters, toSaleDetail, toSaleRow, type SaleDetail, type SaleRow } from "./rows";

const NOT_FOUND = "Venda não encontrada.";
/** Reprocessar em lote: no máximo isto por clique (o resto fica para o próximo). */
const BATCH_LIMIT = 100;

const revalidateSales = () => revalidatePath("/dashboard/sales");
const run = (fn: Parameters<typeof runAdminAction>[0]) => runAdminAction(fn, revalidateSales);
const appUrl = async () => getAppUrl(await headers());

async function assertSaleExists(id: number) {
  const [row] = await getDb()
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.id, id), isNull(sales.deletedAt)))
    .limit(1);
  if (!row) throw new AdminError(NOT_FOUND);
}

async function reprocessWhere(processing: "queued" | "error") {
  const db = getDb();
  const rows = await db
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.processing, processing), isNull(sales.deletedAt)))
    .orderBy(asc(sales.id))
    .limit(BATCH_LIMIT);
  const url = await appUrl();
  for (const r of rows) await processSale(db, r.id, { appUrl: url });
  if (rows.length) scheduleOutboxFlush();
}

/** "Reprocessar" / "Forçar reprocessamento" de uma venda. Campos: `id`. */
export async function reprocessSaleAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = int(fd, "id");
    await assertSaleExists(id);
    await processSale(getDb(), id, { appUrl: await appUrl() });
    scheduleOutboxFlush();
  });
}

/** Reprocessar › Na Fila. */
export async function reprocessQueueAction(_fd: FormData): Promise<ActionResult> {
  void _fd;
  return run(() => reprocessWhere("queued"));
}

/** Reprocessar › Com erro. */
export async function reprocessErrorsAction(_fd: FormData): Promise<ActionResult> {
  void _fd;
  return run(() => reprocessWhere("error"));
}

/** "Ignorar": a venda passa a "Ignorado" (sem conceder nem remover nada). Campos: `id`. */
export async function ignoreSaleAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = int(fd, "id");
    const done = await getDb()
      .update(sales)
      .set({ processing: "ignored", processedAt: new Date() })
      .where(and(eq(sales.id, id), isNull(sales.deletedAt)))
      .returning({ id: sales.id });
    if (!done.length) throw new AdminError(NOT_FOUND);
  });
}

/** "Excluir": lixeira (recuperável). Campos: `id`. */
export async function deleteSaleAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const id = int(fd, "id");
    await assertSaleExists(id);
    await deleteSale(getDb(), actor, id);
  });
}

/** "Lista de produtos ignorados". Campos: `ids` (repetido, um por ID de produto do gateway). */
export async function saveIgnoredProductsAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const raw = fd.getAll("ids");
    if (raw.length > IGNORED_PRODUCTS_MAX) throw new BadRequest(BAD_REQUEST);
    for (const v of raw) if (typeof v !== "string" || v.trim().length > IGNORED_PRODUCT_ID_MAX) throw new BadRequest(BAD_REQUEST);
    const ignoredProductIds = cleanIgnoredProductIds(raw);
    await updatePlatformSettings(getDb(), actor, { kiwify: { ignoredProductIds } });
  });
}

/* ---------- leitura (a lista e a gaveta) ---------- */

type Read<T> = ({ ok: true } & T) | { ok: false; error: string };

async function read<T>(fn: () => Promise<T>): Promise<Read<T>> {
  try {
    assertAdmin(await getCurrentUser());
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, error: e.message };
    console.error("[dashboard] leitura de vendas falhou:", safeErrorSummary(e));
    return { ok: false, error: GENERIC_ERROR };
  }
}

export type SalesListResult = Read<{ rows: SaleRow[]; nextCursor: number | null; limitReached: boolean; errorCount: number }>;

/**
 * Página da lista. Campos: filtros (`view`, `gateways`, `field`, `q`), `cursor` (id da última linha) e
 * `loaded` (quantas já estão na tela). Sem cursor e com `upTo`, recarrega as `upTo` primeiras linhas.
 */
export async function listSalesAction(fd: FormData): Promise<SalesListResult> {
  return read(async () => {
    const user = await getCurrentUser();
    const filters = parseSalesFilters(
      (k) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : null),
      (k) => fd.getAll(k).filter((v): v is string => typeof v === "string"),
    );
    const cursor = fd.get("cursor") ? int(fd, "cursor") : undefined;
    let loaded = fd.get("loaded") ? int(fd, "loaded") : 0;
    const upTo = !cursor && fd.get("upTo") ? Math.min(int(fd, "upTo"), 200) : 0;
    const db = getDb();
    const rows: SaleRow[] = [];
    let page = await listSales(db, user, { ...listOptions(filters), cursor, loaded });
    rows.push(...page.rows.map(toSaleRow));
    // Recarregar o que já estava na tela (depois de uma ação): segue as páginas até `upTo`.
    while (upTo && rows.length < upTo && page.nextCursor !== null) {
      loaded = rows.length;
      page = await listSales(db, user, { ...listOptions(filters), cursor: page.nextCursor, loaded });
      rows.push(...page.rows.map(toSaleRow));
    }
    return { rows, nextCursor: page.nextCursor, limitReached: page.limitReached, errorCount: await countSaleErrors(db) };
  });
}

/** Gaveta "Detalhes da Venda". Campos: `id`. */
export async function getSaleAction(fd: FormData): Promise<Read<{ sale: SaleDetail }>> {
  return read(async () => {
    const id = int(fd, "id");
    const sale = await getSale(getDb(), await getCurrentUser(), id);
    if (!sale) throw new AdminError(NOT_FOUND);
    return { sale: toSaleDetail(sale) };
  });
}
