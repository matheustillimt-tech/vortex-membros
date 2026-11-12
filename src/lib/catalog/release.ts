import { and, asc, eq, gt, isNull, lte, or, sql, type AnyColumn } from "drizzle-orm";
import type { Database } from "@/db";
import { lessons, modules, productAccess, productFirstVisits, scheduleProducts, scheduleRules, schedules, userReleaseOverrides } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";

/**
 * Conteúdo programado. Datas e "dias" contam no fuso de São Paulo: uma aula liberada "7 dias após o
 * acesso" abre à 00:00 (America/Sao_Paulo) do 7º dia depois do dia em que o acesso começou; uma data
 * fixa abre à 00:00 daquele dia. Regra da aula vence a do módulo. Admin vê tudo.
 */

export const TIMEZONE = "America/Sao_Paulo";

const dayParts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Dia (AAAA-MM-DD) de um instante no fuso de São Paulo. */
export function spDay(d: Date): string {
  return dayParts.format(d);
}

/** Diferença (ms) entre o relógio de São Paulo e o UTC num instante. */
function spOffsetMs(at: Date): number {
  const p = Object.fromEntries(timeParts.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** 00:00 em São Paulo do dia "AAAA-MM-DD" (+ `addDays`). Dia inválido → null. */
export function spMidnight(day: string, addDays = 0): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const naive = Date.UTC(y, mo - 1, d + addDays);
  // Ajuste em duas passadas cobre mudanças de horário (São Paulo não tem horário de verão desde 2019).
  let t = naive - spOffsetMs(new Date(naive));
  t = naive - spOffsetMs(new Date(t));
  return new Date(t);
}

const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" });
/** "DD/MM/AAAA" em São Paulo. */
export function formatReleaseDate(d: Date): string {
  return shortDate.format(d);
}

export type ReleaseRule = { targetType: "module" | "lesson"; targetId: number; mode: "days_after_access" | "fixed_date"; days: number | null; date: Date | null };

/**
 * Subconsulta com a programação ativa do produto (`productId` = coluna da consulta de fora), para
 * vir junto com a leitura do produto em vez de custar uma consulta a mais. Mesmo critério de
 * activeScheduleId (menor id não excluído).
 */
export function activeScheduleIdSql(productId: AnyColumn) {
  return sql<number | null>`(select min(${schedules.id}) from ${scheduleProducts} inner join ${schedules} on ${schedules.id} = ${scheduleProducts.scheduleId} where ${scheduleProducts.productId} = ${productId} and ${schedules.deletedAt} is null)`.mapWith(
    (v: unknown) => (v === null || v === undefined ? null : Number(v)),
  );
}

/** Programação ativa (não excluída) do produto; null = sem programação. */
async function activeScheduleId(db: Database, productId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: schedules.id })
    .from(scheduleProducts)
    .innerJoin(schedules, eq(schedules.id, scheduleProducts.scheduleId))
    .where(and(eq(scheduleProducts.productId, productId), isNull(schedules.deletedAt)))
    .orderBy(asc(schedules.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Início do acesso do aluno ao produto: `startsAt` do acesso ativo mais antigo; sem registro (produto
 * grátis) → primeira visita ao produto, gravada aqui na primeira vez (é o dia 0). Só roda quando uma
 * regra de dias precisa dele, depois das checagens de acesso e de termo (nunca para admin).
 */
async function accessStart(db: Database, user: User, productId: number, now: Date): Promise<Date> {
  const [row] = await db
    .select({ startsAt: productAccess.startsAt })
    .from(productAccess)
    .where(
      and(
        eq(productAccess.userId, user.id),
        eq(productAccess.productId, productId),
        lte(productAccess.startsAt, now),
        isNull(productAccess.revokedAt),
        or(isNull(productAccess.expiresAt), gt(productAccess.expiresAt, now)),
      ),
    )
    .orderBy(asc(productAccess.startsAt))
    .limit(1);
  if (row) return row.startsAt;
  const visitOf = () =>
    db
      .select({ firstAt: productFirstVisits.firstAt })
      .from(productFirstVisits)
      .where(and(eq(productFirstVisits.userId, user.id), eq(productFirstVisits.productId, productId)));
  const [visit] = await visitOf();
  if (visit) return visit.firstAt;
  const [inserted] = await db
    .insert(productFirstVisits)
    .values({ userId: user.id, productId, firstAt: now })
    .onConflictDoNothing()
    .returning({ firstAt: productFirstVisits.firstAt });
  if (inserted) return inserted.firstAt;
  // Outra requisição gravou no meio tempo: vale a dela.
  const [again] = await visitOf();
  return again?.firstAt ?? now;
}

const FAR_FUTURE = new Date("9999-12-31T00:00:00Z");

/** Data de liberação de uma regra. Regra de dias sem valor fica travada (fail-closed): nunca libera. */
export function ruleReleaseAt(rule: ReleaseRule, start: Date): Date | null {
  if (rule.mode === "fixed_date") return rule.date ?? FAR_FUTURE;
  if (rule.days === null) return FAR_FUTURE;
  return spMidnight(spDay(start), rule.days) ?? FAR_FUTURE;
}

/**
 * Datas de liberação ainda futuras das aulas do produto para este aluno: Map(aulaId → data).
 * Aula fora do mapa = liberada. Admin e produto sem programação → mapa vazio.
 * Produto grátis sem visita e com regra de dias: grava a primeira visita (ver accessStart).
 */
export async function lockedLessonsOfProduct(
  db: Database,
  user: User,
  productId: number,
  lessonRows: { id: number; moduleId: number }[],
  now: Date = new Date(),
  /** Programação já lida junto com o produto (activeScheduleIdSql); undefined = consulta aqui. */
  knownScheduleId?: number | null,
): Promise<Map<number, Date>> {
  const out = new Map<number, Date>();
  if (user.role === "admin" || lessonRows.length === 0) return out;
  const scheduleId = knownScheduleId === undefined ? await activeScheduleId(db, productId) : knownScheduleId;
  if (scheduleId === null) return out;
  // "Liberação imediata" dada no perfil do aluno: a programação não vale para ele neste produto.
  const [override] = await db
    .select({ userId: userReleaseOverrides.userId })
    .from(userReleaseOverrides)
    .where(and(eq(userReleaseOverrides.userId, user.id), eq(userReleaseOverrides.productId, productId)))
    .limit(1);
  if (override) return out;
  const rules = await db
    .select({ targetType: scheduleRules.targetType, targetId: scheduleRules.targetId, mode: scheduleRules.mode, days: scheduleRules.days, date: scheduleRules.date })
    .from(scheduleRules)
    .where(eq(scheduleRules.scheduleId, scheduleId));
  if (rules.length === 0) return out;
  const byLesson = new Map(rules.filter((r) => r.targetType === "lesson").map((r) => [r.targetId, r]));
  const byModule = new Map(rules.filter((r) => r.targetType === "module").map((r) => [r.targetId, r]));
  const needsStart = rules.some((r) => r.mode === "days_after_access");
  const start = needsStart ? await accessStart(db, user, productId, now) : now;
  for (const l of lessonRows) {
    const rule = byLesson.get(l.id) ?? byModule.get(l.moduleId);
    if (!rule) continue;
    const at = ruleReleaseAt(rule, start);
    if (at && at.getTime() > now.getTime()) out.set(l.id, at);
  }
  return out;
}

/** Quando a aula libera para este aluno; null = já liberada (ou sem programação, ou admin). */
export async function releaseDateFor(db: Database, user: User, lessonId: number, now: Date = new Date()): Promise<Date | null> {
  if (user.role === "admin") return null;
  const [row] = await db
    .select({ id: lessons.id, moduleId: lessons.moduleId, productId: modules.productId })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(lessons.id, lessonId));
  if (!row) return null;
  const map = await lockedLessonsOfProduct(db, user, row.productId, [row], now);
  return map.get(lessonId) ?? null;
}
