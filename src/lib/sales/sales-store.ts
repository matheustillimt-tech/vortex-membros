import { createHash } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import { sales, type Sale } from "@/db/schema";
import { assertAdmin } from "@/lib/admin/guard";
import type { User } from "@/lib/auth/sessions";
import { parseKiwify } from "./kiwify";

/** Vendas: o log dos webhooks dos gateways (Vendas no painel). */

export type Gateway = "kiwify";
export const SALES_PAGE_SIZE = 20;
export const SALES_LIST_LIMIT = 200;

/**
 * Chave de idempotência: gateway + pedido + evento (+ cobranças concluídas da assinatura, para cada
 * renovação contar como um evento novo). Sem `order_id`, o hash do corpo cru.
 */
export function saleDedupeKey(gateway: Gateway, parsed: ReturnType<typeof parseKiwify>, rawBody: string): string {
  if (!parsed.orderId) return `${gateway}:sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
  const parts = [gateway, parsed.orderId, parsed.event ?? "-"];
  if (parsed.chargesCompleted !== null) parts.push(String(parsed.chargesCompleted));
  return parts.join(":");
}

/**
 * Grava o evento cru antes de qualquer processamento. O mesmo evento recebido de novo não cria
 * outra linha (`duplicate: true`, com o id da linha que já existe).
 */
export async function recordSale(
  db: Database,
  gateway: Gateway,
  payload: unknown,
  rawBody: string,
): Promise<{ id: number; duplicate: boolean }> {
  const p = parseKiwify(payload);
  const key = saleDedupeKey(gateway, p, rawBody);
  const [row] = await db
    .insert(sales)
    .values({
      gateway,
      orderId: p.orderId,
      event: p.event,
      status: p.status,
      payload: payload ?? {},
      customerEmail: p.customer.email,
      customerName: p.customer.name,
      customerDocument: p.customer.document,
      productIds: p.productIds,
      checkoutLink: p.checkoutLink,
      planId: p.planId,
      subscriptionId: p.subscriptionId,
      amountCents: p.amountCents,
      paymentMethod: p.paymentMethod,
      dedupeKey: key,
    })
    .onConflictDoNothing({ target: sales.dedupeKey })
    .returning({ id: sales.id });
  if (row) return { id: row.id, duplicate: false };
  const [existing] = await db.select({ id: sales.id }).from(sales).where(eq(sales.dedupeKey, key)).limit(1);
  return { id: existing.id, duplicate: true };
}

export type SalesView = "latest" | "queued" | "error";
export type SalesSearchField = "email" | "name" | "document" | "order" | "subscription";
export type ListSalesOptions = {
  view: SalesView;
  gateways?: string[];
  search?: { field: SalesSearchField; q: string };
  /** Id da última linha já carregada (as próximas são as mais antigas que ela). */
  cursor?: number;
  /** Quantas linhas já foram carregadas (para parar em 200). */
  loaded?: number;
};
export type SalesPage = { rows: Sale[]; nextCursor: number | null; limitReached: boolean };

const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function searchFilter(search: ListSalesOptions["search"]): SQL | undefined {
  const q = search?.q.trim().slice(0, 200);
  if (!search || !q) return undefined;
  switch (search.field) {
    case "email":
      return ilike(sales.customerEmail, likePattern(q));
    case "name":
      return ilike(sales.customerName, likePattern(q));
    case "document": {
      const digits = q.replace(/\D/g, "");
      return digits ? ilike(sales.customerDocument, likePattern(digits)) : sql`false`;
    }
    case "order":
      return eq(sales.orderId, q);
    case "subscription":
      return eq(sales.subscriptionId, q);
  }
}

/** 20 por página, mais recentes primeiro, até 200 no total; a lixeira não aparece. */
export async function listSales(db: Database, actor: User | null, opts: ListSalesOptions): Promise<SalesPage> {
  assertAdmin(actor);
  const loaded = Math.max(0, Math.floor(opts.loaded ?? 0));
  const room = Math.min(SALES_PAGE_SIZE, SALES_LIST_LIMIT - loaded);
  if (room <= 0) return { rows: [], nextCursor: null, limitReached: true };
  const where = and(
    isNull(sales.deletedAt),
    opts.view === "queued" ? eq(sales.processing, "queued") : opts.view === "error" ? eq(sales.processing, "error") : undefined,
    opts.gateways?.length ? inArray(sales.gateway, opts.gateways) : undefined,
    searchFilter(opts.search),
    opts.cursor !== undefined ? lt(sales.id, opts.cursor) : undefined,
  );
  // Uma linha a mais diz se há próxima página.
  const rows = await db.select().from(sales).where(where).orderBy(desc(sales.id)).limit(room + 1);
  const more = rows.length > room;
  const page = rows.slice(0, room);
  const atLimit = loaded + page.length >= SALES_LIST_LIMIT;
  return {
    rows: page,
    nextCursor: more && !atLimit ? page[page.length - 1].id : null,
    limitReached: more && atLimit,
  };
}

export async function getSale(db: Database, actor: User | null, id: number): Promise<Sale | null> {
  assertAdmin(actor);
  const [row] = await db.select().from(sales).where(and(eq(sales.id, id), isNull(sales.deletedAt))).limit(1);
  return row ?? null;
}

/** Move para a lixeira (recuperável). */
export async function deleteSale(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  await db.update(sales).set({ deletedAt: new Date() }).where(and(eq(sales.id, id), isNull(sales.deletedAt)));
}
