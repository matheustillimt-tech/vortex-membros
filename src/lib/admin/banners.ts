import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { banners, products, type BannerConfig } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { toEmbedUrl } from "@/lib/content/video";
import { safeHttpUrl, safeImageUrl } from "@/lib/theme";
import { AdminError } from "./errors";
import { assertAdmin } from "./guard";

/**
 * Banners da home (painel). Só a imagem aparece na área do aluno; os campos de texto sobre o
 * banner (título, texto, botão) não são editados aqui e ficam como estão no `config`.
 */

const NOT_FOUND = "Não encontrado.";
const INVALID_ORDER = "Ordem inválida.";
export const MIN_BANNER_HEIGHT = 10;
export const MAX_BANNER_HEIGHT = 100;
export const BANNER_STATUS = ["published", "hidden"] as const;
export type BannerStatus = (typeof BANNER_STATUS)[number];

export type BannerAction =
  | { type: "none" }
  | { type: "product"; productId: number }
  | { type: "external"; url: string; newTab: boolean };

export type BannerInput = {
  name: string;
  action: BannerAction;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  videoUrl: string | null;
  mobileVideoUrl: string | null;
  /** Altura em % da tela (10–100); null = padrão (75). */
  heightPercent: number | null;
};

function cleanName(value: unknown): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new AdminError("Informe um nome.");
  if (v.length > 200) throw new AdminError("Nome muito longo.");
  return v;
}

function imageUrl(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  const ok = safeImageUrl(value);
  if (!ok) throw new AdminError("Endereço de imagem inválido.");
  return ok;
}

/** Vídeo: https e reconhecido pelo player (`toEmbedUrl`). */
function videoUrl(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  const ok = safeHttpUrl(value);
  if (!ok || !ok.startsWith("https://") || !toEmbedUrl(ok)) throw new AdminError("Endereço de vídeo inválido.");
  return ok;
}

async function requireBanner(db: Database, id: number, deleted = false) {
  const [row] = await db
    .select()
    .from(banners)
    .where(and(eq(banners.id, id), deleted ? isNotNull(banners.deletedAt) : isNull(banners.deletedAt)));
  if (!row) throw new AdminError(NOT_FOUND);
  return row;
}

async function activeBanners(db: Database) {
  return db
    .select({ id: banners.id, position: banners.position })
    .from(banners)
    .where(isNull(banners.deletedAt))
    .orderBy(asc(banners.position), asc(banners.id));
}

async function checkAction(db: Database, action: BannerAction): Promise<BannerConfig["action"]> {
  if (action?.type === "none") return { type: "none" };
  if (action?.type === "product") {
    if (!Number.isSafeInteger(action.productId)) throw new AdminError("Escolha um produto.");
    const [p] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, action.productId), isNull(products.deletedAt)));
    if (!p) throw new AdminError("Escolha um produto.");
    return { type: "product", productId: p.id };
  }
  if (action?.type === "external") {
    const url = safeHttpUrl(action.url);
    if (!url) throw new AdminError("Informe um endereço de destino válido (http ou https).");
    return { type: "external", url, newTab: action.newTab === true };
  }
  throw new AdminError("Requisição inválida.");
}

// ---------- escrita ----------

/** Novo banner no fim da lista, oculto e sem imagem (publica-se depois de configurar). */
export async function createBanner(db: Database, actor: User | null, input: { name: string }): Promise<{ id: number }> {
  assertAdmin(actor);
  const name = cleanName(input.name);
  const rows = await activeBanners(db);
  const position = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.position)) + 1;
  const [row] = await db
    .insert(banners)
    .values({ name, position, status: "hidden", config: { action: { type: "none" } } })
    .returning({ id: banners.id });
  return row;
}

/** Salva o editor. Mescla no `config` atual: título/texto/botão (não editados aqui) são preservados. */
export async function updateBanner(db: Database, actor: User | null, id: number, input: BannerInput): Promise<void> {
  assertAdmin(actor);
  const current = await requireBanner(db, id);
  const name = cleanName(input.name);
  const action = await checkAction(db, input.action);
  const desktopImageUrl = imageUrl(input.desktopImageUrl);
  const mobileImageUrl = imageUrl(input.mobileImageUrl);
  const video = videoUrl(input.videoUrl);
  const mobileVideo = videoUrl(input.mobileVideoUrl);
  const h = input.heightPercent;
  if (h !== null && (!Number.isInteger(h) || h < MIN_BANNER_HEIGHT || h > MAX_BANNER_HEIGHT)) {
    throw new AdminError(`Informe uma altura de ${MIN_BANNER_HEIGHT} a ${MAX_BANNER_HEIGHT}%.`);
  }
  const config: BannerConfig = { ...current.config, action, desktopImageUrl, mobileImageUrl, videoUrl: video, mobileVideoUrl: mobileVideo };
  if (h === null) delete config.heightPercent;
  else config.heightPercent = h;
  await db.update(banners).set({ name, config }).where(eq(banners.id, id));
}

