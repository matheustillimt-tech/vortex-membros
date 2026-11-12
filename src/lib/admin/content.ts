import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { DEFAULT_PRODUCT_SETTINGS, resolveProductSettings } from "@/lib/settings";
import {
  lessons,
  modules,
  products,
  showcases,
  type Lesson,
  type Module,
  type Product,
  type ProductSettings,
} from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { safeHttpUrl, safeImageUrl } from "@/lib/theme";
import { blocksToHtml, cleanStoredBlocks } from "@/lib/content/editorjs";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";
import { AdminError } from "./errors";
import { assertAdmin } from "./guard";
import { LISTINGS, MAX_BUTTON_TEXT, NAVIGATIONS, parseHexColor, THUMBNAIL_FORMATS } from "./product-settings";
import { lessonThumbnailUrl } from "@/lib/content/video";

type Showcase = typeof showcases.$inferSelect;
export type TrashKind = "showcase" | "product" | "module" | "lesson";
export type ReorderKind = TrashKind;

const NOT_FOUND = "Não encontrado.";
const INVALID_ORDER = "Ordem inválida.";

// ---------- validação ----------

function cleanName(value: string, message = "Informe um nome."): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new AdminError(message);
  return v;
}
function checkEnum<const T extends readonly string[]>(value: unknown, allowed: T, message: string): T[number] {
  if (!allowed.includes(value as string)) throw new AdminError(message);
  return value as T[number];
}
/** string vazia/null → null; inválido → erro. */
function optionalUrl(value: string | null, check: (v: string | null) => string | null, message: string): string | null {
  if (value === null || value.trim() === "") return null;
  const ok = check(value);
  if (!ok) throw new AdminError(message);
  return ok;
}
function optionalText(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

// ---------- posições ----------

const TABLES = { showcase: showcases, product: products, module: modules, lesson: lessons } as const;
const PARENT_COL = {
  showcase: showcases.parentId,
  product: products.showcaseId,
  module: modules.productId,
  lesson: lessons.moduleId,
} as const;

type Row = { id: number; position: number };

/** Filhos não excluídos de um pai, na ordem atual. */
async function activeChildren(db: Database, kind: ReorderKind, parentId: number | null): Promise<Row[]> {
  const t = TABLES[kind];
  const col = PARENT_COL[kind];
  return db
    .select({ id: t.id, position: t.position })
    .from(t)
    .where(and(parentId === null ? isNull(col) : eq(col, parentId), isNull(t.deletedAt)))
    .orderBy(asc(t.position), asc(t.id));
}

async function nextPosition(db: Database, kind: ReorderKind, parentId: number | null): Promise<number> {
  const rows = await activeChildren(db, kind, parentId);
  return rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.position)) + 1;
}

async function writePositions(db: Database, kind: ReorderKind, orderedIds: number[]) {
  const t = TABLES[kind];
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(t).set({ position: i }).where(eq(t.id, orderedIds[i]));
  }
}

async function exists(db: Database, kind: ReorderKind, id: number, includeDeleted = false): Promise<boolean> {
  const t = TABLES[kind];
  const [row] = await db
    .select({ id: t.id })
    .from(t)
    .where(includeDeleted ? eq(t.id, id) : and(eq(t.id, id), isNull(t.deletedAt)));
  return !!row;
}
async function requireExists(db: Database, kind: ReorderKind, id: number) {
  if (!(await exists(db, kind, id))) throw new AdminError(NOT_FOUND);
}

/**
 * Reordena os filhos de um pai. `orderedIds` precisa cobrir exatamente os filhos não excluídos
 * (sem repetir, sem faltar, sem ids de outro pai); senão nada é gravado.
 */
