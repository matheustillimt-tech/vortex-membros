"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { requireUser } from "@/lib/auth/current-user";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { blockedByFirstAccessTerms, FIRST_ACCESS_PENDING_MESSAGE } from "@/lib/catalog/first-access-terms";
import { AVATAR_MAX_BYTES, removeAvatar, setAvatar, type AvatarResult } from "@/lib/avatar";
import { changePassword, updateProfile } from "@/lib/profile";
import { getCachedPlatformSettings } from "@/lib/settings";
import { parseProfileForm } from "./form";

export type ProfileState = { ok: true; message: string } | { ok: false; error: string } | null;

export async function updateProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  // Sempre o usuário da sessão (relido do banco); nunca um id vindo do formulário.
  const user = await requireUser();
  const db = getDb();
  if (await blockedByFirstAccessTerms(db, user)) return { ok: false, error: FIRST_ACCESS_PENDING_MESSAGE };
  const settings = await getCachedPlatformSettings(db);
  const result = await updateProfile(db, user, parseProfileForm(formData), settings);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/area/aluno/perfil");
  return { ok: true, message: "Dados atualizados." };
}

export async function changePasswordAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const db = getDb();
  if (await blockedByFirstAccessTerms(db, user)) return { ok: false, error: FIRST_ACCESS_PENDING_MESSAGE };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next !== confirm) return { ok: false, error: "As senhas não conferem." };
  const policy = getPasswordPolicy(await getCachedPlatformSettings(db));
  const keepSessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const result = await changePassword(db, user, current, next, { policy, keepSessionToken });
  return result.ok ? { ok: true, message: "Senha alterada." } : { ok: false, error: result.error };
}

/** Foto de Minha conta (campo `avatar`); o limite e o tipo são conferidos em setAvatar. */
export async function uploadAvatarAction(formData: FormData): Promise<AvatarResult> {
  const user = await requireUser();
  const db = getDb();
  if (await blockedByFirstAccessTerms(db, user)) return { ok: false, error: FIRST_ACCESS_PENDING_MESSAGE };
  const file = formData.get("avatar");
  if (!(file instanceof File)) return { ok: false, error: "Selecione uma imagem." };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "Arquivo maior que 1 MB." };
  const result = await setAvatar(db, user, new Uint8Array(await file.arrayBuffer()));
  if (result.ok) revalidatePath("/area", "layout");
  return result;
}

export async function removeAvatarAction(): Promise<AvatarResult> {
  const user = await requireUser();
  const db = getDb();
  if (await blockedByFirstAccessTerms(db, user)) return { ok: false, error: FIRST_ACCESS_PENDING_MESSAGE };
  const result = await removeAvatar(db, user);
  revalidatePath("/area", "layout");
  return result;
}
