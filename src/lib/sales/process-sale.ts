import { and, asc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { deliveries, deliveryItems, deliveryTags, products, sales, users, type Sale } from "@/db/schema";
import { initialPasswordFor } from "@/lib/auth/initial-password";
import { hashPassword } from "@/lib/auth/password";
import type { User } from "@/lib/auth/sessions";
import { generateLoginToken } from "@/lib/auth/tokens";
import { enqueueEmail } from "@/lib/email/outbox";
import { safeErrorSummary } from "@/lib/log";
import { getPlatformSettings, type PlatformSettings } from "@/lib/settings";
import { findDeliveryForSale } from "./deliveries";
import { grantDeliveryItems, revokeLegacyDeliveryAccess, revokeSaleAccess } from "./grant";
import { parseKiwify } from "./kiwify";
import { applyTags } from "./tags";

/**
 * Processamento de uma venda gravada (sales-store.recordSale): roda logo depois da resposta ao
 * gateway (after), no "Reprocessar" do painel e no cron (fila parada há mais de 5 min). Tudo numa
 * transação, com a linha da venda travada; repetir não duplica nada. Erro vira "Com erro" com a
 * mensagem, nunca uma exceção para quem chamou.
 */

export type ProcessResult = "processed" | "error" | "ignored";
export const LEGACY_SALE_NOTICE = "Venda anterior à plataforma: conferir";
export const REFUNDED_SALE_NOTICE = "Venda reembolsada: acesso não liberado";
export const STALE_QUEUE_MS = 5 * 60_000;
const UNEXPECTED_ERROR = "Erro inesperado ao processar a venda. Tente reprocessar.";

/** Erro com mensagem para o produtor (aparece na venda "Com erro"). */
export class SaleError extends Error {
  override name = "SaleError";
}

type Outcome = { result: ProcessResult; userId?: number | null; deliveryId?: number | null; notice?: string | null };
type Ctx = { now: Date; appUrl: string; settings: PlatformSettings };

/** Texto do erro: os identificadores que ela tenta casar (link de checkout ou plano, e o produto). */
function noDeliveryMessage(sale: Sale): string {
  const ids = [sale.checkoutLink ?? sale.planId, sale.productIds[0]].filter((v): v is string => !!v);
  return `Erro ao construir carga: Não existe nenhuma entrega configurada para o ID: ${ids.join(", ")}`;
}

const saleRefOf = (sale: Sale) => {
  const ref = sale.subscriptionId ?? sale.orderId;
  if (!ref) throw new SaleError("Venda sem o ID do pedido.");
  return ref;
};

/**
 * Serializa aprovação e reembolso do mesmo pedido (ou assinatura): sem isso, em READ COMMITTED um
 * reembolso concorrente não veria os acessos que a aprovação ainda não confirmou.
 */
async function lockSaleRef(tx: Database, saleRef: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sale-ref:${saleRef}`}, 0))`);
}

/** Outras linhas (não excluídas) do mesmo pedido com um destes status e processamentos. */
async function otherEventOfOrder(
  tx: Database,
  sale: Sale,
  statuses: Sale["status"][],
  processing: Sale["processing"][] = ["queued", "processed", "error"],
): Promise<boolean> {
  if (!sale.orderId) return false;
  const [row] = await tx
    .select({ id: sales.id })
    .from(sales)
    .where(
      and(
        eq(sales.orderId, sale.orderId),
        ne(sales.id, sale.id),
        isNull(sales.deletedAt),
        inArray(sales.status, statuses),
        inArray(sales.processing, processing),
      ),
    )
    .limit(1);
  return !!row;
}

/** Serializa vendas do mesmo cliente (duas vendas juntas não criam o aluno duas vezes). */
async function lockCustomer(tx: Database, sale: Sale): Promise<void> {
  const keys = [sale.customerDocument && `doc:${sale.customerDocument}`, sale.customerEmail && `email:${sale.customerEmail}`]
    .filter((k): k is string => !!k)
    .sort();
  for (const k of keys) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sale-customer:${k}`}, 0))`);
}

/** Aluno da venda: CPF/CNPJ (só dígitos) e, se não achar, e-mail normalizado. */
async function findStudent(tx: Database, sale: Sale): Promise<User | null> {
  if (sale.customerDocument) {
    const [byDoc] = await tx
      .select()
      .from(users)
      .where(and(isNull(users.deletedAt), sql`regexp_replace(coalesce(${users.document}, ''), '\\D', '', 'g') = ${sale.customerDocument}`))
      .orderBy(asc(users.id))
      .limit(1);
    if (byDoc) return byDoc;
  }
  if (sale.customerEmail) {
    const [byEmail] = await tx.select().from(users).where(eq(users.email, sale.customerEmail)).limit(1);
    if (byEmail?.deletedAt) throw new SaleError("O e-mail do cliente pertence a um aluno excluído. Restaure o cadastro e reprocesse.");
    if (byEmail) return byEmail;
  }
  return null;
}