export async function reorder(
  db: Database,
  actor: User | null,
  kind: ReorderKind,
  parentId: number | null,
  orderedIds: number[],
): Promise<void> {
  assertAdmin(actor);
  if (!(kind in TABLES)) throw new AdminError(INVALID_ORDER);
  if (kind !== "showcase" && parentId === null) throw new AdminError(INVALID_ORDER);
  if (!Array.isArray(orderedIds) || !orderedIds.every((n) => Number.isSafeInteger(n))) throw new AdminError(INVALID_ORDER);
  await db.transaction(async (tx) => {
    // Trava a linha do pai (FOR UPDATE) para serializar reordenações/criações concorrentes; vitrines de topo não têm pai.
    if (parentId !== null) {
      const parentTable = { showcase: showcases, product: showcases, module: products, lesson: modules }[kind];
      await tx.select({ id: parentTable.id }).from(parentTable).where(eq(parentTable.id, parentId)).for("update");
    }
    const current = await activeChildren(tx as unknown as Database, kind, parentId);
    const wanted = new Set(orderedIds);
    if (
      wanted.size !== orderedIds.length ||
      wanted.size !== current.length ||
      !current.every((r) => wanted.has(r.id))
    ) {
      throw new AdminError(INVALID_ORDER);
    }
    await writePositions(tx as unknown as Database, kind, orderedIds);
  });
}

// ---------- vitrines ----------

export async function createShowcase(
  db: Database,
  actor: User | null,
  input: { name: string; parentId?: number | null },
): Promise<{ id: number }> {
  assertAdmin(actor);
  const name = cleanName(input.name);
  const parentId = input.parentId ?? null;
  if (parentId !== null) await requireExists(db, "showcase", parentId);
  const [row] = await db
    .insert(showcases)
    .values({ name, parentId, status: "published", position: await nextPosition(db, "showcase", parentId) })
    .returning({ id: showcases.id });
  return row;
}

export async function updateShowcase(
  db: Database,
  actor: User | null,
  id: number,
  patch: { name?: string; status?: Showcase["status"] },
): Promise<void> {
  assertAdmin(actor);
  const set: Partial<typeof showcases.$inferInsert> = {};
  if (patch.name !== undefined) set.name = cleanName(patch.name);
  if (patch.status !== undefined) set.status = checkEnum(patch.status, ["published", "unlisted"], "Status inválido.");
  await requireExists(db, "showcase", id);
  if (Object.keys(set).length) await db.update(showcases).set(set).where(eq(showcases.id, id));
}

async function setDeleted(db: Database, kind: TrashKind, id: number, deleted: boolean) {
  const t = TABLES[kind];
  if (!(await exists(db, kind, id, true))) throw new AdminError(NOT_FOUND);
  await db.update(t).set({ deletedAt: deleted ? new Date() : null }).where(eq(t.id, id));
}

export async function trashShowcase(db: Database, actor: User | null, id: number) {
  assertAdmin(actor);
  await setDeleted(db, "showcase", id, true);
}
export async function restoreShowcase(db: Database, actor: User | null, id: number) {
  assertAdmin(actor);
  await setDeleted(db, "showcase", id, false);
}

async function copyModules(db: Database, fromProductId: number, toProductId: number) {
  const mods = await db
    .select()
    .from(modules)
    .where(and(eq(modules.productId, fromProductId), isNull(modules.deletedAt)))
    .orderBy(asc(modules.position), asc(modules.id));
  for (const m of mods) {
    const [nm] = await db
      .insert(modules)
      .values({ productId: toProductId, title: m.title, coverUrl: m.coverUrl, position: m.position, status: m.status })
      .returning({ id: modules.id });
    const ls = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.moduleId, m.id), isNull(lessons.deletedAt)))
      .orderBy(asc(lessons.position), asc(lessons.id));
    for (const l of ls) {
      await db.insert(lessons).values({
        moduleId: nm.id,
        title: l.title,
        videoUrl: l.videoUrl,
        contentHtml: l.contentHtml,
        contentBlocks: l.contentBlocks,
        summary: l.summary,
        thumbnailUrl: l.thumbnailUrl,
        format: l.format,
        liveUrl: l.liveUrl,
        position: l.position,
        status: l.status,
      });
    }
  }
}

async function copyProduct(db: Database, source: Product, showcaseId: number, position: number, name: string) {
  const [np] = await db
    .insert(products)
    .values({
      showcaseId,
      name,
      thumbnailUrl: source.thumbnailUrl,
      accentColor: source.accentColor,
      status: source.status,
      isFree: source.isFree,
      offerUrl: source.offerUrl,
      defaultAccessDays: source.defaultAccessDays,
      termsHtml: source.termsHtml,
      termsEnabled: source.termsEnabled,
      position,
      settings: source.settings,
    })
    .returning({ id: products.id });
  await copyModules(db, source.id, np.id);
  return np;
}

