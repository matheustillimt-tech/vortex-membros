import { and, asc, count, countDistinct, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { Database } from "@/db";
import { deliveries, deliveryItems, lessons, modules, products, scheduleProducts, scheduleRules, schedules } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { spMidnight } from "@/lib/catalog/release";
import { AdminError } from "./errors";
import { assertAdmin } from "./guard";

/**
 * Conteúdo programado (painel). Um produto fica em no máximo uma programação ativa; as regras
 * (módulo/aula) só podem apontar para conteúdo dos produtos da programação.
 */

const NOT_FOUND = "Não encontrado.";
export const MAX_RULE_DAYS = 3650;

export type ScheduleTarget = "module" | "lesson";
export type RuleInput =
  | { mode: "days_after_access"; days: number }
  | { mode: "fixed_date"; date: string /* AAAA-MM-DD, fuso de São Paulo */ };

function cleanName(value: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new AdminError("Informe um nome.");
  if (v.length > 200) throw new AdminError("Nome muito longo.");
  return v;
}

async function requireSchedule(db: Database, id: number, deleted = false) {
  const [row] = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, id), deleted ? isNotNull(schedules.deletedAt) : isNull(schedules.deletedAt)));
  if (!row) throw new AdminError(NOT_FOUND);
  return row;
}

async function requireProduct(db: Database, id: number) {
  const [row] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, id), isNull(products.deletedAt)));
  if (!row) throw new AdminError(NOT_FOUND);
}

/** Programação ativa que já contém o produto (exceto `exceptId`). */
async function scheduleOfProduct(db: Database, productId: number, exceptId?: number) {
  const [row] = await db
    .select({ id: schedules.id, name: schedules.name })
    .from(scheduleProducts)
    .innerJoin(schedules, eq(schedules.id, scheduleProducts.scheduleId))
    .where(
      and(
        eq(scheduleProducts.productId, productId),
        isNull(schedules.deletedAt),
        exceptId === undefined ? undefined : ne(schedules.id, exceptId),
      ),
    )
    .orderBy(asc(schedules.id))
    .limit(1);
  return row ?? null;
}

// ---------- programações ----------

export async function createSchedule(
  db: Database,
  actor: User | null,
  input: { name: string; productId?: number | null },
): Promise<{ id: number }> {
  assertAdmin(actor);
  const name = cleanName(input.name);
  if (input.productId != null) {
    await requireProduct(db, input.productId);
    if (await scheduleOfProduct(db, input.productId)) throw new AdminError("Este produto já está em outra programação.");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(schedules).values({ name }).returning({ id: schedules.id });
    if (input.productId != null) await tx.insert(scheduleProducts).values({ scheduleId: row.id, productId: input.productId });
    return row;
  });
}

/** Marca a programação como alterada agora ("Atualizado em"). */
const touch = (db: Database, id: number) => db.update(schedules).set({ updatedAt: new Date() }).where(eq(schedules.id, id));

export async function renameSchedule(db: Database, actor: User | null, id: number, name: string): Promise<void> {
  assertAdmin(actor);
  await requireSchedule(db, id);
  await db.update(schedules).set({ name: cleanName(name), updatedAt: new Date() }).where(eq(schedules.id, id));
}

/** Excluir = lixeira; as aulas dos produtos voltam a abrir sem regra. */
export async function trashSchedule(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  await requireSchedule(db, id);
  await db.update(schedules).set({ deletedAt: new Date() }).where(eq(schedules.id, id));
}

/** Restaurar recusa se algum produto dela entrou em outra programação nesse meio tempo. */
export async function restoreSchedule(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  await requireSchedule(db, id, true);
  const links = await db.select({ productId: scheduleProducts.productId }).from(scheduleProducts).where(eq(scheduleProducts.scheduleId, id));
  for (const l of links) {
    if (await scheduleOfProduct(db, l.productId, id)) throw new AdminError("Um dos produtos já está em outra programação.");
  }
  await db.update(schedules).set({ deletedAt: null }).where(eq(schedules.id, id));
}

export async function addProductToSchedule(db: Database, actor: User | null, scheduleId: number, productId: number): Promise<void> {
  assertAdmin(actor);
  await requireSchedule(db, scheduleId);
  await requireProduct(db, productId);
  const current = await scheduleOfProduct(db, productId);
  if (current?.id === scheduleId) return;
  if (current) throw new AdminError("Este produto já está em outra programação.");
  await db.insert(scheduleProducts).values({ scheduleId, productId }).onConflictDoNothing();
  await touch(db, scheduleId);
}

