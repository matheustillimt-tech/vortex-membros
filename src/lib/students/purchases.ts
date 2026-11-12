import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import {
  deliveries, deliveryItems, deliveryTags, fullAccess, lessonProgress, lessons, modules, productAccess, productFirstVisits,
  products, sales, scheduleProducts, schedules, showcases, userReleaseOverrides,
} from "@/db/schema";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import type { User } from "@/lib/auth/sessions";
import { enqueueEmail } from "@/lib/email/outbox";
import { grantDeliveryItems } from "@/lib/sales/grant";
import { applyTags } from "@/lib/sales/tags";
import { assertStudentExists } from "./admin";

/**
 * Compras e produtos do aluno (perfil › Compras e Produtos). "Compra" = os acessos do aluno com o
 * mesmo par (entrega, sale_ref): uma venda da Kiwify, um "Adicionar entrega" (manual) ou uma
 * importação. Acessos excluídos (`deleted_at`) não aparecem.
 */

export type PurchaseKey = { deliveryId: number | null; saleRef: string | null };
export type Purchase = PurchaseKey & {
  startedAt: Date;
  deliveryName: string | null;
  gateway: string | null;
  source: "sale" | "manual" | "import";
  amountCents: number | null;
  active: boolean;
  expiresAt: Date | null;
};

const GATEWAY_LABELS: Record<string, string> = { kiwify: "Kiwify" };
const NOT_FOUND = "Compra não encontrada.";
const FULL_ACCESS_PRODUCT = "Este produto vem do acesso completo: altere o tempo na aba Compras.";

/** Acesso ainda não vencido (vencido = o aluno não tem mais a entrega; pode ganhar de novo). */
const notExpired = (t: typeof productAccess | typeof fullAccess, now: Date) => or(isNull(t.expiresAt), gt(t.expiresAt, now))!;

const keyOf = (k: PurchaseKey) => `${k.deliveryId ?? ""}|${k.saleRef ?? ""}`;
const longer = (a: Date | null, b: Date | null) => (a === null || b === null ? null : a > b ? a : b);
const isActive = (r: { revokedAt: Date | null; startsAt: Date; expiresAt: Date | null }, now: Date) =>
  r.revokedAt === null && r.startsAt <= now && (r.expiresAt === null || r.expiresAt > now);

/** Condição do grupo numa das duas tabelas de acesso. */
function groupWhere<T extends typeof productAccess | typeof fullAccess>(t: T, userId: number, key: PurchaseKey): SQL {
  return and(
    eq(t.userId, userId),
    isNull(t.deletedAt),
    key.deliveryId === null ? isNull(t.deliveryId) : eq(t.deliveryId, key.deliveryId),
    key.saleRef === null ? isNull(t.saleRef) : eq(t.saleRef, key.saleRef),
  )!;
}

async function groupRows(db: Database, userId: number, key: PurchaseKey) {
  const cols = <T extends typeof productAccess | typeof fullAccess>(t: T) => ({ id: t.id, source: t.source, revokedAt: t.revokedAt });
  const pa = await db.select(cols(productAccess)).from(productAccess).where(groupWhere(productAccess, userId, key));
  const fa = await db.select(cols(fullAccess)).from(fullAccess).where(groupWhere(fullAccess, userId, key));
  if (pa.length + fa.length === 0) throw new AdminError(NOT_FOUND);
  return { pa, fa };
}