export async function duplicateShowcase(db: Database, actor: User | null, id: number): Promise<{ id: number }> {
  assertAdmin(actor);
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [source] = await tx.select().from(showcases).where(and(eq(showcases.id, id), isNull(showcases.deletedAt)));
    if (!source) throw new AdminError(NOT_FOUND);
    const [copy] = await tx
      .insert(showcases)
      .values({
        name: `${source.name} (cópia)`,
        parentId: source.parentId,
        status: source.status,
        position: await nextPosition(tx, "showcase", source.parentId),
      })
      .returning({ id: showcases.id });
    const ps = await tx
      .select()
      .from(products)
      .where(and(eq(products.showcaseId, id), isNull(products.deletedAt)))
      .orderBy(asc(products.position), asc(products.id));
    for (const p of ps) await copyProduct(tx, p, copy.id, p.position, p.name);
    return copy;
  });
}

// ---------- produtos ----------

export type ProductPatch = {
  name?: string;
  thumbnailUrl?: string | null;
  accentColor?: string | null;
  status?: Product["status"];
  isFree?: boolean;
  offerUrl?: string | null;
  defaultAccessDays?: number | null;
  termsEnabled?: boolean;
  termsHtml?: string | null;
  /** Dados do Editor.js do termo; o `termsHtml` é gerado daqui (blocksToHtml + sanitize). */
  termsBlocks?: unknown;
  settings?: { [K in keyof ProductSettings]?: K extends "lesson" ? Partial<ProductSettings["lesson"]> : ProductSettings[K] };
};

export async function createProduct(
  db: Database,
  actor: User | null,
  input: { showcaseId: number; name: string },
): Promise<{ id: number }> {
  assertAdmin(actor);
  const name = cleanName(input.name);
  await requireExists(db, "showcase", input.showcaseId);
  const [row] = await db
    .insert(products)
    .values({
      showcaseId: input.showcaseId,
      name,
      status: "published",
      settings: structuredClone(DEFAULT_PRODUCT_SETTINGS),
      position: await nextPosition(db, "product", input.showcaseId),
    })
    .returning({ id: products.id });
  return row;
}

/** Mescla só chaves conhecidas (nunca copia __proto__/constructor) sobre as configurações já resolvidas. */
function mergeSettings(current: ProductSettings, patch: unknown): ProductSettings {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return current;
  const out: Record<string, unknown> = { ...current };
  const p = patch as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PRODUCT_SETTINGS)) {
    if (!Object.hasOwn(p, key) || p[key] === undefined) continue;
    if (key === "lesson") {
      const lp = p.lesson;
      if (typeof lp !== "object" || lp === null) continue;
      const lesson: Record<string, unknown> = { ...current.lesson };
      for (const lk of Object.keys(DEFAULT_PRODUCT_SETTINGS.lesson)) {
        if (Object.hasOwn(lp, lk) && (lp as Record<string, unknown>)[lk] !== undefined) lesson[lk] = (lp as Record<string, unknown>)[lk];
      }
      out.lesson = lesson;
    } else {
      out[key] = p[key];
    }
  }
  return out as ProductSettings;
}

/** Segunda barreira (além do parse do formulário): valores das configurações já mescladas. */
async function checkSettings(db: Database, productId: number, s: ProductSettings, nextChanged: boolean) {
  const bad = () => new AdminError("Configuração inválida.");
  if (!LISTINGS.includes(s.listing) || !THUMBNAIL_FORMATS.includes(s.thumbnailFormat) || !NAVIGATIONS.includes(s.lesson.navigation))
    throw bad();
  const bools = [s.modulesAsCarousel, s.showModuleTitles, s.showBanner, ...Object.entries(s.lesson).filter(([k]) => !["navigation", "nextProductId", "nextProductButtonText"].includes(k)).map(([, v]) => v)];
  if (bools.some((v) => typeof v !== "boolean")) throw bad();
  if (s.bannerUrl !== null && (typeof s.bannerUrl !== "string" || safeImageUrl(s.bannerUrl) !== s.bannerUrl)) throw new AdminError("Endereço de imagem inválido.");
  const text = s.lesson.nextProductButtonText;
  if (text !== null && (typeof text !== "string" || text.length > MAX_BUTTON_TEXT)) throw bad();
  const next = s.lesson.nextProductId;
  if (next !== null && nextChanged) {
    if (!Number.isSafeInteger(next) || next === productId) throw new AdminError("Produto sugerido inválido.");
    if (!(await exists(db, "product", next))) throw new AdminError("Produto sugerido inválido.");
  }
}

