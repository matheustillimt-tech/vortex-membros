"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getPasswordPolicy, validatePassword } from "@/lib/auth/password-policy";
import { resetPassword } from "@/lib/auth/password-reset";
import { getPlatformSettings } from "@/lib/settings";

export type ResetState = { error?: string; expired?: true };

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const senha = String(formData.get("senha") ?? "");
  const senha2 = String(formData.get("senha_2") ?? "");
  if (senha !== senha2) return { error: "As senhas não conferem." };
  const db = getDb();
  const result = await resetPassword(db, token, senha);
  if (result === "invalid") return { expired: true };
  if (result === "weak") {
    return { error: validatePassword(senha, getPasswordPolicy(await getPlatformSettings(db))) ?? "Senha inválida." };
  }
  redirect("/auth/login?senha=redefinida");
}