export async function renameBanner(db: Database, actor: User | null, id: number, name: string): Promise<void> {
  assertAdmin(actor);
  await requireBanner(db, id);
  await db.update(banners).set({ name: cleanName(name) }).where(eq(banners.id, id));
}

export async function setBannerStatus(db: Database, actor: User | null, id: number, status: BannerStatus): Promise<void> {
  assertAdmin(actor);
  if (!BANNER_STATUS.includes(status)) throw new AdminError("Status inválido.");
  await requireBanner(db, id);
  await db.update(banners).set({ status }).where(eq(banners.id, id));
}

/** Excluir = lixeira (some da home). */
export async function trashBanner(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  await requireBanner(db, id);
  await db.update(banners).set({ deletedAt: new Date() }).where(eq(banners.id, id));
}

/** Restaurar volta para o fim da lista. */
export async function restoreBanner(db: Database, actor: User | null, id: number): Promise<void> {
  assertAdmin(actor);
  await requireBanner(db, id, true);
  const rows = await activeBanners(db);
  const position = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.position)) + 1;
  await db.update(banners).set({ deletedAt: null, position }).where(eq(banners.id, id));
}

/** `orderedIds` precisa cobrir exatamente os banners não excluídos; senão nada é gravado. */
export async function reorderBanners(db: Database, actor: User | null, orderedIds: number[]): Promise<void> {
  assertAdmin(actor);
  if (!Array.isArray(orderedIds) || !orderedIds.every((n) => Number.isSafeInteger(n))) throw new AdminError(INVALID_ORDER);
  await db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    const current = await activeBanners(t);
    const wanted = new Set(orderedIds);
    if (wanted.size !== orderedIds.length || wanted.size !== current.length || !current.every((r) => wanted.has(r.id))) {
      throw new AdminError(INVALID_ORDER);
    }
    for (let i = 0; i < orderedIds.length; i++) await t.update(banners).set({ position: i }).where(eq(banners.id, orderedIds[i]));
  });
}

// ---------- leitura ----------

export type AdminBannerRow = { id: number; name: string; status: BannerStatus; imageUrl: string | null; deletedAt: Date | null };

function toRow(b: typeof banners.$inferSelect): AdminBannerRow {
  return {
    id: b.id,
    name: b.name,
    status: b.status,
    imageUrl: safeImageUrl(b.config.desktopImageUrl) ?? safeImageUrl(b.config.mobileImageUrl),
    deletedAt: b.deletedAt,
  };
}

export async function listBanners(db: Database, actor: User | null): Promise<AdminBannerRow[]> {
  assertAdmin(actor);
  const rows = await db.select().from(banners).where(isNull(banners.deletedAt)).orderBy(asc(banners.position), asc(banners.id));
  return rows.map(toRow);
}

export async function listBannerTrash(db: Database, actor: User | null): Promise<AdminBannerRow[]> {
  assertAdmin(actor);
  const rows = await db.select().from(banners).where(isNotNull(banners.deletedAt)).orderBy(asc(banners.name), asc(banners.id));
  return rows.map(toRow);
}

export type AdminBannerEdit = {
  id: number;
  name: string;
  status: BannerStatus;
  action: BannerAction;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  videoUrl: string | null;
  mobileVideoUrl: string | null;
  heightPercent: number | null;
};

export async function getBannerForEdit(db: Database, actor: User | null, id: number): Promise<AdminBannerEdit> {
  assertAdmin(actor);
  const b = await requireBanner(db, id);
  const c = b.config;
  const a = c.action;
  const action: BannerAction =
    a?.type === "product" && Number.isSafeInteger(a.productId)
      ? { type: "product", productId: a.productId! }
      : a?.type === "external" && a.url
        ? { type: "external", url: a.url, newTab: a.newTab ?? true }
        : { type: "none" };
  return {
    id: b.id,
    name: b.name,
    status: b.status,
    action,
    desktopImageUrl: c.desktopImageUrl ?? null,
    mobileImageUrl: c.mobileImageUrl ?? null,
    videoUrl: c.videoUrl ?? null,
    mobileVideoUrl: c.mobileVideoUrl ?? null,
    heightPercent: typeof c.heightPercent === "number" ? c.heightPercent : null,
  };
}