export async function updateProduct(db: Database, actor: User | null, id: number, patch: ProductPatch): Promise<void> {
  assertAdmin(actor);
  const [current] = await db.select().from(products).where(and(eq(products.id, id), isNull(products.deletedAt)));
  if (!current) throw new AdminError(NOT_FOUND);
  const set: Partial<typeof products.$inferInsert> = {};
  if (patch.name !== undefined) set.name = cleanName(patch.name);
  if (patch.thumbnailUrl !== undefined)
    set.thumbnailUrl = optionalUrl(patch.thumbnailUrl, safeImageUrl, "Endereço de imagem inválido.");
  if (patch.accentColor !== undefined) set.accentColor = parseHexColor(patch.accentColor);
  if (patch.status !== undefined) set.status = checkEnum(patch.status, ["published", "hidden"], "Status inválido.");
  if (patch.isFree !== undefined) set.isFree = !!patch.isFree;
  if (patch.offerUrl !== undefined) set.offerUrl = optionalUrl(patch.offerUrl, safeHttpUrl, "Endereço da oferta inválido.");
  if (patch.defaultAccessDays !== undefined) {
    const d = patch.defaultAccessDays;
    if (d !== null && (!Number.isInteger(d) || d < 1 || d > 36500)) throw new AdminError("Dias de acesso inválidos.");
    set.defaultAccessDays = d;
  }
  if (patch.termsEnabled !== undefined) set.termsEnabled = !!patch.termsEnabled;
  if (patch.termsHtml !== undefined) set.termsHtml = optionalText(sanitizeLessonHtml(patch.termsHtml ?? "").trim());
  if (patch.termsBlocks !== undefined) {
    const data = patch.termsBlocks;
    if (!data || typeof data !== "object" || !Array.isArray((data as { blocks?: unknown }).blocks))
      throw new AdminError("Conteúdo inválido.");
    set.termsHtml = optionalText(sanitizeLessonHtml(blocksToHtml(data)).trim());
  }
  if (patch.settings !== undefined) {
    const merged = mergeSettings(resolveProductSettings(current.settings), patch.settings);
    const nextChanged = patch.settings.lesson?.nextProductId !== undefined;
    await checkSettings(db, id, merged, nextChanged);
    set.settings = merged;
  }
  if (Object.keys(set).length) await db.update(products).set(set).where(eq(products.id, id));
}

export async function trashProduct(db: Database, actor: User | null, id: number) {
  assertAdmin(actor);
  await setDeleted(db, "product", id, true);
}
export async function restoreProduct(db: Database, actor: User | null, id: number) {
  assertAdmin(actor);
  await setDeleted(db, "product", id, false);
}

export async function duplicateProduct(
  db: Database,
  actor: User | null,
  id: number,
  targetShowcaseId?: number,
): Promise<{ id: number }> {
  assertAdmin(actor);
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [source] = await tx.select().from(products).where(and(eq(products.id, id), isNull(products.deletedAt)));
    if (!source) throw new AdminError(NOT_FOUND);
    const showcaseId = targetShowcaseId ?? source.showcaseId;
    await requireExists(tx, "showcase", showcaseId);
    return copyProduct(tx, source, showcaseId, await nextPosition(tx, "product", showcaseId), `${source.name} (cópia)`);
  });
}

export async function moveProduct(
  db: Database,
  actor: User | null,
  id: number,
  showcaseId: number,
  position: number,
): Promise<void> {
  assertAdmin(actor);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [product] = await tx.select().from(products).where(and(eq(products.id, id), isNull(products.deletedAt)));
    if (!product) throw new AdminError(NOT_FOUND);
    await requireExists(tx, "showcase", showcaseId);
    const from = (await activeChildren(tx, "product", product.showcaseId)).map((r) => r.id).filter((x) => x !== id);
    const target =
      showcaseId === product.showcaseId
        ? from
        : (await activeChildren(tx, "product", showcaseId)).map((r) => r.id);
    const at = Math.max(0, Math.min(Number.isFinite(position) ? Math.trunc(position) : target.length, target.length));
    target.splice(at, 0, id);
    await tx.update(products).set({ showcaseId }).where(eq(products.id, id));
    if (showcaseId !== product.showcaseId) await writePositions(tx, "product", from);
    await writePositions(tx, "product", target);
  });
}

