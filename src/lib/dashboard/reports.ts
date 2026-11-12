import { and, asc, count, countDistinct, eq, gt, gte, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import { fullAccess, lessonProgress, lessonReactions, lessonViews, lessons, modules, productAccess, products, showcases, users } from "@/db/schema";
import { assertAdmin } from "@/lib/admin/guard";
import type { User } from "@/lib/auth/sessions";
import { lessonThumbnailUrl } from "@/lib/content/video";

/**
 * Relatórios do painel (Alunos, Produtos e Aulas). Números em tempo real (consultas agregadas, sem N+1),
 * guardados 5 min em memória por instância com `reportCached`.
 *
 * Definições:
 * - aluno = `users.role = 'student'` não excluído (admins e excluídos não entram em nenhuma conta);
 * - faixas de acesso iguais aos filtros `access` da lista de alunos (`listStudents`);
 * - aulas de um produto = aulas publicadas e não excluídas de módulos publicados e não excluídos
 *   (a mesma base do progresso do aluno em `getProductProgress`);
 * - visualização = `lesson_views.views` (aberturas da aula, no máx. 1 a cada 30 min por aluno);
 *   aula completada = registro em `lesson_progress`;
 * - com acesso = acesso ao produto ativo (não revogado, já começou, não venceu) ou acesso completo
 *   ativo; produto grátis = todos os alunos.
 */

const TZ = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

export type AccessBucket = "active-7d" | "inactive-7-15d" | "inactive-15d" | "never-accessed";
export type StudentsReport = {
  total: number;
  buckets: { key: AccessBucket; count: number }[];
  /** 12 meses (o atual por último), em São Paulo: `month` "AAAA-MM", `label` "out". */
  signups: { month: string; label: string; count: number }[];
  signupsTotal: number;
};
export type ProductReportRow = {
  id: number;
  name: string;
  showcaseId: number;
  showcaseName: string;
  withProgress: number;
  withAccess: number;
  /** Progresso médio (0–100, inteiro) dos alunos com progresso. */
  progress: number;
  lessons: number;
};
export type ProductsReport = { rows: ProductReportRow[]; showcases: { id: number; name: string }[] };
export type LessonReportRow = { id: number; title: string; thumbnailUrl: string | null; views: number; likes: number; dislikes: number };
export type ProductLessonsReport = {
  product: { id: number; name: string };
  withProgress: number;
  withAccess: number;
  views: number;
  completed: number;
  /** Progresso médio com casas decimais (0–100). */
  avgProgress: number;
  likes: number;
  dislikes: number;
  modules: { id: number; title: string; lessons: LessonReportRow[] }[];
};

// ---------------------------------------------------------------- cache

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

/** Cache de 5 min por instância. Exige admin antes de devolver qualquer coisa; erros não ficam guardados. */
export async function reportCached<T>(actor: User | null, key: string, load: () => Promise<T>): Promise<T> {
  assertAdmin(actor);
  const nowMs = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > nowMs) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { expires: nowMs + CACHE_TTL_MS, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

export function clearReportCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------- bases comuns

const isStudent = and(eq(users.role, "student"), isNull(users.deletedAt))!;
const num = (v: unknown) => Number(v ?? 0);

/** Aulas que contam num produto (publicadas, de módulos publicados, nada excluído). */
const countedLesson = and(eq(modules.status, "published"), isNull(modules.deletedAt), eq(lessons.status, "published"), isNull(lessons.deletedAt))!;

function activeProductAccess(now: Date): SQL {
  return and(isNull(productAccess.revokedAt), lte(productAccess.startsAt, now), or(isNull(productAccess.expiresAt), gt(productAccess.expiresAt, now))!)!;
}
function activeFullAccess(now: Date): SQL {
  return and(isNull(fullAccess.revokedAt), lte(fullAccess.startsAt, now), or(isNull(fullAccess.expiresAt), gt(fullAccess.expiresAt, now))!)!;
}

/** Alunos com acesso completo ativo e, por produto, os com acesso ao produto que não têm o completo. */
async function accessCounts(db: Database, productIds: number[], now: Date) {
  const hasFull = sql`exists (select 1 from ${fullAccess} where ${fullAccess.userId} = ${users.id} and ${activeFullAccess(now)})`;
  const [[full], perProduct, [students]] = await Promise.all([
    db.select({ n: countDistinct(fullAccess.userId) }).from(fullAccess).innerJoin(users, eq(users.id, fullAccess.userId)).where(and(isStudent, activeFullAccess(now))),
    productIds.length
      ? db
          .select({ productId: productAccess.productId, n: countDistinct(productAccess.userId) })
          .from(productAccess)
          .innerJoin(users, eq(users.id, productAccess.userId))
          .where(and(isStudent, inArray(productAccess.productId, productIds), activeProductAccess(now), sql`not ${hasFull}`))
          .groupBy(productAccess.productId)
      : Promise.resolve([] as { productId: number; n: number }[]),
    db.select({ n: count() }).from(users).where(isStudent),
  ]);
  const byProduct = new Map(perProduct.map((r) => [r.productId, num(r.n)]));
  const fullN = num(full?.n);
  return (productId: number, isFree: boolean) => (isFree ? num(students?.n) : (byProduct.get(productId) ?? 0) + fullN);
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, (part / whole) * 100) : 0);

// ---------------------------------------------------------------- Alunos

/** "AAAA-MM" de `now` em São Paulo e dos 11 meses antes (ordem cronológica). */
export function lastTwelveMonths(now: Date): string[] {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year);
  const m = Number(parts.month) - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 11 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export async function getStudentsReport(db: Database, actor: User | null, now: Date = new Date()): Promise<StudentsReport> {
  assertAdmin(actor);
  const d7 = new Date(now.getTime() - 7 * DAY_MS);
  const d15 = new Date(now.getTime() - 15 * DAY_MS);
  const months = lastTwelveMonths(now);
  // Início do 1º mês da janela, à meia-noite de São Paulo.
  // Fuso literal (não parâmetro): o GROUP BY precisa da mesma expressão do SELECT.
  const tz = sql.raw(`'${TZ}'`);
  const start = sql`(${months[0] + "-01 00:00"}::timestamp at time zone ${tz})`;
  const monthOf = sql<string>`to_char(${users.createdAt} at time zone ${tz}, 'YYYY-MM')`;

  const [[b], perMonth] = await Promise.all([
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${gte(users.lastAccessAt, d7)})`,
        recent: sql<number>`count(*) filter (where ${and(lt(users.lastAccessAt, d7), gte(users.lastAccessAt, d15))})`,
        inactive: sql<number>`count(*) filter (where ${lt(users.lastAccessAt, d15)})`,
        never: sql<number>`count(*) filter (where ${isNull(users.lastAccessAt)})`,
      })
      .from(users)
      .where(isStudent),
    db
      .select({ month: monthOf, n: count() })
      .from(users)
      .where(and(isStudent, sql`${users.createdAt} >= ${start}`, lte(users.createdAt, now)))
      .groupBy(monthOf),
  ]);
  const byMonth = new Map(perMonth.map((r) => [r.month, num(r.n)]));
  const signups = months.map((month) => ({ month, label: MONTHS[Number(month.slice(5)) - 1], count: byMonth.get(month) ?? 0 }));
  return {
    total: num(b?.total),
    buckets: [
      { key: "active-7d", count: num(b?.active) },
      { key: "inactive-7-15d", count: num(b?.recent) },
      { key: "inactive-15d", count: num(b?.inactive) },
      { key: "never-accessed", count: num(b?.never) },
    ],
    signups,
    signupsTotal: signups.reduce((s, m) => s + m.count, 0),
  };
}

// ---------------------------------------------------------------- Produtos

export async function getProductsReport(db: Database, actor: User | null, now: Date = new Date()): Promise<ProductsReport> {
  assertAdmin(actor);
  const list = await db
    .select({ id: products.id, name: products.name, isFree: products.isFree, showcaseId: showcases.id, showcaseName: showcases.name })
    .from(products)
    .innerJoin(showcases, eq(showcases.id, products.showcaseId))
    .where(and(isNull(products.deletedAt), isNull(showcases.deletedAt)))
    .orderBy(asc(showcases.position), asc(showcases.id), asc(products.position), asc(products.id));
  const productIds = list.map((p) => p.id);
  if (productIds.length === 0) return { rows: [], showcases: [] };

  const [lessonCounts, progress, access] = await Promise.all([
    db
      .select({ productId: modules.productId, n: count(lessons.id) })
      .from(lessons)
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(and(countedLesson, inArray(modules.productId, productIds)))
      .groupBy(modules.productId),
    db
      .select({ productId: modules.productId, students: countDistinct(lessonProgress.userId), done: count() })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(users, eq(users.id, lessonProgress.userId))
      .where(and(countedLesson, isStudent, inArray(modules.productId, productIds)))
      .groupBy(modules.productId),
    accessCounts(db, productIds, now),
  ]);
  const lessonsBy = new Map(lessonCounts.map((r) => [r.productId, num(r.n)]));
  const progressBy = new Map(progress.map((r) => [r.productId, { students: num(r.students), done: num(r.done) }]));

  const rows = list.map((p) => {
    const n = lessonsBy.get(p.id) ?? 0;
    const pr = progressBy.get(p.id) ?? { students: 0, done: 0 };
    return {
      id: p.id,
      name: p.name,
      showcaseId: p.showcaseId,
      showcaseName: p.showcaseName,
      withProgress: pr.students,
      withAccess: access(p.id, p.isFree),
      progress: Math.round(pct(pr.done, pr.students * n)),
      lessons: n,
    };
  });
  const seen = new Map<number, string>();
  for (const p of list) if (!seen.has(p.showcaseId)) seen.set(p.showcaseId, p.showcaseName);
  return { rows, showcases: [...seen].map(([id, name]) => ({ id, name })) };
}

// ---------------------------------------------------------------- Aulas do produto

export async function getProductLessonsReport(db: Database, actor: User | null, productId: number, now: Date = new Date()): Promise<ProductLessonsReport | null> {
  assertAdmin(actor);
  const [product] = await db
    .select({ id: products.id, name: products.name, isFree: products.isFree })
    .from(products)
    .innerJoin(showcases, eq(showcases.id, products.showcaseId))
    .where(and(eq(products.id, productId), isNull(products.deletedAt), isNull(showcases.deletedAt)))
    .limit(1);
  if (!product) return null;

  const [rows, doneRows, viewRows, reactionRows, [students], access] = await Promise.all([
    db
      .select({ moduleId: modules.id, moduleTitle: modules.title, id: lessons.id, title: lessons.title, thumbnailUrl: lessons.thumbnailUrl, videoUrl: lessons.videoUrl })
      .from(lessons)
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(and(countedLesson, eq(modules.productId, productId)))
      .orderBy(asc(modules.position), asc(modules.id), asc(lessons.position), asc(lessons.id)),
    db
      .select({ lessonId: lessonProgress.lessonId, n: count() })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(users, eq(users.id, lessonProgress.userId))
      .where(and(countedLesson, isStudent, eq(modules.productId, productId)))
      .groupBy(lessonProgress.lessonId),
    db
      .select({ lessonId: lessonViews.lessonId, n: sql<number>`coalesce(sum(${lessonViews.views}), 0)` })
      .from(lessonViews)
      .innerJoin(lessons, eq(lessons.id, lessonViews.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(users, eq(users.id, lessonViews.userId))
      .where(and(countedLesson, isStudent, eq(modules.productId, productId)))
      .groupBy(lessonViews.lessonId),
    db
      .select({
        lessonId: lessonReactions.lessonId,
        likes: sql<number>`count(*) filter (where ${lessonReactions.value} = 1)`,
        dislikes: sql<number>`count(*) filter (where ${lessonReactions.value} = -1)`,
      })
      .from(lessonReactions)
      .innerJoin(lessons, eq(lessons.id, lessonReactions.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(users, eq(users.id, lessonReactions.userId))
      .where(and(countedLesson, isStudent, eq(modules.productId, productId)))
      .groupBy(lessonReactions.lessonId),
    db
      .select({ n: countDistinct(lessonProgress.userId) })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(users, eq(users.id, lessonProgress.userId))
      .where(and(countedLesson, isStudent, eq(modules.productId, productId))),
    accessCounts(db, [productId], now),
  ]);

  const viewsBy = new Map(viewRows.map((r) => [r.lessonId, num(r.n)]));
  const completed = doneRows.reduce((sum, r) => sum + num(r.n), 0);
  const reactionsBy = new Map(reactionRows.map((r) => [r.lessonId, { likes: num(r.likes), dislikes: num(r.dislikes) }]));

  const mods: ProductLessonsReport["modules"] = [];
  let views = 0;
  let likes = 0;
  let dislikes = 0;
  for (const r of rows) {
    const s = { views: viewsBy.get(r.id) ?? 0, ...(reactionsBy.get(r.id) ?? { likes: 0, dislikes: 0 }) };
    views += s.views;
    likes += s.likes;
    dislikes += s.dislikes;
    let mod = mods[mods.length - 1];
    if (!mod || mod.id !== r.moduleId) {
      mod = { id: r.moduleId, title: r.moduleTitle, lessons: [] };
      mods.push(mod);
    }
    mod.lessons.push({ id: r.id, title: r.title, thumbnailUrl: lessonThumbnailUrl(r.thumbnailUrl, r.videoUrl), ...s });
  }
  const withProgress = num(students?.n);
  return {
    product: { id: product.id, name: product.name },
    withProgress,
    withAccess: access(product.id, product.isFree),
    views,
    completed,
    avgProgress: pct(completed, withProgress * rows.length),
    likes,
    dislikes,
    modules: mods,
  };
}