/** Tira o produto da programação e apaga as regras dos módulos/aulas dele. */
export async function removeProductFromSchedule(db: Database, actor: User | null, scheduleId: number, productId: number): Promise<void> {
  assertAdmin(actor);
  await requireSchedule(db, scheduleId);
  const mods = await db.select({ id: modules.id }).from(modules).where(eq(modules.productId, productId));
  const modIds = mods.map((m) => m.id);
  const lessonIds = modIds.length
    ? (await db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.moduleId, modIds))).map((l) => l.id)
    : [];
  await db.transaction(async (tx) => {
    await tx.delete(scheduleProducts).where(and(eq(scheduleProducts.scheduleId, scheduleId), eq(scheduleProducts.productId, productId)));
    if (modIds.length)
      await tx
        .delete(scheduleRules)
        .where(and(eq(scheduleRules.scheduleId, scheduleId), eq(scheduleRules.targetType, "module"), inArray(scheduleRules.targetId, modIds)));
    if (lessonIds.length)
      await tx
        .delete(scheduleRules)
        .where(and(eq(scheduleRules.scheduleId, scheduleId), eq(scheduleRules.targetType, "lesson"), inArray(scheduleRules.targetId, lessonIds)));
    await touch(tx as unknown as Database, scheduleId);
  });
}

// ---------- regras ----------

/** Produto do módulo/aula (não excluídos); senão "Não encontrado.". */
async function productOfTarget(db: Database, targetType: ScheduleTarget, targetId: number): Promise<number> {
  if (targetType === "module") {
    const [m] = await db.select({ productId: modules.productId }).from(modules).where(and(eq(modules.id, targetId), isNull(modules.deletedAt)));
    if (!m) throw new AdminError(NOT_FOUND);
    return m.productId;
  }
  if (targetType === "lesson") {
    const [l] = await db
      .select({ productId: modules.productId })
      .from(lessons)
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(and(eq(lessons.id, targetId), isNull(lessons.deletedAt)));
    if (!l) throw new AdminError(NOT_FOUND);
    return l.productId;
  }
  throw new AdminError("Requisição inválida.");
}

async function requireTargetInSchedule(db: Database, scheduleId: number, targetType: ScheduleTarget, targetId: number) {
  await requireSchedule(db, scheduleId);
  const productId = await productOfTarget(db, targetType, targetId);
  const [link] = await db
    .select({ productId: scheduleProducts.productId })
    .from(scheduleProducts)
    .where(and(eq(scheduleProducts.scheduleId, scheduleId), eq(scheduleProducts.productId, productId)));
  if (!link) throw new AdminError("Este conteúdo não pertence aos produtos da programação.");
}

/** Valida a regra: dias inteiros 0–3650 ou data AAAA-MM-DD real (vira 00:00 em São Paulo). */
export function checkRule(rule: RuleInput): { mode: RuleInput["mode"]; days: number | null; date: Date | null } {
  if (rule?.mode === "days_after_access") {
    if (!Number.isInteger(rule.days) || rule.days < 0 || rule.days > MAX_RULE_DAYS) throw new AdminError("Informe de 0 a 3650 dias.");
    return { mode: rule.mode, days: rule.days, date: null };
  }
  if (rule?.mode === "fixed_date") {
    const date = typeof rule.date === "string" ? spMidnight(rule.date) : null;
    if (!date || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) throw new AdminError("Data inválida.");
    return { mode: rule.mode, days: null, date };
  }
  throw new AdminError("Requisição inválida.");
}

export async function setRule(
  db: Database,
  actor: User | null,
  input: { scheduleId: number; targetType: ScheduleTarget; targetId: number; rule: RuleInput },
): Promise<void> {
  assertAdmin(actor);
  const value = checkRule(input.rule);
  await requireTargetInSchedule(db, input.scheduleId, input.targetType, input.targetId);
  await db
    .insert(scheduleRules)
    .values({ scheduleId: input.scheduleId, targetType: input.targetType, targetId: input.targetId, ...value })
    .onConflictDoUpdate({ target: [scheduleRules.scheduleId, scheduleRules.targetType, scheduleRules.targetId], set: value });
  await touch(db, input.scheduleId);
}