// ---------- módulos ----------

export async function createModule(
  db: Database,
  actor: User | null,
  input: { productId: number; title: string },
): Promise<{ id: number }> {
  assertAdmin(actor);
  const title = cleanName(input.title, "Informe um título.");
  await requireExists(db, "product", input.productId);
  const [row] = await db
    .insert(modules)
    .values({ productId: input.productId, title, status: "published", position: await nextPosition(db, "module", input.productId) })
    .returning({ id: modules.id });
  return row;
}

export async function updateModule(
  db: Database,
  actor: User | null,
  id: number,
  patch: { title?: string; coverUrl?: string | null; status?: Module["status"] },
): Promise<void> {
  assertAdmin(actor);
  await requireExists(db, "module", id);
  const set: Partial<typeof modules.$inferInsert> = {};
  if (patch.title !== undefined) set.title = cleanName(patch.title, "Informe um título.");
  if (patch.coverUrl !== undefined) set.coverUrl = optionalUrl(patch.coverUrl, safeImageUrl, "Endereço de imagem inválido.");
  if (patch.status !== undefined) set.status = checkEnum(patch.status, ["published", "hidden"], "Status inválido.");
  if (Object.keys(set).length) await db.update(modules).set(set).where(eq(modules.id, id));
}

export async function trashModule(db: Database, actor: User | null, id: number) {
  assertAdmin(actor);
  await setDeleted(db, "module", id, true);
}
export async function restoreModule(db: Database, actor: User | null, id: number) {
  assertAdmin(actor);
  await setDeleted(db, "module", id, false);
}

// ---------- aulas ----------

export async function createLesson(
  db: Database,
  actor: User | null,
  input: { moduleId: number; title: string },
): Promise<{ id: number }> {
  assertAdmin(actor);
  const title = cleanName(input.title, "Informe um título.");
  await requireExists(db, "module", input.moduleId);
  const [row] = await db
    .insert(lessons)
    .values({ moduleId: input.moduleId, title, status: "published", position: await nextPosition(db, "lesson", input.moduleId) })
    .returning({ id: lessons.id });
  return row;
}

export type LessonPatch = {
  title?: string;
  videoUrl?: string | null;
  /** Dados do Editor.js (`{ blocks: [...] }`). O `contentHtml` é sempre gerado daqui (blocksToHtml), nunca recebido. */
  contentBlocks?: unknown;
  summary?: string | null;
  thumbnailUrl?: string | null;
  format?: Lesson["format"];
  liveUrl?: string | null;
  status?: Lesson["status"];
};

export async function updateLesson(db: Database, actor: User | null, id: number, patch: LessonPatch): Promise<void> {
  assertAdmin(actor);
  await requireExists(db, "lesson", id);
  const set: Partial<typeof lessons.$inferInsert> = {};
  if (patch.title !== undefined) set.title = cleanName(patch.title, "Informe um título.");
  if (patch.videoUrl !== undefined) set.videoUrl = optionalText(patch.videoUrl?.trim() ?? null);
  if (patch.contentBlocks !== undefined) {
    const data = patch.contentBlocks;
    if (!data || typeof data !== "object" || !Array.isArray((data as { blocks?: unknown }).blocks))
      throw new AdminError("Conteúdo inválido.");
    set.contentBlocks = cleanStoredBlocks(data);
    set.contentHtml = blocksToHtml(data);
  }
  if (patch.summary !== undefined) set.summary = optionalText(patch.summary);
  if (patch.thumbnailUrl !== undefined)
    set.thumbnailUrl = optionalUrl(patch.thumbnailUrl, safeImageUrl, "Endereço de imagem inválido.");
  if (patch.format !== undefined) set.format = checkEnum(patch.format, ["standard", "live"], "Formato inválido.");
  if (patch.liveUrl !== undefined) set.liveUrl = optionalUrl(patch.liveUrl, safeHttpUrl, "Endereço da transmissão inválido.");
  if (patch.status !== undefined) set.status = checkEnum(patch.status, ["published", "hidden"], "Status inválido.");
  if (Object.keys(set).length) await db.update(lessons).set(set).where(eq(lessons.id, id));
}

