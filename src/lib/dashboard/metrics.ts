import { and, count, eq, gte, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import { deliveries, fullAccess, productAccess, products, sales, showcases, users } from "@/db/schema";
import { assertAdmin } from "@/lib/admin/guard";
import type { User } from "@/lib/auth/sessions";
import { lastTwelveMonths, MONTHS } from "./reports";

/**
 * Início do painel. Tudo calculado por consulta, no fuso de São Paulo:
 * aluno = `role = 'student'` não excluído; "Novos no mês" compara com o mês anterior inteiro (como o
 * tooltip do gráfico); matrícula por venda = grupo de acesso (aluno + venda) com `source = 'sale'`,
 * contado no mês em que começou; atividade recente = grupos de acesso com entrega, os mais novos.
 */

const TZ = "America/Sao_Paulo";
const OFFSET = "-03:00"; // São Paulo, sem horário de verão desde 2019
const DAY_MS = 24 * 60 * 60 * 1000;
const tz = sql.raw(`'${TZ}'`);

export type HomeMetrics = {
  totalStudents: number;
  active7d: number;
  newThisMonth: number;
  newPrevMonth: number;
  newVariation: number | null;
  /** Cadastros por semana (8 janelas de 7 dias, a última termina agora). */
  weeklySignups: number[];
  accessesToday: number;
  chart: { labels: string[]; signups: number[]; enrollments: number[] };
  last4Weeks: number;
  prev4Weeks: number;
  last4Variation: number | null;
  attention: { saleErrors: number; productsWithoutOffer: number; neverAccessed: number };
  access30: { today: number; yesterday: number; d2to7: number; d8to14: number; d15to30: number };
  recent: { userId: number; name: string; deliveryName: string; at: Date }[];
};

/* ---------- textos ---------- */

function spParts(d: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<"year" | "month" | "day" | "hour", string>;
}

/** "Bom dia" (6h–11h), "Boa tarde" (12h–17h), "Boa noite" (18h–5h), em São Paulo. */
export function greeting(now: Date): "Bom dia" | "Boa tarde" | "Boa noite" {
  const h = Number(spParts(now).hour);
  if (h >= 6 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "Sexta-feira, 16 de outubro". */
export function homeDate(now: Date): string {
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Ana Maria Souza" → "Ana S."; um nome só fica como está. */
export function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/** Variação % arredondada; sem base (0), null (não mostra o selo). */
export function variation(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round((current / previous - 1) * 100);
}

/* ---------- consultas ---------- */

/** Meia-noite (São Paulo) do dia de `now` menos `daysAgo` dias. */
function startOfDay(now: Date, daysAgo = 0): Date {
  const p = spParts(now);
  return new Date(new Date(`${p.year}-${p.month}-${p.day}T00:00:00${OFFSET}`).getTime() - daysAgo * DAY_MS);
}
/** Meia-noite do dia 1º do mês de `now` (São Paulo), deslocado `monthsAgo` meses. */
function startOfMonth(now: Date, monthsAgo = 0): Date {
  const p = spParts(now);
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1 - monthsAgo, 1));
  return new Date(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00${OFFSET}`);
}

const isStudent = and(eq(users.role, "student"), isNull(users.deletedAt))!;
const num = (v: unknown) => Number(v ?? 0);
const between = (col: typeof users.createdAt | typeof users.lastAccessAt, from: Date, to?: Date): SQL =>
  to ? and(gte(col, from), lt(col, to))! : gte(col, from);
const countIf = (cond: SQL) => sql<number>`count(*) filter (where ${cond})`;

export async function getHomeMetrics(db: Database, actor: User | null, now: Date = new Date()): Promise<HomeMetrics> {
  assertAdmin(actor);
  const today = startOfDay(now);
  const day = (n: number) => startOfDay(now, n);
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const months = lastTwelveMonths(now);
  const windowStart = startOfMonth(now, 11);
  const monthOf = (col: SQL | typeof users.createdAt) => sql<string>`to_char(${col} at time zone ${tz}, 'YYYY-MM')`;

  const weekConds = Array.from({ length: 8 }, (_, i) => between(users.createdAt, ago((8 - i) * 7), i === 7 ? undefined : ago((7 - i) * 7)));

  // Um grupo por (aluno, venda), mesmo que a venda dê produtos e acesso completo: começa no menor início.
  const saleGroups = sql`(
    select user_id, sale_ref, min(started) as started from (
      select ${productAccess.userId} as user_id, ${productAccess.saleRef} as sale_ref, ${productAccess.startsAt} as started
        from ${productAccess} where ${productAccess.source} = 'sale'
      union all
      select ${fullAccess.userId}, ${fullAccess.saleRef}, ${fullAccess.startsAt}
        from ${fullAccess} where ${fullAccess.source} = 'sale'
    ) x group by 1, 2
  )`;

  const [[c], signupRows, enrollRows, [errors], [noOffer], recentRows] = await Promise.all([
    db
      .select({
        total: count(),
        active7d: countIf(gte(users.lastAccessAt, ago(7))),
        thisMonth: countIf(gte(users.createdAt, startOfMonth(now))),
        prevMonth: countIf(between(users.createdAt, startOfMonth(now, 1), startOfMonth(now))),
        today: countIf(gte(users.lastAccessAt, today)),
        never: countIf(isNull(users.lastAccessAt)),
        last4: countIf(gte(users.createdAt, ago(28))),
        prev4: countIf(between(users.createdAt, ago(56), ago(28))),
        a0: countIf(gte(users.lastAccessAt, today)),
        a1: countIf(between(users.lastAccessAt, day(1), today)),
        a2: countIf(between(users.lastAccessAt, day(7), day(1))),
        a3: countIf(between(users.lastAccessAt, day(14), day(7))),
        a4: countIf(between(users.lastAccessAt, day(30), day(14))),
        ...Object.fromEntries(weekConds.map((cond, i) => [`w${i}`, countIf(cond)])),
      })
      .from(users)
      .where(isStudent),
    db
      .select({ month: monthOf(users.createdAt), n: count() })
      .from(users)
      .where(and(isStudent, gte(users.createdAt, windowStart)))
      .groupBy(monthOf(users.createdAt)),
    db.execute<{ month: string; n: number }>(sql`
      select to_char(g.started at time zone ${tz}, 'YYYY-MM') as month, count(*) as n
        from ${saleGroups} g join ${users} u on u.id = g.user_id
       where u.role = 'student' and u.deleted_at is null and g.started >= ${windowStart.toISOString()}::timestamptz
       group by 1`),
    db.select({ n: count() }).from(sales).where(and(eq(sales.processing, "error"), isNull(sales.deletedAt))),
    db
      .select({ n: count() })
      .from(products)
      .innerJoin(showcases, eq(showcases.id, products.showcaseId))
      .where(
        and(
          isNull(products.deletedAt),
          isNull(showcases.deletedAt),
          eq(products.isFree, false),
          or(isNull(products.offerUrl), eq(sql`trim(${products.offerUrl})`, ""))!,
        ),
      ),
    db.execute<{ user_id: number; name: string; delivery_name: string; at: string | Date }>(sql`
      select g.user_id, u.name, d.name as delivery_name, g.at
        from (
          select user_id, delivery_id, sale_ref, max(starts_at) as at from (
            select ${productAccess.userId} as user_id, ${productAccess.deliveryId} as delivery_id, ${productAccess.saleRef} as sale_ref, ${productAccess.startsAt} as starts_at
              from ${productAccess} where ${productAccess.deliveryId} is not null
            union all
            select ${fullAccess.userId}, ${fullAccess.deliveryId}, ${fullAccess.saleRef}, ${fullAccess.startsAt}
              from ${fullAccess} where ${fullAccess.deliveryId} is not null
          ) x group by 1, 2, 3
        ) g
        join ${users} u on u.id = g.user_id
        join ${deliveries} d on d.id = g.delivery_id
       where u.role = 'student' and u.deleted_at is null and g.at <= ${now.toISOString()}::timestamptz
       order by g.at desc, g.user_id desc
       limit 8`),
  ]);

  const rowsOf = <T,>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : ((r as { rows: T[] }).rows ?? []));
  const signupBy = new Map(signupRows.map((r) => [r.month, num(r.n)]));
  const enrollBy = new Map(rowsOf<{ month: string; n: number }>(enrollRows).map((r) => [r.month, num(r.n)]));
  const row = c as unknown as Record<string, unknown>;

  const newThisMonth = num(row.thisMonth);
  const newPrevMonth = num(row.prevMonth);
  const last4Weeks = num(row.last4);
  const prev4Weeks = num(row.prev4);
  return {
    totalStudents: num(row.total),
    active7d: num(row.active7d),
    newThisMonth,
    newPrevMonth,
    newVariation: variation(newThisMonth, newPrevMonth),
    weeklySignups: weekConds.map((_, i) => num(row[`w${i}`])),
    accessesToday: num(row.today),
    chart: {
      labels: months.map((m) => MONTHS[Number(m.slice(5)) - 1]),
      signups: months.map((m) => signupBy.get(m) ?? 0),
      enrollments: months.map((m) => enrollBy.get(m) ?? 0),
    },
    last4Weeks,
    prev4Weeks,
    last4Variation: variation(last4Weeks, prev4Weeks),
    attention: { saleErrors: num(errors?.n), productsWithoutOffer: num(noOffer?.n), neverAccessed: num(row.never) },
    access30: { today: num(row.a0), yesterday: num(row.a1), d2to7: num(row.a2), d8to14: num(row.a3), d15to30: num(row.a4) },
    recent: rowsOf<{ user_id: number; name: string; delivery_name: string; at: string | Date }>(recentRows).map((r) => ({
      userId: num(r.user_id),
      name: abbreviateName(r.name),
      deliveryName: r.delivery_name,
      at: r.at instanceof Date ? r.at : new Date(r.at),
    })),
  };
}

