import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { media } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { AdminError } from "./errors";
import { assertAdmin } from "./guard";

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
export const BANNER_MAX_BYTES = 3 * 1024 * 1024;
/** Logos (área do aluno, telas de acesso, painel). */
export const LOGO_MAX_BYTES = 600 * 1024;
/** Favicon e ícone do menu recolhido. */
export const ICON_MAX_BYTES = 300 * 1024;
/** Logo dos e-mails ("JPG ou PNG — até 200 KB"). */
export const EMAIL_LOGO_MAX_BYTES = 200 * 1024;

export type UploadKind = "image" | "banner" | "logo" | "icon" | "email";

/** Limite decidido no servidor pelo tipo de uso; qualquer valor desconhecido vale como "image". */
export function uploadLimitFor(kind: unknown): number {
  if (kind === "banner") return BANNER_MAX_BYTES;
  if (kind === "logo") return LOGO_MAX_BYTES;
  if (kind === "icon") return ICON_MAX_BYTES;
  if (kind === "email") return EMAIL_LOGO_MAX_BYTES;
  return DEFAULT_MAX_BYTES;
}
export const UNSUPPORTED_FORMAT_MESSAGE = "Formato não suportado. Envie JPG, PNG, WebP ou GIF.";

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Tipo pela assinatura dos bytes (nunca pela extensão nem pelo content-type enviado). */
export function sniffImageType(b: Uint8Array): ImageMime | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export function formatMb(bytes: number): string {
  const mb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return String(mb);
}

/** "2 MB", "600 KB": limite legível para as mensagens de erro. */
export function formatLimit(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${formatMb(bytes)} MB`;
}

export async function saveMedia(
  db: Database,
  actor: User | null,
  file: { bytes: Uint8Array; maxBytes?: number },
): Promise<{ id: number; url: string }> {
  assertAdmin(actor);
  const max = file.maxBytes ?? DEFAULT_MAX_BYTES;
  if (file.bytes.byteLength > max) throw new AdminError(`Arquivo maior que ${formatLimit(max)}.`);
  const mime = sniffImageType(file.bytes);
  if (!mime) throw new AdminError(UNSUPPORTED_FORMAT_MESSAGE);

  return storeMedia(db, actor.id, file.bytes, mime);
}

/** Grava os bytes (já validados) uma vez por conteúdo (sha256) e devolve o endereço público. */
export async function storeMedia(db: Database, createdBy: number | null, bytes: Uint8Array, mime: ImageMime): Promise<{ id: number; url: string }> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [row] = await db
    .insert(media)
    .values({ sha256, mime, bytes, size: bytes.byteLength, createdBy })
    .onConflictDoNothing({ target: media.sha256 })
    .returning({ id: media.id });
  let id = row?.id;
  if (id === undefined) {
    const [existing] = await db.select({ id: media.id }).from(media).where(eq(media.sha256, sha256));
    id = existing.id;
  }
  return { id, url: `/media/${id}` };
}

export async function getMedia(db: Database, id: number) {
  const [row] = await db.select().from(media).where(eq(media.id, id));
  return row ?? null;
}