export async function trashLesson(db: Database, actor: User | null, id: number) {
  assertAdmin(actor);
  await setDeleted(db, "lesson", id, true);
}
/** Restaura a aula; se o módulo dela também está na lixeira, restaura o módulo junto (senão a aula ficaria invisível). */
export async function restoreLesson(db: Database, actor: User | null, id: number) {
  assertAdmin(actor);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [row] = await tx
      .select({ moduleId: lessons.moduleId, moduleDeletedAt: modules.deletedAt })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(lessons.id, id));
    if (!row) throw new AdminError(NOT_FOUND);
    await tx.update(lessons).set({ deletedAt: null }).where(eq(lessons.id, id));
    if (row.moduleDeletedAt) await tx.update(modules).set({ deletedAt: null }).where(eq(modules.id, row.moduleId));
  });
}

// ---------- lixeira ----------

export async function listTrash(db: Database, actor: User | null, kind: "showcase"): Promise<Showcase[]>;
export async function listTrash(db: Database, actor: User | null, kind: "product"): Promise<Product[]>;
export async function listTrash(db: Database, actor: User | null, kind: "module"): Promise<Module[]>;
export async function listTrash(db: Database, actor: User | null, kind: "lesson"): Promise<Lesson[]>;
export async function listTrash(db: Database, actor: User | null, kind: TrashKind): Promise<unknown[]>;
export async function listTrash(db: Database, actor: User | null, kind: TrashKind): Promise<unknown[]> {
  assertAdmin(actor);
  if (!(kind in TABLES)) throw new AdminError("Tipo inválido.");
  const t = TABLES[kind];
  return db.select().from(t).where(isNotNull(t.deletedAt)).orderBy(desc(t.deletedAt), desc(t.id));
}

// ---------- árvore da tela Produtos ----------

export type AdminProductRow = {
  id: number;
  showcaseId: number;
  name: string;
  thumbnailUrl: string | null;
  status: Product["status"];
  isFree: boolean;
  termsEnabled: boolean;
  lessonCount: number;
  /** Tem URL de oferta (para onde vai quem não tem acesso). */
  hasOffer: boolean;
};
export type AdminShowcaseNode = {
  id: number;
  parentId: number | null;
  name: string;
  status: Showcase["status"];
  products: AdminProductRow[];
  children: AdminShowcaseNode[];
};

/**
 * Vitrines (com subvitrines) e produtos não excluídos, na ordem de `position`, com a contagem de aulas
 * (aulas e módulos não excluídos). Itens dentro de uma vitrine excluída não aparecem.
 */
export async function listShowcaseTree(db: Database, actor: User | null): Promise<AdminShowcaseNode[]> {
  assertAdmin(actor);
  const [ss, ps, counts] = await Promise.all([
    db.select().from(showcases).where(isNull(showcases.deletedAt)).orderBy(asc(showcases.position), asc(showcases.id)),
    db.select().from(products).where(isNull(products.deletedAt)).orderBy(asc(products.position), asc(products.id)),
    db
      .select({ productId: modules.productId, n: count(lessons.id) })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(and(isNull(lessons.deletedAt), isNull(modules.deletedAt)))
      .groupBy(modules.productId),
  ]);
  const lessonCount = new Map(counts.map((r) => [r.productId, Number(r.n)]));
  const nodes = new Map<number, AdminShowcaseNode>(
    ss.map((s) => [s.id, { id: s.id, parentId: s.parentId, name: s.name, status: s.status, products: [], children: [] }]),
  );
  for (const p of ps) {
    nodes.get(p.showcaseId)?.products.push({
      id: p.id,
      showcaseId: p.showcaseId,
      name: p.name,
      thumbnailUrl: p.thumbnailUrl,
      status: p.status,
      isFree: p.isFree,
      termsEnabled: p.termsEnabled,
      lessonCount: lessonCount.get(p.id) ?? 0,
      hasOffer: !!p.offerUrl,
    });
  }
  const roots: AdminShowcaseNode[] = [];
  for (const s of ss) {
    const node = nodes.get(s.id)!;
    if (s.parentId === null) roots.push(node);
    else nodes.get(s.parentId)?.children.push(node); // pai excluído → some junto
  }
  return roots;
}

