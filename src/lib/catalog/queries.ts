import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { resolveProductSettings } from "@/lib/settings";
import type { Database } from "@/db";
import {
  lessonProgress,
  lessons,
  modules,
  products,
  showcases,
  type Lesson,
  type Module,
  type Product,
} from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { getActiveAccessProductIds, hasActiveAccess, hasActiveAccessToProduct } from "./access";
import { buildOfferUrl } from "./offer";
import { activeScheduleIdSql, lockedLessonsOfProduct } from "./release";
import { needsTermsAcceptance } from "./terms";
import { lessonThumbnailUrl } from "@/lib/content/video";

export type CatalogProduct = {
  id: number;
  name: string;
  thumbnailUrl: string | null;
  locked: boolean;
  offerUrl: string | null;
  /** % de aulas vistas pelo aluno (0–100); null quando bloqueado ou sem aulas. */
  progress: number | null;
  /** Aulas visíveis vistas / total (0 quando bloqueado), para o título "N de M - X%" do trilho. */
  lessonsDone: number;
  lessonsTotal: number;
};
export type LessonSummary = {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  completed: boolean;
  /** Conteúdo programado: data em que a aula libera para este aluno; null = liberada. */
  lockedUntil: Date | null;
};
export type ModuleWithLessons = Module & { lessons: LessonSummary[] };

const isAdmin = (user: User) => user.role === "admin";

/**
 * Progresso do aluno em cada produto das vitrines, numa única consulta agregada:
 * aulas visíveis (mesmas regras da listagem) e quantas delas o aluno já marcou como vistas.
 */
async function progressOfShowcases(db: Database, user: User, showcaseIds: number[]) {
  const admin = isAdmin(user);
  const rows = await db
    .select({ productId: modules.productId, total: count(lessons.id), done: count(lessonProgress.lessonId) })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(products, eq(products.id, modules.productId))
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, user.id)))
    .where(
      and(
        inArray(products.showcaseId, showcaseIds),
        eq(products.status, "published"),
        isNull(products.deletedAt),
        isNull(modules.deletedAt),
        isNull(lessons.deletedAt),
        admin ? undefined : eq(modules.status, "published"),
        admin ? undefined : eq(lessons.status, "published"),
      ),
    )
    .groupBy(modules.productId);
  const counts = new Map<number, { done: number; total: number }>();
  for (const r of rows) counts.set(r.productId, { done: Number(r.done), total: Number(r.total) });
  return counts;
}

async function productsOfShowcases(db: Database, user: User, showcaseIds: number[]) {
  if (showcaseIds.length === 0) return new Map<number, CatalogProduct[]>();
  const [rows, active, progress] = await Promise.all([
    db
      .select()
      .from(products)
      .where(and(inArray(products.showcaseId, showcaseIds), eq(products.status, "published"), isNull(products.deletedAt)))
      .orderBy(asc(products.position), asc(products.id)),
    getActiveAccessProductIds(db, user.id),
    progressOfShowcases(db, user, showcaseIds),
  ]);
  const byShowcase = new Map<number, CatalogProduct[]>();
  for (const p of rows) {
    const locked = !(isAdmin(user) || p.isFree || active.has(p.id));
    const c = locked ? undefined : progress.get(p.id);
    const item: CatalogProduct = {
      id: p.id,
      name: p.name,
      thumbnailUrl: p.thumbnailUrl,
      locked,
      offerUrl: buildOfferUrl(p.offerUrl, user.email),
      progress: c && c.total > 0 ? Math.round((c.done / c.total) * 100) : null,
      lessonsDone: c?.done ?? 0,
      lessonsTotal: c?.total ?? 0,
    };
    const list = byShowcase.get(p.showcaseId) ?? [];
    list.push(item);
    byShowcase.set(p.showcaseId, list);
  }
  return byShowcase;
}

export async function getHomeCatalog(db: Database, user: User) {
  const rows = await db
    .select()
    .from(showcases)
    .where(and(eq(showcases.status, "published"), isNull(showcases.deletedAt)))
    .orderBy(asc(showcases.position), asc(showcases.id));
  const byShowcase = await productsOfShowcases(db, user, rows.map((s) => s.id));
  return rows.map((s) => ({ id: s.id, name: s.name, products: byShowcase.get(s.id) ?? [] }));
}