/** Aba Compras: um item por (entrega, venda), mais recente primeiro. */
export async function listPurchases(db: Database, actor: User | null, userId: number, now: Date = new Date()): Promise<Purchase[]> {
  assertAdmin(actor);
  const cols = <T extends typeof productAccess | typeof fullAccess>(t: T) => ({
    deliveryId: t.deliveryId,
    saleRef: t.saleRef,
    source: t.source,
    startsAt: t.startsAt,
    expiresAt: t.expiresAt,
    revokedAt: t.revokedAt,
  });
  const live = <T extends typeof productAccess | typeof fullAccess>(t: T) => and(eq(t.userId, userId), isNull(t.deletedAt));
  const rows = [
    ...(await db.select(cols(productAccess)).from(productAccess).where(live(productAccess))),
    ...(await db.select(cols(fullAccess)).from(fullAccess).where(live(fullAccess))),
  ];
  const groups = new Map<string, Purchase>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = groups.get(k);
    if (!g) {
      groups.set(k, {
        deliveryId: r.deliveryId,
        saleRef: r.saleRef,
        startedAt: r.startsAt,
        deliveryName: null,
        gateway: null,
        source: r.source,
        amountCents: null,
        active: isActive(r, now),
        expiresAt: r.expiresAt,
      });
      continue;
    }
    if (r.startsAt < g.startedAt) g.startedAt = r.startsAt;
    if (r.source === "sale") g.source = "sale";
    g.active ||= isActive(r, now);
    g.expiresAt = longer(g.expiresAt, r.expiresAt);
  }
  const list = [...groups.values()];
  const deliveryIds = [...new Set(list.map((p) => p.deliveryId).filter((v): v is number => v !== null))];
  if (deliveryIds.length) {
    const ds = await db.select({ id: deliveries.id, name: deliveries.name, gateway: deliveries.gateway }).from(deliveries).where(inArray(deliveries.id, deliveryIds));
    const byId = new Map(ds.map((d) => [d.id, d]));
    for (const p of list) {
      const d = p.deliveryId !== null ? byId.get(p.deliveryId) : undefined;
      if (d) Object.assign(p, { deliveryName: d.name, gateway: d.gateway });
    }
  }
  // Valor: a aprovação da venda (pedido ou assinatura) com esse sale_ref.
  const refs = [...new Set(list.filter((p) => p.source === "sale" && p.saleRef).map((p) => p.saleRef!))];
  if (refs.length) {
    const ss = await db
      .select({ orderId: sales.orderId, subscriptionId: sales.subscriptionId, amountCents: sales.amountCents, gateway: sales.gateway })
      .from(sales)
      .where(and(or(inArray(sales.orderId, refs), inArray(sales.subscriptionId, refs)), inArray(sales.status, ["approved", "renewed"]), isNull(sales.deletedAt)))
      .orderBy(asc(sales.id));
    for (const p of list) {
      const s = ss.find((x) => x.orderId === p.saleRef || x.subscriptionId === p.saleRef);
      if (s) {
        p.amountCents = s.amountCents;
        p.gateway ??= s.gateway;
      }
    }
  }
  return list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || keyOf(a).localeCompare(keyOf(b)));
}

/** Selo Ativo/Inativo da compra: revoga ou devolve todos os acessos do grupo. */
export async function setPurchaseActive(
  db: Database,
  actor: User | null,
  userId: number,
  key: PurchaseKey,
  active: boolean,
  now: Date = new Date(),
): Promise<void> {
  assertAdmin(actor);
  await assertStudentExists(db, userId);
  await groupRows(db, userId, key);
  await inTransaction(db, async (tx) => {
    for (const t of [productAccess, fullAccess] as const) {
      await tx
        .update(t)
        .set({ revokedAt: active ? null : now })
        .where(and(groupWhere(t, userId, key), active ? undefined : isNull(t.revokedAt)));
    }
  });
}

/** As duas tabelas de acesso mudam juntas (nunca meio grupo aplicado). */
async function inTransaction(db: Database, fn: (tx: Database) => Promise<void>): Promise<void> {
  await db.transaction(async (txRaw) => fn(txRaw as unknown as Database));
}

/** "Programar encerramento": fim dos acessos do grupo (null = sem data de encerramento). */
export async function schedulePurchaseEnd(db: Database, actor: User | null, userId: number, key: PurchaseKey, end: Date | null): Promise<void> {
  assertAdmin(actor);
  await assertStudentExists(db, userId);
  await groupRows(db, userId, key);
  await inTransaction(db, async (tx) => {
    for (const t of [productAccess, fullAccess] as const) await tx.update(t).set({ expiresAt: end }).where(groupWhere(t, userId, key));
  });
}

/** "Excluir" (só compra avulsa: manual ou importação): revoga e tira da aba Compras. Vendas nunca. */
export async function deletePurchase(db: Database, actor: User | null, userId: number, key: PurchaseKey, now: Date = new Date()): Promise<void> {
  assertAdmin(actor);
  await assertStudentExists(db, userId);
  const { pa, fa } = await groupRows(db, userId, key);
  if ([...pa, ...fa].some((r) => r.source === "sale")) throw new AdminError("Só compras avulsas podem ser excluídas.");
  await inTransaction(db, async (tx) => {
    for (const t of [productAccess, fullAccess] as const) {
      await tx
        .update(t)
        .set({ revokedAt: sql`coalesce(${t.revokedAt}, ${now.toISOString()}::timestamptz)`, deletedAt: now })
        .where(groupWhere(t, userId, key));
    }
  });
}