/** "Liberado" = sem regra própria (a aula volta a seguir o módulo). */
export async function clearRule(
  db: Database,
  actor: User | null,
  input: { scheduleId: number; targetType: ScheduleTarget; targetId: number },
): Promise<void> {
  assertAdmin(actor);
  await requireTargetInSchedule(db, input.scheduleId, input.targetType, input.targetId);
  await db
    .delete(scheduleRules)
    .where(
      and(
        eq(scheduleRules.scheduleId, input.scheduleId),
        eq(scheduleRules.targetType, input.targetType),
        eq(scheduleRules.targetId, input.targetId),
      ),
    );
  await touch(db, input.scheduleId);
}

// ---------- leitura ----------

export type AdminScheduleRow = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  products: { id: number; name: string; thumbnailUrl: string | null }[];
  ruleCount: number;
  /** Entregas (não arquivadas) que liberam produtos com esta programação (coluna "Uso"). */
  deliveryCount: number;
};

async function rowsOf(db: Database, deleted: boolean): Promise<(AdminScheduleRow & { deletedAt: Date | null })[]> {
  const list = await db
    .select()
    .from(schedules)
    .where(deleted ? isNotNull(schedules.deletedAt) : isNull(schedules.deletedAt))
    .orderBy(asc(schedules.name), asc(schedules.id));
  if (list.length === 0) return [];
  const ids = list.map((s) => s.id);
  const prods = await db
    .select({ scheduleId: scheduleProducts.scheduleId, id: products.id, name: products.name, thumbnailUrl: products.thumbnailUrl })
    .from(scheduleProducts)
    .innerJoin(products, eq(products.id, scheduleProducts.productId))
    .where(and(inArray(scheduleProducts.scheduleId, ids), isNull(products.deletedAt)))
    .orderBy(asc(products.name));
  const counts = await db
    .select({ scheduleId: scheduleRules.scheduleId, n: count() })
    .from(scheduleRules)
    .where(inArray(scheduleRules.scheduleId, ids))
    .groupBy(scheduleRules.scheduleId);
  const uses = await db
    .select({ scheduleId: deliveryItems.scheduleId, n: countDistinct(deliveryItems.deliveryId) })
    .from(deliveryItems)
    .innerJoin(deliveries, eq(deliveries.id, deliveryItems.deliveryId))
    .where(and(inArray(deliveryItems.scheduleId, ids), isNull(deliveries.archivedAt)))
    .groupBy(deliveryItems.scheduleId);
  return list.map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deliveryCount: Number(uses.find((u) => u.scheduleId === s.id)?.n ?? 0),
    deletedAt: s.deletedAt,
    products: prods.filter((p) => p.scheduleId === s.id).map(({ id, name, thumbnailUrl }) => ({ id, name, thumbnailUrl })),
    ruleCount: Number(counts.find((c) => c.scheduleId === s.id)?.n ?? 0),
  }));
}

export async function listSchedules(db: Database, actor: User | null): Promise<AdminScheduleRow[]> {
  assertAdmin(actor);
  return rowsOf(db, false);
}

export async function listScheduleTrash(db: Database, actor: User | null) {
  assertAdmin(actor);
  return rowsOf(db, true);
}

/** Produtos (não excluídos) que ainda não estão em nenhuma programação ativa, para "Adicionar produto". */
export async function listProductsWithoutSchedule(db: Database, actor: User | null): Promise<{ id: number; name: string }[]> {
  assertAdmin(actor);
  const all = await db.select({ id: products.id, name: products.name }).from(products).where(isNull(products.deletedAt)).orderBy(asc(products.name));
  const taken = await db
    .select({ productId: scheduleProducts.productId })
    .from(scheduleProducts)
    .innerJoin(schedules, eq(schedules.id, scheduleProducts.scheduleId))
    .where(isNull(schedules.deletedAt));
  const set = new Set(taken.map((t) => t.productId));
  return all.filter((p) => !set.has(p.id));
}

export type AdminRule = { mode: "days_after_access" | "fixed_date"; days: number | null; date: Date | null };

/** Programação ativa do produto e as regras dos módulos/aulas dele (chaves "module:ID" / "lesson:ID"). */
export async function getProductSchedule(
  db: Database,
  actor: User | null,
  productId: number,
): Promise<{ schedule: { id: number; name: string } | null; rules: Record<string, AdminRule> }> {
  assertAdmin(actor);
  await requireProduct(db, productId);
  const schedule = await scheduleOfProduct(db, productId);
  if (!schedule) return { schedule: null, rules: {} };
  const rows = await db.select().from(scheduleRules).where(eq(scheduleRules.scheduleId, schedule.id));
  const rules: Record<string, AdminRule> = {};
  for (const r of rows) rules[`${r.targetType}:${r.targetId}`] = { mode: r.mode, days: r.days, date: r.date };
  return { schedule, rules };
}
