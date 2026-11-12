import { and, arrayOverlaps, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  deliveries,
  deliveryItems,
  deliveryTags,
  fullAccess,
  productAccess,
  products,
  schedules,
  showcases,
  tags,
  type Delivery,
  type DeliveryItem,
  type DeliveryTarget,
  type DeliveryType,
  type DurationType,
} from "@/db/schema";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import type { User } from "@/lib/auth/sessions";

/**
 * Entregas (Vendas › Entregas): cada uma liga códigos do gateway (produto, oferta, plano ou link
 * de checkout) a produtos, vitrines ou ao acesso completo, com tempo de acesso por item.
 */

export const DELIVERY_NAME_MAX = 120;
export const DELIVERY_CODE_MAX = 100;
export const DELIVERY_CODES_MAX = 50;
export const DELIVERY_ITEMS_MAX = 500;
export const DURATION_MIN = 1;
export const DURATION_MAX = 1000;

const TYPES: readonly DeliveryType[] = ["single", "subscription"];
const TARGETS: readonly DeliveryTarget[] = ["all", "showcase", "product"];
const DURATIONS: readonly DurationType[] = ["lifetime", "hours", "days", "weeks", "months", "years"];

export type DeliveryItemInput = {
  targetType: DeliveryTarget;
  targetId: number | null;
  durationType: DurationType;
  duration: number | null;
  scheduleId: number | null;
};
export type DeliveryInput = {
  name: string;
  type: DeliveryType;
  codes: string[];
  items: DeliveryItemInput[];
  tagIds: number[];
};
export type DeliveryDetail = Delivery & { items: DeliveryItem[]; tagIds: number[] };
export type AccessCounts = { total: number; active: number; inactive: number };
export type DeliveryListRow = Delivery & { access: AccessCounts };

const NOT_FOUND = "Entrega não encontrada.";

// ---------- validação ----------

function cleanName(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v || v.length > DELIVERY_NAME_MAX) throw new AdminError(`Informe o nome da entrega (até ${DELIVERY_NAME_MAX} caracteres).`);
  return v;
}

function cleanType(raw: unknown): DeliveryType {
  if (!TYPES.includes(raw as DeliveryType)) throw new AdminError("Modalidade de venda inválida.");
  return raw as DeliveryType;
}

function cleanCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new AdminError("Informe ao menos um código do produto ou plano.");
  const out: string[] = [];
  for (const v of raw) {
    const t = typeof v === "string" ? v.trim() : "";
    if (!t) continue;
    if (t.length > DELIVERY_CODE_MAX) throw new AdminError(`Cada código pode ter até ${DELIVERY_CODE_MAX} caracteres.`);
    if (!out.includes(t)) out.push(t);
  }
  if (out.length === 0) throw new AdminError("Informe ao menos um código do produto ou plano.");
  if (out.length > DELIVERY_CODES_MAX) throw new AdminError(`Use no máximo ${DELIVERY_CODES_MAX} códigos.`);
  return out;
}

const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/**
 * Alvos que já estavam salvos na entrega. Se o produto, a vitrine ou a programação foram excluídos
 * depois, o item é descartado (ou a programação zerada) em vez de travar o salvamento da entrega;
 * alvos novos inexistentes continuam sendo recusados.
 */
type Saved = { targets: Set<string>; scheduleIds: Set<number> };