// ---------- árvore do produto (aba Aulas) ----------

export type AdminLessonRow = { id: number; moduleId: number; title: string; thumbnailUrl: string | null; status: Lesson["status"] };
export type AdminModuleNode = {
  id: number;
  title: string;
  coverUrl: string | null;
  status: Module["status"];
  lessons: AdminLessonRow[];
};
export type AdminProductTree = {
  product: { id: number; name: string; status: Product["status"]; showcaseId: number };
  modules: AdminModuleNode[];
};

/** Produto (não excluído) com módulos e aulas não excluídos, na ordem de `position`. */
export async function getProductTree(db: Database, actor: User | null, productId: number): Promise<AdminProductTree> {
  assertAdmin(actor);
  const [p] = await db
    .select({ id: products.id, name: products.name, status: products.status, showcaseId: products.showcaseId })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)));
  if (!p) throw new AdminError(NOT_FOUND);
  const mods = await db
    .select({ id: modules.id, title: modules.title, coverUrl: modules.coverUrl, status: modules.status })
    .from(modules)
    .where(and(eq(modules.productId, productId), isNull(modules.deletedAt)))
    .orderBy(asc(modules.position), asc(modules.id));
  const ls = mods.length
    ? await db
        .select({
          id: lessons.id,
          moduleId: lessons.moduleId,
          title: lessons.title,
          thumbnailUrl: lessons.thumbnailUrl,
          videoUrl: lessons.videoUrl,
          status: lessons.status,
        })
        .from(lessons)
        .where(and(inArray(lessons.moduleId, mods.map((m) => m.id)), isNull(lessons.deletedAt)))
        .orderBy(asc(lessons.position), asc(lessons.id))
    : [];
  return {
    product: p,
    modules: mods.map((m) => ({
      ...m,
      lessons: ls
        .filter((l) => l.moduleId === m.id)
        .map(({ videoUrl, ...l }) => ({ ...l, thumbnailUrl: lessonThumbnailUrl(l.thumbnailUrl, videoUrl) })),
    })),
  };
}

/** Módulos e aulas excluídos deste produto (Lixeira da aba Aulas). Aulas de módulo excluído também aparecem. */
export async function listProductTrash(db: Database, actor: User | null, productId: number) {
  assertAdmin(actor);
  const trashedModules = await db
    .select({ id: modules.id, title: modules.title, deletedAt: modules.deletedAt })
    .from(modules)
    .where(and(eq(modules.productId, productId), isNotNull(modules.deletedAt)))
    .orderBy(desc(modules.deletedAt), desc(modules.id));
  const trashedLessons = await db
    .select({ id: lessons.id, title: lessons.title, deletedAt: lessons.deletedAt, moduleTitle: modules.title })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(and(eq(modules.productId, productId), isNotNull(lessons.deletedAt)))
    .orderBy(desc(lessons.deletedAt), desc(lessons.id));
  return { modules: trashedModules, lessons: trashedLessons };
}

/**
 * Move uma aula para outro módulo **do mesmo produto** (ou para outra posição no mesmo módulo).
 * Módulo de outro produto, excluído ou inexistente → "Ordem inválida." sem alterar nada.
 */
export async function moveLesson(
  db: Database,
  actor: User | null,
  id: number,
  moduleId: number,
  position: number,
): Promise<void> {
  assertAdmin(actor);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [lesson] = await tx
      .select({ id: lessons.id, moduleId: lessons.moduleId, productId: modules.productId })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(and(eq(lessons.id, id), isNull(lessons.deletedAt)));
    if (!lesson) throw new AdminError(NOT_FOUND);
    const [target] = await tx
      .select({ id: modules.id, productId: modules.productId })
      .from(modules)
      .where(and(eq(modules.id, moduleId), isNull(modules.deletedAt)))
      .for("update");
    if (!target || target.productId !== lesson.productId) throw new AdminError(INVALID_ORDER);
    const from = (await activeChildren(tx, "lesson", lesson.moduleId)).map((r) => r.id).filter((x) => x !== id);
    const list = moduleId === lesson.moduleId ? from : (await activeChildren(tx, "lesson", moduleId)).map((r) => r.id);
    const at = Math.max(0, Math.min(Number.isFinite(position) ? Math.trunc(position) : list.length, list.length));
    list.splice(at, 0, id);
    await tx.update(lessons).set({ moduleId }).where(eq(lessons.id, id));
    if (moduleId !== lesson.moduleId) await writePositions(tx, "lesson", from);
    await writePositions(tx, "lesson", list);
  });
}

