import type { Database } from "@/db";
import { assertAdmin } from "@/lib/admin/guard";
import { createSession, getSession, revokeSession, type User } from "@/lib/auth/sessions";
import { assertStudentExists } from "./admin";
import { recordEvent } from "./events";

/**
 * "Entrar como o aluno": o admin ganha uma sessão do aluno marcada com `impersonated_by` (1 h) e o
 * token da sessão dele fica no cookie httpOnly `am_admin_return`. A sessão personificada é de aluno:
 * o proxy e o painel a recusam. "Voltar ao painel" só restaura o admin se aquele token ainda for uma
 * sessão válida de admin e for o mesmo admin que abriu a personificação.
 */

export const ADMIN_RETURN_COOKIE = "am_admin_return";
export const IMPERSONATION_MS = 60 * 60 * 1000;

export async function startImpersonation(
  db: Database,
  actor: User | null,
  studentId: number,
  ctx: { ip: string; userAgent: string },
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  assertAdmin(actor);
  const student = await assertStudentExists(db, studentId);
  const session = await createSession(db, student.id, {
    remember: false,
    impersonatedBy: actor.id,
    expiresAt: new Date(now.getTime() + IMPERSONATION_MS),
  });
  await recordEvent(db, student.id, "impersonated", ctx, now);
  return session;
}

/**
 * Encerra a personificação: devolve o token do admin para voltar ao cookie de sessão, ou null se
 * a sessão atual não for personificada ou o retorno não for uma sessão válida do mesmo admin.
 * A sessão personificada é encerrada sempre que existir.
 */
export async function endImpersonation(
  db: Database,
  tokens: { sessionToken: string | undefined; returnToken: string | undefined },
): Promise<{ adminToken: string; studentId: number } | null> {
  if (!tokens.sessionToken) return null;
  const current = await getSession(db, tokens.sessionToken);
  if (!current || current.impersonatedBy === null) return null;
  await revokeSession(db, tokens.sessionToken);
  if (!tokens.returnToken) return null;
  const admin = await getSession(db, tokens.returnToken);
  if (!admin || admin.impersonatedBy !== null || admin.user.role !== "admin" || admin.user.id !== current.impersonatedBy) return null;
  return { adminToken: tokens.returnToken, studentId: current.user.id };
}