/** `scheduleId`: programação já lida junto com o produto (activeScheduleIdSql). */
async function loadModules(db: Database, user: User, productId: number, scheduleId: number | null): Promise<ModuleWithLessons[]> {
  const admin = isAdmin(user);
  const mods = await db
    .select()
    .from(modules)
    .where(and(eq(modules.productId, productId), isNull(modules.deletedAt), admin ? undefined : eq(modules.status, "published")))
    .orderBy(asc(modules.position), asc(modules.id));
  if (mods.length === 0) return [];
  const lessonRows = await db
    .select({
      id: lessons.id,
      moduleId: lessons.moduleId,
      title: lessons.title,
      thumbnailUrl: lessons.thumbnailUrl,
      videoUrl: lessons.videoUrl,
    })
    .from(lessons)
    .where(
      and(
        inArray(lessons.moduleId, mods.map((m) => m.id)),
        isNull(lessons.deletedAt),
        admin ? undefined : eq(lessons.status, "published"),
      ),
    )
    .orderBy(asc(lessons.position), asc(lessons.id));
  const done = lessonRows.length
    ? await db
        .select({ lessonId: lessonProgress.lessonId })
        .from(lessonProgress)
        .where(and(eq(lessonProgress.userId, user.id), inArray(lessonProgress.lessonId, lessonRows.map((l) => l.id))))
    : [];
  const doneIds = new Set(done.map((d) => d.lessonId));
  const locked = await lockedLessonsOfProduct(db, user, productId, lessonRows, new Date(), scheduleId);
  return mods.map((m) => ({
    ...m,
    lessons: lessonRows
      .filter((l) => l.moduleId === m.id)
      .map((l) => ({
        id: l.id,
        title: l.title,
        thumbnailUrl: lessonThumbnailUrl(l.thumbnailUrl, l.videoUrl),
        completed: doneIds.has(l.id),
        lockedUntil: locked.get(l.id) ?? null,
      })),
  }));
}

export async function getProductPage(
  db: Database,
  user: User,
  productId: number,
): Promise<{
  product: Product;
  modules: ModuleWithLessons[];
  locked: boolean;
  /** Termo do produto pendente: nada das aulas é carregado (a página manda para o termo). */
  needsTerms: boolean;
  offerUrl: string | null;
} | null> {
  const [row] = await db
    .select({ product: products, scheduleId: activeScheduleIdSql(products.id) })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)));
  if (!row) return null;
  const { product, scheduleId } = row;
  if (product.status === "hidden" && !isAdmin(user)) return null;
  const locked = !(await hasActiveAccessToProduct(db, user, product));
  const needsTerms = !locked && (await needsTermsAcceptance(db, user, product));
  return {
    product,
    // Produto bloqueado (ou com termo pendente) não expõe a lista de aulas.
    modules: locked || needsTerms ? [] : await loadModules(db, user, productId, scheduleId),
    locked,
    needsTerms,
    offerUrl: buildOfferUrl(product.offerUrl, user.email),
  };
}

export async function getFirstLessonIdOfModule(db: Database, user: User, moduleId: number): Promise<number | null> {
  const admin = isAdmin(user);
  const [mod] = await db
    .select()
    .from(modules)
    .where(and(eq(modules.id, moduleId), isNull(modules.deletedAt)));
  if (!mod || (mod.status === "hidden" && !admin)) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, mod.productId), isNull(products.deletedAt)));
  if (!product || (product.status === "hidden" && !admin)) return null;
  if (!(await hasActiveAccessToProduct(db, user, product))) return null;
  const [first] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt), admin ? undefined : eq(lessons.status, "published")))
    .orderBy(asc(lessons.position), asc(lessons.id))
    .limit(1);
  return first?.id ?? null;
}

/**
 * Destino de um link de módulo: primeira aula visível; produto visível mas sem acesso → a listagem
 * do produto (tela de oferta); módulo inexistente, oculto ou vazio → null.
 */
export async function getModuleEntry(
  db: Database,
  user: User,
  moduleId: number,
): Promise<{ lessonId: number; productId: number } | { lockedProductId: number } | null> {
  const lessonId = await getFirstLessonIdOfModule(db, user, moduleId);
  if (lessonId !== null) {
    const [mod] = await db.select({ productId: modules.productId }).from(modules).where(eq(modules.id, moduleId));
    return { lessonId, productId: mod.productId };
  }
  const [row] = await db
    .select({ moduleStatus: modules.status, productId: products.id, productStatus: products.status })
    .from(modules)
    .innerJoin(products, eq(products.id, modules.productId))
    .where(and(eq(modules.id, moduleId), isNull(modules.deletedAt), isNull(products.deletedAt)));
  if (!row || row.moduleStatus === "hidden" || row.productStatus === "hidden") return null;
  return (await hasActiveAccess(db, user, row.productId)) ? null : { lockedProductId: row.productId };
}