/** "Publicar tudo": produto, módulos e aulas (não excluídos) passam a `published`. */
export async function publishAll(db: Database, actor: User | null, productId: number): Promise<void> {
  assertAdmin(actor);
  await requireExists(db, "product", productId);
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    await tx.update(products).set({ status: "published" }).where(eq(products.id, productId));
    await tx
      .update(modules)
      .set({ status: "published" })
      .where(and(eq(modules.productId, productId), isNull(modules.deletedAt)));
    // Aulas de módulos na lixeira ficam como estão (voltam com o status de antes ao restaurar).
    const mods = await tx
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.productId, productId), isNull(modules.deletedAt)));
    if (mods.length)
      await tx
        .update(lessons)
        .set({ status: "published" })
        .where(and(inArray(lessons.moduleId, mods.map((m) => m.id)), isNull(lessons.deletedAt)));
  });
}

// ---------- editor de aula ----------

export type AdminLessonEdit = Pick<
  Lesson,
  "id" | "moduleId" | "title" | "videoUrl" | "contentBlocks" | "contentHtml" | "summary" | "thumbnailUrl" | "format" | "liveUrl" | "status"
>;

/** Aula (não excluída, em módulo não excluído) **deste produto**; senão "Não encontrado.". */
export async function getLessonForEdit(db: Database, actor: User | null, productId: number, lessonId: number): Promise<AdminLessonEdit> {
  assertAdmin(actor);
  const [row] = await db
    .select({
      id: lessons.id,
      moduleId: lessons.moduleId,
      title: lessons.title,
      videoUrl: lessons.videoUrl,
      contentBlocks: lessons.contentBlocks,
      contentHtml: lessons.contentHtml,
      summary: lessons.summary,
      thumbnailUrl: lessons.thumbnailUrl,
      format: lessons.format,
      liveUrl: lessons.liveUrl,
      status: lessons.status,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(and(eq(lessons.id, lessonId), eq(modules.productId, productId), isNull(lessons.deletedAt), isNull(modules.deletedAt)));
  if (!row) throw new AdminError(NOT_FOUND);
  // O editor monta isso com innerHTML no navegador do admin: o mesmo sanitizador da área do aluno
  // (que é o que o aluno vê) no HTML antigo, e o texto dos blocos guardados pelo inlineHtml.
  return { ...row, contentHtml: sanitizeLessonHtml(row.contentHtml), contentBlocks: cleanStoredBlocks(row.contentBlocks) };
}

// ---------- configurações do produto ----------

export type AdminProductSettingsEdit = Pick<
  Product,
  "id" | "name" | "thumbnailUrl" | "accentColor" | "isFree" | "offerUrl" | "defaultAccessDays" | "termsEnabled" | "termsHtml"
> & { settings: ProductSettings };

/** Produto (não excluído) com as configurações já resolvidas (padrões + o que foi salvo). */
export async function getProductSettingsForEdit(db: Database, actor: User | null, productId: number): Promise<AdminProductSettingsEdit> {
  assertAdmin(actor);
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), isNull(products.deletedAt)));
  if (!p) throw new AdminError(NOT_FOUND);
  return {
    id: p.id,
    name: p.name,
    thumbnailUrl: p.thumbnailUrl,
    accentColor: p.accentColor,
    isFree: p.isFree,
    offerUrl: p.offerUrl,
    defaultAccessDays: p.defaultAccessDays,
    termsEnabled: p.termsEnabled,
    termsHtml: p.termsHtml,
    settings: resolveProductSettings(p.settings),
  };
}

/** Produtos (não excluídos) para o select "Próximo produto", em ordem alfabética. */
export async function listProductOptions(db: Database, actor: User | null): Promise<{ id: number; name: string }[]> {
  assertAdmin(actor);
  return db.select({ id: products.id, name: products.name }).from(products).where(isNull(products.deletedAt)).orderBy(asc(products.name), asc(products.id));
}