/** Encontra ou cria o aluno. Aluno existente não tem nome nem e-mail alterados (regra fixa). */
async function findOrCreateStudent(tx: Database, sale: Sale, ctx: Ctx): Promise<{ user: User; password: string | null }> {
  if (!sale.customerEmail && !sale.customerDocument) {
    throw new SaleError("Venda sem e-mail e sem CPF/CNPJ do cliente: não foi possível identificar o aluno.");
  }
  const found = await findStudent(tx, sale);
  if (found) return { user: found, password: null };
  const email = sale.customerEmail;
  if (!email) throw new SaleError("Venda sem e-mail do cliente: não foi possível criar o aluno.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SaleError("E-mail do cliente inválido.");
  const password = initialPasswordFor({ email, document: sale.customerDocument }, ctx.settings);
  const phone = parseKiwify(sale.payload).phone;
  const [user] = await tx
    .insert(users)
    .values({
      email,
      name: sale.customerName ?? email.split("@")[0],
      document: sale.customerDocument,
      phone,
      role: "student",
      passwordHash: await hashPassword(password),
      loginToken: generateLoginToken(),
    })
    .returning();
  return { user, password };
}

async function sendAccessEmail(
  tx: Database,
  sale: Sale,
  ctx: Ctx,
  input: { user: User; password: string | null; productIds: number[]; full: boolean },
): Promise<void> {
  const { user, password } = input;
  const base = ctx.appUrl.replace(/\/+$/, "");
  // Admin não entra por link automático: o link dele vai para a tela de login.
  const linkAcesso = user.role === "admin" ? `${base}/auth/login` : `${base}/auth/login?login_token=${encodeURIComponent(user.loginToken)}`;
  const dedupeKey = `sale:${sale.id}`;
  if (password !== null) {
    await enqueueEmail(tx, { toEmail: user.email, toName: user.name, template: "venda", vars: { nome: user.name, email: user.email, senha: password, linkAcesso }, dedupeKey, now: ctx.now });
    return;
  }
  if (sale.status === "renewed") return; // renovação não é acesso novo
  let produto: string;
  if (input.full) produto = "todos os produtos";
  else {
    if (input.productIds.length === 0) return;
    const rows = await tx
      .select({ name: products.name })
      .from(products)
      .where(inArray(products.id, input.productIds))
      .orderBy(asc(products.position), asc(products.id));
    produto = rows.map((r) => r.name).join(", ");
  }
  await enqueueEmail(tx, { toEmail: user.email, toName: user.name, template: "novoacesso", vars: { nome: user.name, email: user.email, produto, linkAcesso }, dedupeKey, now: ctx.now });
}

async function approve(tx: Database, sale: Sale, ctx: Ctx): Promise<Outcome> {
  const delivery = await findDeliveryForSale(tx, sale);
  if (!delivery) throw new SaleError(noDeliveryMessage(sale));
  const saleRef = saleRefOf(sale);
  await lockSaleRef(tx, saleRef);
  // Pedido reembolsado (antes ou depois desta aprovação, processado ou não): não libera.
  // Cancelamento/atraso de assinatura não entra: a renovação reativa.
  if (await otherEventOfOrder(tx, sale, ["refunded", "chargeback"], ["queued", "processed", "error", "ignored"])) {
    return { result: "processed", deliveryId: delivery.id, notice: REFUNDED_SALE_NOTICE };
  }
  const items = await tx.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, delivery.id));
  await lockCustomer(tx, sale);
  const { user, password } = await findOrCreateStudent(tx, sale, ctx);
  const startsAt = parseKiwify(sale.payload).approvedAt ?? sale.receivedAt;
  const granted = await grantDeliveryItems(tx, { userId: user.id, deliveryId: delivery.id, saleRef, startsAt, items });
  const tagRows = await tx.select({ tagId: deliveryTags.tagId }).from(deliveryTags).where(eq(deliveryTags.deliveryId, delivery.id));
  await applyTags(tx, user.id, tagRows.map((t) => t.tagId));
  await sendAccessEmail(tx, sale, ctx, { user, password, ...granted });
  await tx
    .update(deliveries)
    .set({ lastSaleAt: sql`greatest(coalesce(${deliveries.lastSaleAt}, ${sale.receivedAt.toISOString()}::timestamptz), ${sale.receivedAt.toISOString()}::timestamptz)` })
    .where(eq(deliveries.id, delivery.id));
  return { result: "processed", userId: user.id, deliveryId: delivery.id };
}