export type LessonPageResult =
  | {
      status: "ok";
      lesson: Lesson;
      product: Product;
      modules: ModuleWithLessons[];
      prevLessonId: number | null;
      nextLessonId: number | null;
      nextProduct: { id: number; name: string } | null;
      /** "Próximo módulo": primeira aula do próximo produto da mesma vitrine (null = não mostrar o botão). */
      nextModule: NextModule | null;
    }
  | { status: "locked"; productId: number; offerUrl: string | null }
  /** Termo do produto ainda não aceito: nada da aula. */
  | { status: "terms"; productId: number }
  /** Conteúdo programado ainda não liberado: só a data (nada da aula). */
  | { status: "scheduled"; productId: number; releaseAt: Date }
  | { status: "not_found" };

export type NextModule = { productId: number; name: string; lessonId: number };

/**
 * Próximo produto da MESMA vitrine (ordem das capas: posição, id) que tenha aula publicada, e a primeira
 * aula dele. Nunca sai da vitrine. Se o aluno não tem acesso a esse produto, não há botão (null).
 * Uma consulta (+ a de acessos, só para aluno em produto pago).
 */
async function nextModuleOfShowcase(db: Database, user: User, product: Product): Promise<NextModule | null> {
  const [row] = await db
    .select({ productId: products.id, name: products.name, isFree: products.isFree, lessonId: lessons.id })
    .from(products)
    .innerJoin(modules, eq(modules.productId, products.id))
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(products.showcaseId, product.showcaseId),
        sql`(${products.position}, ${products.id}) > (${product.position}, ${product.id})`,
        eq(products.status, "published"),
        isNull(products.deletedAt),
        eq(modules.status, "published"),
        isNull(modules.deletedAt),
        eq(lessons.status, "published"),
        isNull(lessons.deletedAt),
      ),
    )
    .orderBy(asc(products.position), asc(products.id), asc(modules.position), asc(modules.id), asc(lessons.position), asc(lessons.id))
    .limit(1);
  if (!row) return null;
  if (!(await hasActiveAccessToProduct(db, user, { id: row.productId, isFree: row.isFree }))) return null;
  return { productId: row.productId, name: row.name, lessonId: row.lessonId };
}

function readNextProductId(product: Product): number | null {
  return resolveProductSettings(product.settings).lesson.nextProductId;
}

export async function getLessonPage(db: Database, user: User, lessonId: number): Promise<LessonPageResult> {
  const admin = isAdmin(user);
  const [row] = await db
    .select({ lesson: lessons, module: modules, product: products, scheduleId: activeScheduleIdSql(products.id) })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(products, eq(products.id, modules.productId))
    .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt), isNull(modules.deletedAt), isNull(products.deletedAt)));
  if (!row) return { status: "not_found" };
  const { lesson, module: mod, product, scheduleId } = row;
  if (!admin && (lesson.status === "hidden" || mod.status === "hidden" || product.status === "hidden")) {
    return { status: "not_found" };
  }
  if (!(await hasActiveAccessToProduct(db, user, product))) {
    return { status: "locked", productId: product.id, offerUrl: buildOfferUrl(product.offerUrl, user.email) };
  }
  // Termo antes das aulas: a liberação (e a primeira visita de produto grátis) só depois do aceite.
  if (await needsTermsAcceptance(db, user, product)) return { status: "terms", productId: product.id };

  const [mods, nextModule] = await Promise.all([
    loadModules(db, user, product.id, scheduleId),
    nextModuleOfShowcase(db, user, product),
  ]);
  const flat = mods.flatMap((m) => m.lessons);
  // Já calculado em loadModules (a aula está em `flat`: ocultas/excluídas foram barradas antes; admin = null).
  const releaseAt = flat.find((l) => l.id === lesson.id)?.lockedUntil ?? null;
  if (releaseAt) return { status: "scheduled", productId: product.id, releaseAt };
  const idx = flat.findIndex((l) => l.id === lesson.id);
  const prevLessonId = idx > 0 ? flat[idx - 1].id : null;
  const nextLessonId = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1].id : null;

  let nextProduct: { id: number; name: string } | null = null;
  const nextId = readNextProductId(product);
  if (nextId !== null) {
    const [np] = await db
      .select({ id: products.id, name: products.name, status: products.status })
      .from(products)
      .where(and(eq(products.id, nextId), isNull(products.deletedAt)));
    if (np && (np.status === "published" || admin)) nextProduct = { id: np.id, name: np.name };
  }

  return { status: "ok", lesson, product, modules: mods, prevLessonId, nextLessonId, nextProduct, nextModule };
}
