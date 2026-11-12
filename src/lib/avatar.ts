import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { users } from "@/db/schema";
import { sniffImageType, storeMedia } from "@/lib/admin/media";
import type { User } from "@/lib/auth/sessions";

/** Foto do aluno em Minha conta: "até 1mb, formatos aceitos: jpeg ou png". */
export const AVATAR_MAX_BYTES = 1024 * 1024;

export type AvatarResult = { ok: true; url: string | null } | { ok: false; error: string };

export async function setAvatar(db: Database, user: User, bytes: Uint8Array): Promise<AvatarResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "Selecione uma imagem." };
  if (bytes.byteLength > AVATAR_MAX_BYTES) return { ok: false, error: "Arquivo maior que 1 MB." };
  const mime = sniffImageType(bytes);
  if (mime !== "image/jpeg" && mime !== "image/png") return { ok: false, error: "Formato não suportado. Envie JPEG ou PNG." };
  const { url } = await storeMedia(db, user.id, bytes, mime);
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, user.id));
  return { ok: true, url };
}

export async function removeAvatar(db: Database, user: User): Promise<AvatarResult> {
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, user.id));
  return { ok: true, url: null };
}