/* ---------- Adicionar entrega ---------- */

/** Entregas não arquivadas que o aluno ainda não tem (acesso válido daquela entrega), "Kiwify | Nome". */
export async function listAvailableDeliveries(
  db: Database,
  actor: User | null,
  userId: number,
  now: Date = new Date(),
): Promise<{ id: number; label: string }[]> {
  assertAdmin(actor);
  const pa = await db
    .select({ id: productAccess.deliveryId })
    .from(productAccess)
    .where(and(eq(productAccess.userId, userId), isNull(productAccess.deletedAt), isNull(productAccess.revokedAt), notExpired(productAccess, now), isNotNull(productAccess.deliveryId)));
  const fa = await db
    .select({ id: fullAccess.deliveryId })
    .from(fullAccess)
    .where(and(eq(fullAccess.userId, userId), isNull(fullAccess.deletedAt), isNull(fullAccess.revokedAt), notExpired(fullAccess, now), isNotNull(fullAccess.deliveryId)));
  const ids = [...new Set([...pa, ...fa].map((r) => r.id!))];
  const rows = await db
    .select({ id: deliveries.id, name: deliveries.name, gateway: deliveries.gateway })
    .from(deliveries)
    .where(and(isNull(deliveries.archivedAt), ids.length ? notInArray(deliveries.id, ids) : undefined))
    .orderBy(asc(sql`lower(${deliveries.name})`), asc(deliveries.id));
  return rows.map((d) => ({ id: d.id, label: `${GATEWAY_LABELS[d.gateway] ?? d.gateway} | ${d.name}` }));
}

/**
 * "Adicionar entrega": concede os itens da entrega como acesso manual (`sale_ref` "manual:<uuid>",
 * prazos da entrega a partir de agora), aplica as tags da entrega e manda o e-mail `novoacesso`.
 */
export async function addDeliveryToStudent(
  db: Database,
  actor: User | null,
  userId: number,
  deliveryId: number,
  opts: { now?: Date; appUrl?: string } = {},
): Promise<void> {
  assertAdmin(actor);
  const now = opts.now ?? new Date();
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const user = await assertStudentExists(tx, userId);
    const [delivery] = await tx.select().from(deliveries).where(and(eq(deliveries.id, deliveryId), isNull(deliveries.archivedAt))).limit(1);
    if (!delivery) throw new AdminError("Entrega não encontrada.");
    const [hasProduct] = await tx
      .select({ id: productAccess.id })
      .from(productAccess)
      .where(and(eq(productAccess.userId, userId), eq(productAccess.deliveryId, deliveryId), isNull(productAccess.deletedAt), isNull(productAccess.revokedAt), notExpired(productAccess, now)))
      .limit(1);
    const [hasFull] = await tx
      .select({ id: fullAccess.id })
      .from(fullAccess)
      .where(and(eq(fullAccess.userId, userId), eq(fullAccess.deliveryId, deliveryId), isNull(fullAccess.deletedAt), isNull(fullAccess.revokedAt), notExpired(fullAccess, now)))
      .limit(1);
    if (hasProduct || hasFull) throw new AdminError("O aluno já tem esta entrega.");
    const items = await tx.select().from(deliveryItems).where(eq(deliveryItems.deliveryId, deliveryId));
    const saleRef = `manual:${randomUUID()}`;
    const granted = await grantDeliveryItems(tx, { userId, deliveryId, saleRef, startsAt: now, items, source: "manual" });
    if (!granted.full && granted.productIds.length === 0) throw new AdminError("Esta entrega não libera nenhum produto.");
    const tagRows = await tx.select({ tagId: deliveryTags.tagId }).from(deliveryTags).where(eq(deliveryTags.deliveryId, deliveryId));
    await applyTags(tx, userId, tagRows.map((t) => t.tagId));
    let produto = "todos os produtos";
    if (!granted.full) {
      const names = await tx
        .select({ name: products.name })
        .from(products)
        .where(inArray(products.id, granted.productIds))
        .orderBy(asc(products.position), asc(products.id));
      produto = names.map((n) => n.name).join(", ");
    }
    const base = (opts.appUrl ?? "").replace(/\/+$/, "");
    await enqueueEmail(tx, {
      toEmail: user.email,
      toName: user.name,
      template: "novoacesso",
      vars: { nome: user.name, email: user.email, produto, linkAcesso: base ? `${base}/auth/login?login_token=${encodeURIComponent(user.loginToken)}` : undefined },
      dedupeKey: saleRef,
      now,
    });
  });
}

