"use server";

import { requestPasswordReset } from "@/lib/auth/password-reset";
import { scheduleRecovery } from "@/lib/auth/recovery-request";

export type ForgotState = { sent?: true; error?: string };

/** Resposta sempre igual e no mesmo tempo, exista o e-mail ou não (o trabalho roda no after()). */
export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe seu e-mail." };
  await scheduleRecovery(requestPasswordReset, email);
  return { sent: true };
}