async function cleanItems(db: Database, raw: unknown, saved?: Saved): Promise<DeliveryItemInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) throw new AdminError("Selecione ao menos um conteúdo para entregar.");
  if (raw.length > DELIVERY_ITEMS_MAX) throw new AdminError("Conteúdo demais nesta entrega.");
  const items: DeliveryItemInput[] = [];
  const seen = new Set<string>();
  for (const r of raw as Partial<DeliveryItemInput>[]) {
    const targetType = r?.targetType as DeliveryTarget;
    if (!TARGETS.includes(targetType)) throw new AdminError("Conteúdo inválido.");
    const targetId = targetType === "all" ? null : (r.targetId ?? null);
    if (targetType !== "all" && !isId(targetId)) throw new AdminError("Conteúdo inválido.");
    const durationType = r.durationType as DurationType;
    if (!DURATIONS.includes(durationType)) throw new AdminError("Tempo de acesso inválido.");
    let duration: number | null = null;
    if (durationType !== "lifetime") {
      const d = r.duration;
      if (typeof d !== "number" || !Number.isInteger(d) || d < DURATION_MIN || d > DURATION_MAX) {
        throw new AdminError(`Tempo de acesso deve ser de ${DURATION_MIN} a ${DURATION_MAX}.`);
      }
      duration = d;
    }
    const scheduleId = r.scheduleId ?? null;
    if (scheduleId !== null && !isId(scheduleId)) throw new AdminError("Programação de liberação não encontrada.");
    const key = `${targetType}:${targetId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ targetType, targetId, durationType, duration, scheduleId });
  }

  const ids = (t: DeliveryTarget) => [...new Set(items.filter((i) => i.targetType === t).map((i) => i.targetId!))];
  const productIds = ids("product");
  const showcaseIds = ids("showcase");
  const scheduleIds = [...new Set(items.map((i) => i.scheduleId).filter((v): v is number => v !== null))];
  const missing = (asked: number[], found: { id: number }[]) => asked.filter((id) => !found.some((f) => f.id === id));
  const goneProducts = productIds.length
    ? missing(productIds, await db.select({ id: products.id }).from(products).where(and(inArray(products.id, productIds), isNull(products.deletedAt))))
    : [];
  const goneShowcases = showcaseIds.length
    ? missing(showcaseIds, await db.select({ id: showcases.id }).from(showcases).where(and(inArray(showcases.id, showcaseIds), isNull(showcases.deletedAt))))
    : [];
  const goneSchedules = scheduleIds.length
    ? missing(scheduleIds, await db.select({ id: schedules.id }).from(schedules).where(and(inArray(schedules.id, scheduleIds), isNull(schedules.deletedAt))))
    : [];
  if (goneProducts.some((id) => !saved?.targets.has(`product:${id}`))) throw new AdminError("Produto não encontrado.");
  if (goneShowcases.some((id) => !saved?.targets.has(`showcase:${id}`))) throw new AdminError("Vitrine não encontrada.");
  if (goneSchedules.some((id) => !saved?.scheduleIds.has(id))) throw new AdminError("Programação de liberação não encontrada.");
  const kept = items
    .filter((i) => !(i.targetType === "product" && goneProducts.includes(i.targetId!)) && !(i.targetType === "showcase" && goneShowcases.includes(i.targetId!)))
    .map((i) => (i.scheduleId !== null && goneSchedules.includes(i.scheduleId) ? { ...i, scheduleId: null } : i));
  if (kept.length === 0) throw new AdminError("Selecione ao menos um conteúdo para entregar.");
  return kept;
}

async function cleanTagIds(db: Database, raw: unknown): Promise<number[]> {
  if (!Array.isArray(raw)) return [];
  const ids = [...new Set(raw)];
  if (!ids.every(isId)) throw new AdminError("Tag não encontrada.");
  if (ids.length === 0) return [];
  const found = await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, ids));
  if (found.length !== ids.length) throw new AdminError("Tag não encontrada.");
  return ids;
}

// ---------- leitura ----------

async function requireDelivery(db: Database, id: number): Promise<Delivery> {
  if (!isId(id)) throw new AdminError(NOT_FOUND);
  const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  if (!row) throw new AdminError(NOT_FOUND);
  return row;
}

async function detailOf(db: Database, d: Delivery): Promise<DeliveryDetail> {
  const items = await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, d.id)).orderBy(asc(deliveryItems.id));
  const tagRows = await db.select({ tagId: deliveryTags.tagId }).from(deliveryTags).where(eq(deliveryTags.deliveryId, d.id)).orderBy(asc(deliveryTags.tagId));
  return { ...d, items, tagIds: tagRows.map((t) => t.tagId) };
}

export async function getDelivery(db: Database, actor: User | null, id: number): Promise<DeliveryDetail | null> {
  assertAdmin(actor);
  if (!isId(id)) return null;
  const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  return row ? detailOf(db, row) : null;
}

const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Alunos por entrega (acessos por produto e acesso completo): total, ativos (ao menos um acesso
 * ativo) e inativos (o resto). Uma consulta para a página inteira.
 */
async function accessCounts(db: Database, ids: number[], now: Date): Promise<Map<number, AccessCounts>> {
  const out = new Map<number, AccessCounts>();
  if (ids.length === 0) return out;
  const at = now.toISOString();
  const activeOf = (t: typeof productAccess | typeof fullAccess) =>
    sql<boolean>`(${t.revokedAt} is null and ${t.startsAt} <= ${at}::timestamptz and (${t.expiresAt} is null or ${t.expiresAt} > ${at}::timestamptz))`;
  const pa = db
    .select({ deliveryId: productAccess.deliveryId, userId: productAccess.userId, active: activeOf(productAccess).as("active") })
    .from(productAccess)
    .where(inArray(productAccess.deliveryId, ids));
  const fa = db
    .select({ deliveryId: fullAccess.deliveryId, userId: fullAccess.userId, active: activeOf(fullAccess).as("active") })
    .from(fullAccess)
    .where(inArray(fullAccess.deliveryId, ids));
  const u = pa.unionAll(fa).as("u");
  const rows = await db
    .select({
      deliveryId: u.deliveryId,
      total: sql<number>`count(distinct ${u.userId})`.mapWith(Number),
      active: sql<number>`count(distinct ${u.userId}) filter (where ${u.active})`.mapWith(Number),
    })
    .from(u)
    .groupBy(u.deliveryId);
  for (const r of rows) {
    if (r.deliveryId === null) continue;
    out.set(Number(r.deliveryId), { total: r.total, active: r.active, inactive: r.total - r.active });
  }
  return out;
}

export async function listDeliveries(
  db: Database,
  actor: User | null,
  opts: { archived: boolean; gateway?: string; type?: DeliveryType; search?: string },
  now: Date = new Date(),
): Promise<DeliveryListRow[]> {
  assertAdmin(actor);
  const q = opts.search?.trim().slice(0, 200);
  const where = and(
    opts.archived ? isNotNull(deliveries.archivedAt) : isNull(deliveries.archivedAt),
    opts.gateway ? eq(deliveries.gateway, opts.gateway as Delivery["gateway"]) : undefined,
    opts.type ? eq(deliveries.type, opts.type) : undefined,
    q
      ? or(
          ilike(deliveries.name, likePattern(q)),
          sql`exists (select 1 from unnest(${deliveries.codes}) c where c ilike ${likePattern(q)})`,
          /^\d+$/.test(q) ? eq(deliveries.id, Number(q)) : undefined,
        )
      : undefined,
  );
  const rows = await db.select().from(deliveries).where(where).orderBy(asc(sql`lower(${deliveries.name})`), desc(deliveries.id));
  const counts = await accessCounts(db, rows.map((r) => r.id), now);
  return rows.map((r) => ({ ...r, access: counts.get(r.id) ?? { total: 0, active: 0, inactive: 0 } }));
}

/** Entrega não arquivada cujos códigos contêm algum dos identificadores da venda (a de menor id). */
export async function findDeliveryForSale(
  db: Database,
  sale: { productIds: string[]; checkoutLink: string | null; planId: string | null },
): Promise<Delivery | null> {
  const candidates = [...new Set([...sale.productIds, sale.checkoutLink, sale.planId].filter((v): v is string => !!v))];
  if (candidates.length === 0) return null;
  const [row] = await db
    .select()
    .from(deliveries)
    .where(and(isNull(deliveries.archivedAt), arrayOverlaps(deliveries.codes, candidates)))
    .orderBy(asc(deliveries.id))
    .limit(1);
  return row ?? null;
}

// ---------- escrita ----------

async function replaceChildren(tx: Database, deliveryId: number, items?: DeliveryItemInput[], tagIds?: number[]) {
  if (items) {
    await tx.delete(deliveryItems).where(eq(deliveryItems.deliveryId, deliveryId));
    if (items.length) await tx.insert(deliveryItems).values(items.map((i) => ({ ...i, deliveryId })));
  }
  if (tagIds) {
    await tx.delete(deliveryTags).where(eq(deliveryTags.deliveryId, deliveryId));
    if (tagIds.length) await tx.insert(deliveryTags).values(tagIds.map((tagId) => ({ deliveryId, tagId })));
  }
}

export async function createDelivery(db: Database, actor: User | null, input: DeliveryInput): Promise<{ id: number }> {
  assertAdmin(actor);
  const name = cleanName(input.name);
  const type = cleanType(input.type);
  const codes = cleanCodes(input.codes);
  const items = await cleanItems(db, input.items);
  const tagIds = await cleanTagIds(db, input.tagIds);
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [row] = await tx.insert(deliveries).values({ name, type, codes, gateway: "kiwify" }).returning({ id: deliveries.id });
    await replaceChildren(tx, row.id, items, tagIds);
    return { id: row.id };
  });
}

/** Atualiza só o que veio; itens e tags, quando vêm, substituem os anteriores (numa transação). */
export async function updateDelivery(db: Database, actor: User | null, id: number, input: Partial<DeliveryInput>): Promise<void> {
  assertAdmin(actor);
  await requireDelivery(db, id);
  const set: Partial<Pick<Delivery, "name" | "type" | "codes">> = {};
  if (input.name !== undefined) set.name = cleanName(input.name);
  if (input.type !== undefined) set.type = cleanType(input.type);
  if (input.codes !== undefined) set.codes = cleanCodes(input.codes);
  let items: DeliveryItemInput[] | undefined;
  if (input.items !== undefined) {
    const before = await db.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, id));
    items = await cleanItems(db, input.items, {
      targets: new Set(before.map((i) => `${i.targetType}:${i.targetId ?? ""}`)),
      scheduleIds: new Set(before.map((i) => i.scheduleId).filter((v): v is number => v !== null)),
    });
  }
  const tagIds = input.tagIds !== undefined ? await cleanTagIds(db, input.tagIds) : undefined;
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    if (Object.keys(set).length) await tx.update(deliveries).set(set).where(eq(deliveries.id, id));
    await replaceChildren(tx, id, items, tagIds);
  });
}

/** Cópia com itens e tags; sem os códigos (duas entregas com o mesmo código disputariam as vendas). */
export async function duplicateDelivery(db: Database, actor: User | null, id: number): Promise<{ id: number }> {
  assertAdmin(actor);
  const src = await detailOf(db, await requireDelivery(db, id));
  const name = `${src.name} (cópia)`.slice(0, DELIVERY_NAME_MAX);
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [row] = await tx.insert(deliveries).values({ name, type: src.type, gateway: src.gateway, codes: [] }).returning({ id: deliveries.id });
    await replaceChildren(
      tx,
      row.id,
      src.items.map(({ targetType, targetId, durationType, duration, scheduleId }) => ({ targetType, targetId, durationType, duration, scheduleId })),
      src.tagIds,
    );
    return { id: row.id };
  });
}

/** Arquivada deixa de processar vendas novas; os acessos já entregues ficam como estão. */
export async function archiveDelivery(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  await requireDelivery(db, id);
  await db.update(deliveries).set({ archivedAt: new Date() }).where(and(eq(deliveries.id, id), isNull(deliveries.archivedAt)));
}

export async function restoreDelivery(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  await requireDelivery(db, id);
  await db.update(deliveries).set({ archivedAt: null }).where(eq(deliveries.id, id));
}