/* ---------- Produtos ---------- */

export type StudentProductRow = {
  productId: number;
  name: string;
  showcase: string;
  /** Fim do acesso (null = vitalício). */
  until: Date | null;
  /** Só pelo acesso completo (o tempo se altera na compra). */
  fromFullAccess: boolean;
  completed: number;
  total: number;
  percent: number;
  /** "Imediata": a programação de liberação não vale para este aluno. */
  immediate: boolean;
  scheduleName: string | null;
};

/** Aba Produtos: produtos com acesso não revogado (acesso completo = todos), em ordem de vitrine. */
export async function listStudentProducts(db: Database, actor: User | null, userId: number, now: Date = new Date()): Promise<StudentProductRow[]> {
  assertAdmin(actor);
  void now;
  const live = <T extends typeof productAccess | typeof fullAccess>(t: T) => and(eq(t.userId, userId), isNull(t.deletedAt), isNull(t.revokedAt));
  const pa = await db.select({ productId: productAccess.productId, expiresAt: productAccess.expiresAt }).from(productAccess).where(live(productAccess));
  const fa = await db.select({ expiresAt: fullAccess.expiresAt }).from(fullAccess).where(live(fullAccess));
  const own = new Map<number, Date | null>();
  for (const r of pa) own.set(r.productId, own.has(r.productId) ? longer(own.get(r.productId)!, r.expiresAt) : r.expiresAt);
  const full = fa.length ? fa.map((r) => r.expiresAt).reduce(longer) : undefined;
  if (own.size === 0 && full === undefined) return [];

  const list = await db
    .select({ id: products.id, name: products.name, showcase: showcases.name })
    .from(products)
    .innerJoin(showcases, eq(showcases.id, products.showcaseId))
    .where(and(isNull(products.deletedAt), full === undefined ? inArray(products.id, [...own.keys()]) : undefined))
    .orderBy(asc(showcases.position), asc(showcases.id), asc(products.position), asc(products.id));
  if (!list.length) return [];
  const ids = list.map((p) => p.id);

  const progress = await db
    .select({
      productId: modules.productId,
      total: sql<number>`count(${lessons.id})::int`,
      completed: sql<number>`count(${lessonProgress.lessonId})::int`,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)))
    .where(
      and(
        inArray(modules.productId, ids),
        eq(modules.status, "published"),
        isNull(modules.deletedAt),
        eq(lessons.status, "published"),
        isNull(lessons.deletedAt),
      ),
    )
    .groupBy(modules.productId);
  const byProduct = new Map(progress.map((p) => [p.productId, p]));
  const sched = await db
    .select({ productId: scheduleProducts.productId, name: schedules.name })
    .from(scheduleProducts)
    .innerJoin(schedules, eq(schedules.id, scheduleProducts.scheduleId))
    .where(and(inArray(scheduleProducts.productId, ids), isNull(schedules.deletedAt)))
    .orderBy(asc(schedules.id));
  const scheduleOf = new Map<number, string>();
  for (const s of sched) if (!scheduleOf.has(s.productId)) scheduleOf.set(s.productId, s.name);
  const overrides = new Set(
    (await db.select({ productId: userReleaseOverrides.productId }).from(userReleaseOverrides).where(eq(userReleaseOverrides.userId, userId))).map((o) => o.productId),
  );

  return list.map((p) => {
    const mine = own.has(p.id);
    const until = mine && full !== undefined ? longer(own.get(p.id)!, full) : mine ? own.get(p.id)! : (full ?? null);
    const pr = byProduct.get(p.id);
    const total = pr?.total ?? 0;
    const completed = pr?.completed ?? 0;
    return {
      productId: p.id,
      name: p.name,
      showcase: p.showcase,
      until,
      fromFullAccess: !mine,
      completed,
      total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      immediate: overrides.has(p.id),
      scheduleName: scheduleOf.get(p.id) ?? null,
    };
  });
}

export type AccessChange =
  | { type: "date"; date: Date }
  | { type: "lifetime" }
  | { type: "add"; days: number; weeks: number; months: number; years: number };