async function revoke(tx: Database, sale: Sale, ctx: Ctx): Promise<Outcome> {
  const saleRef = saleRefOf(sale);
  await lockSaleRef(tx, saleRef);
  const known = await revokeSaleAccess(tx, saleRef, ctx.now);
  if (known.found) return { result: "processed", userId: known.userIds[0] ?? null };
  // A aprovação deste pedido está registrada (na fila, com erro ou processada sem acessos): a venda
  // não é antiga. Nada a revogar agora; quando a aprovação rodar, ela vê o reembolso e não libera.
  if (await otherEventOfOrder(tx, sale, ["approved", "renewed"])) return { result: "processed" };
  // Venda que não passou por aqui (anterior à virada): tira o que a entrega casada dá, exceto o que
  // o aluno tem por outra fonte, e marca para conferência.
  const delivery = await findDeliveryForSale(tx, sale);
  if (!delivery) throw new SaleError(noDeliveryMessage(sale));
  const user = sale.customerEmail || sale.customerDocument ? await findStudent(tx, sale) : null;
  if (user) {
    const items = await tx.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, delivery.id));
    await revokeLegacyDeliveryAccess(tx, { userId: user.id, deliveryId: delivery.id, items, now: ctx.now });
  }
  return { result: "processed", userId: user?.id ?? null, deliveryId: delivery.id, notice: LEGACY_SALE_NOTICE };
}

async function run(tx: Database, sale: Sale, ctx: Ctx): Promise<Outcome> {
  if (sale.gateway !== "kiwify") throw new SaleError("Gateway não suportado.");
  const ignored = ctx.settings.kiwify.ignoredProductIds;
  if (sale.productIds.some((id) => ignored.includes(id))) return { result: "ignored" };
  switch (sale.status) {
    case "approved":
    case "renewed":
      return approve(tx, sale, ctx);
    case "refunded":
    case "chargeback":
    case "canceled":
    case "late":
      return revoke(tx, sale, ctx);
    default:
      return { result: "processed" }; // aguardando, recusada, outros: só registro
  }
}

export async function processSale(db: Database, saleId: number, opts: { now?: Date; appUrl: string }): Promise<ProcessResult> {
  const now = opts.now ?? new Date();
  const alive = and(eq(sales.id, saleId), isNull(sales.deletedAt));
  try {
    return await db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Database;
      const [sale] = await tx.select().from(sales).where(alive).for("update");
      if (!sale) throw new SaleError("Venda não encontrada.");
      const settings = await getPlatformSettings(tx);
      const out = await run(tx, sale, { now, appUrl: opts.appUrl, settings });
      await tx
        .update(sales)
        .set({
          processing: out.result,
          processedAt: now,
          error: null,
          notice: out.notice ?? null,
          userId: out.userId ?? sale.userId,
          deliveryId: out.deliveryId ?? sale.deliveryId,
        })
        .where(eq(sales.id, sale.id));
      return out.result;
    });
  } catch (err) {
    // A transação já foi desfeita (nada concedido pela metade); só registra o erro na venda.
    const message = err instanceof SaleError ? err.message : UNEXPECTED_ERROR;
    if (!(err instanceof SaleError)) {
      console.error(`[vendas] falha ao processar a venda ${saleId}: ${safeErrorSummary(err)}`);
    }
    await db.update(sales).set({ processing: "error", error: message, processedAt: now }).where(alive);
    return "error";
  }
}

/** Cron: reprocessa as vendas que estão na fila há mais de 5 min (o after() não rodou ou caiu). */
export async function reprocessStaleQueue(
  db: Database,
  opts: { now?: Date; appUrl: string; limit?: number },
): Promise<Record<ProcessResult, number>> {
  const now = opts.now ?? new Date();
  const rows = await db
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.processing, "queued"), isNull(sales.deletedAt), lt(sales.receivedAt, new Date(now.getTime() - STALE_QUEUE_MS))))
    .orderBy(asc(sales.id))
    .limit(Math.max(1, Math.min(opts.limit ?? 50, 200)));
  const tally: Record<ProcessResult, number> = { processed: 0, error: 0, ignored: 0 };
  for (const r of rows) tally[await processSale(db, r.id, { now, appUrl: opts.appUrl })]++;
  return tally;
}
