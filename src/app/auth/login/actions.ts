"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";
import { clientIp } from "@/lib/auth/client-ip";
import { loginWithPassword } from "@/lib/auth/login";
import { requestNewLoginLink } from "@/lib/auth/password-reset";
import { scheduleRecovery } from "@/lib/auth/recovery-request";
import { safeRedirectPath } from "@/lib/auth/redirect";
import {
  MAX_LOGIN_FAILURES, clearLoginFailures, loginAttemptKey, purgeExpiredLoginAttempts, recordLoginAttempt,
} from "@/lib/auth/rate-limit";
import { createSession, purgeExpiredSessions } from "@/lib/auth/sessions";
import { recordLoginSafely } from "@/lib/students/events";

export type LoginState = { error?: string; notice?: string; email?: string };

const NEW_LINK_NOTICE =
  "Se este e-mail estiver cadastrado, você vai receber o novo link em instantes. Confira também a caixa de spam.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const target = safeRedirectPath(String(formData.get("redirect") ?? ""));

  const h = await headers();
  const ip = clientIp(h);
  const key = loginAttemptKey(email, ip);

  const db = getDb();
  // A tentativa é contada antes do bcrypt; o sucesso zera a contagem.
  // Os erros devolvem o e-mail digitado para o formulário não perdê-lo.
  if ((await recordLoginAttempt(db, key)) > MAX_LOGIN_FAILURES) {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", email };
  }
  const user = await loginWithPassword(db, email, password);
  if (!user) {
    return { error: "E-mail ou senha incorretos. Confira e tente de novo.", email };
  }
  await clearLoginFailures(db, key);
  await recordLoginSafely(db, user, { via: "password", ip, userAgent: h.get("user-agent") ?? "" });
  // Limpeza oportunista; falha aqui não impede o login.
  await Promise.all([purgeExpiredSessions(db).catch(() => 0), purgeExpiredLoginAttempts(db).catch(() => 0)]);

  const { token, expiresAt } = await createSession(db, user.id, { remember });
  // "Lembrar de mim" desmarcado: cookie de sessão (sem expires); a sessão no banco expira em 1 dia.
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(remember ? expiresAt : undefined));
  redirect(target);
}

/** "Enviar novo link" (link automático vencido): resposta sempre igual, exista o e-mail ou não. */
export async function newLoginLinkAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe seu e-mail para receber um novo link.", email };
  await scheduleRecovery(requestNewLoginLink, email);
  return { notice: NEW_LINK_NOTICE, email };
}