function addTo(start: Date, c: Extract<AccessChange, { type: "add" }>): Date {
  const d = new Date(start.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + c.years);
  d.setUTCMonth(d.getUTCMonth() + c.months);
  d.setUTCDate(d.getUTCDate() + c.weeks * 7 + c.days);
  return d;
}

/**
 * "Alterar tempo de acesso": uma data, vitalício, ou somar dias/semanas/meses/anos contados do início
 * de cada acesso. `"all"` = "Aplicar a todos os cursos do aluno" (inclui o acesso completo).
 */
export async function setAccessUntil(
  db: Database,
  actor: User | null,
  userId: number,
  productId: number | "all",
  change: AccessChange,
  now: Date = new Date(),
): Promise<void> {
  assertAdmin(actor);
  void now;
  if (change.type === "add") {
    const parts = [change.days, change.weeks, change.months, change.years];
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 1000)) throw new AdminError("Tempo inválido.");
    if (parts.every((n) => n === 0)) throw new AdminError("Escolha uma data, Vitalício ou um tempo a adicionar.");
  }
  if (change.type === "date" && Number.isNaN(change.date.getTime())) throw new AdminError("Data inválida.");
  await assertStudentExists(db, userId);
  const live = <T extends typeof productAccess | typeof fullAccess>(t: T) => and(eq(t.userId, userId), isNull(t.deletedAt), isNull(t.revokedAt));
  const pa = await db
    .select({ id: productAccess.id, startsAt: productAccess.startsAt })
    .from(productAccess)
    .where(and(live(productAccess), productId === "all" ? undefined : eq(productAccess.productId, productId)));
  const fa = productId === "all" ? await db.select({ id: fullAccess.id, startsAt: fullAccess.startsAt }).from(fullAccess).where(live(fullAccess)) : [];
  if (pa.length + fa.length === 0) {
    if (productId !== "all" && (await db.select({ id: fullAccess.id }).from(fullAccess).where(live(fullAccess)).limit(1)).length) {
      throw new AdminError(FULL_ACCESS_PRODUCT);
    }
    throw new AdminError("Produto não encontrado.");
  }
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const expiry = (start: Date) => (change.type === "lifetime" ? null : change.type === "date" ? change.date : addTo(start, change));
    for (const r of pa) await tx.update(productAccess).set({ expiresAt: expiry(r.startsAt) }).where(eq(productAccess.id, r.id));
    for (const r of fa) await tx.update(fullAccess).set({ expiresAt: expiry(r.startsAt) }).where(eq(fullAccess.id, r.id));
  });
}

/** Selo Programada/Imediata: liga ou desliga a liberação imediata do produto para o aluno. */
export async function toggleReleaseOverride(db: Database, actor: User | null, userId: number, productId: number, immediate: boolean): Promise<void> {
  assertAdmin(actor);
  await assertStudentExists(db, userId);
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), isNull(products.deletedAt))).limit(1);
  if (!product) throw new AdminError("Produto não encontrado.");
  if (immediate) await db.insert(userReleaseOverrides).values({ userId, productId }).onConflictDoNothing();
  else await db.delete(userReleaseOverrides).where(and(eq(userReleaseOverrides.userId, userId), eq(userReleaseOverrides.productId, productId)));
}

/** "Excluir progresso": apaga as aulas concluídas do aluno no produto. */
export async function deleteProgress(db: Database, actor: User | null, userId: number, productId: number): Promise<void> {
  assertAdmin(actor);
  await assertStudentExists(db, userId);
  const ofProduct = db.select({ id: lessons.id }).from(lessons).innerJoin(modules, eq(modules.id, lessons.moduleId)).where(eq(modules.productId, productId));
  await db.delete(lessonProgress).where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, ofProduct)));
}

/**
 * "Iniciar todos os acessos": grava a primeira visita (dia 0 da liberação programada) de cada
 * produto do aluno que ainda não tem. Devolve quantas foram criadas.
 */
export async function startAllAccesses(db: Database, actor: User | null, userId: number, now: Date = new Date()): Promise<number> {
  const rows = await listStudentProducts(db, actor, userId, now);
  if (!rows.length) return 0;
  const created = await db
    .insert(productFirstVisits)
    .values(rows.map((r) => ({ userId, productId: r.productId, firstAt: now })))
    .onConflictDoNothing()
    .returning({ productId: productFirstVisits.productId });
  return created.length;
}
