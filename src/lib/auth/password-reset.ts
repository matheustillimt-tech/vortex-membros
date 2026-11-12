import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { enqueueEmail } from "@/lib/email/outbox";
import { getPlatformSettings } from "@/lib/settings";
import { hashPassword } from "./password";
import { getPasswordPolicy, validatePassword } from "./password-policy";
import { hashToken, revokeUserSessions, type User } from "./sessions";
import { RECOVERY_IP_LIMIT, RECOVERY_USER_LIMIT, attemptKey, recordAttempt } from "./rate-limit";
import { generateLoginToken, normalizeEmail } from "./tokens";

const HOUR_MS = 3_600_000;

/**
 * Usuário ativo com a linha travada (SELECT … FOR UPDATE) até o fim da transação: pedidos
 * simultâneos do mesmo usuário passam um de cada vez.
 */
async function lockActiveUser(tx: Database, email: string): Promise<User | null> {
  const [user] = await tx
    .select()
    .from(users)
    .where(and(eq(users.email, normalizeEmail(email)), isNull(users.deletedAt)))
    .limit(1)
    .for("update");
  return user ?? null;
}

/**
 * Cria o link de redefinição (1 h) e invalida os anteriores não usados. Chamar dentro de uma
 * transação com a linha do usuário travada, para existir só um link válido por vez. Devolve o
 * token em claro (só para o e-mail); no banco fica o sha256.
 */
export async function issueResetToken(tx: Database, userId: number, now: Date = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await tx
    .update(passwordResets)
    .set({ usedAt: now })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  await tx.insert(passwordResets).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + HOUR_MS),
    createdAt: now,
  });
  return token;
}

/** Até 3 pedidos por usuário por hora em cada fluxo (contador atômico de rate-limit.ts). */
async function withinUserLimit(tx: Database, flow: "recuperacao" | "novo-link", userId: number, now: Date): Promise<boolean> {
  return (await recordAttempt(tx, attemptKey(flow, "usuario", userId), RECOVERY_USER_LIMIT, now)) <= RECOVERY_USER_LIMIT.max;
}

/**
 * Esqueci a senha. Roda depois da resposta (after() na action) e nunca revela se o e-mail
 * existe: desconhecido, excluído ou acima do limite não faz nada. Numa transação com a linha do
 * usuário travada: invalida os pedidos não usados, grava o novo e enfileira o e-mail; assim só
 * existe um link válido por vez.
 */
export async function requestPasswordReset(db: Database, email: string, opts: { appUrl: string; now?: Date }): Promise<void> {
  const now = opts.now ?? new Date();
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const user = await lockActiveUser(tx, email);
    if (!user || !(await withinUserLimit(tx, "recuperacao", user.id, now))) return;
    const token = await issueResetToken(tx, user.id, now);
    await enqueueEmail(tx, {
      toEmail: user.email,
      toName: user.name,
      template: "recuperacao",
      vars: { nome: user.name, email: user.email, linkRedefinicao: `${opts.appUrl}/auth/recuperar_senha/${token}` },
      now,
    });
  });
}

/** Link válido (existe, não usado, não vencido, usuário ativo)? Só leitura, para a tela. */
export async function isResetTokenValid(db: Database, token: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: passwordResets.id })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, now),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Redefine a senha pelo link. Senha fraca não consome o link. Consumir o link, trocar a senha e
 * encerrar as sessões é uma transação só: se algo falhar, nada muda e o link continua valendo.
 * O consumo é atômico (dois envios simultâneos: só um vence).
 */
export async function resetPassword(
  db: Database,
  token: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<"ok" | "invalid" | "weak"> {
  if (!(await isResetTokenValid(db, token, now))) return "invalid";
  if (validatePassword(newPassword, getPasswordPolicy(await getPlatformSettings(db)))) return "weak";
  const passwordHash = await hashPassword(newPassword);
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const [claimed] = await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
      .returning({ userId: passwordResets.userId });
    if (!claimed) return "invalid" as const;
    // Admin: o login_token também é trocado. Aluno: fica (os links de e-mails antigos seguem valendo).
    const [updated] = await tx
      .update(users)
      .set({ passwordHash, loginToken: sql`CASE WHEN ${users.role} = 'admin' THEN ${generateLoginToken()} ELSE ${users.loginToken} END` })
      .where(and(eq(users.id, claimed.userId), isNull(users.deletedAt)))
      .returning({ id: users.id });
    if (!updated) return "invalid" as const;
    await revokeUserSessions(tx, claimed.userId);
    return "ok" as const;
  });
}

/** Novo link de acesso (link automático vencido). Mesmas regras: silêncio, after(), 3/h por usuário. */
export async function requestNewLoginLink(db: Database, email: string, opts: { appUrl: string; now?: Date }): Promise<void> {
  const now = opts.now ?? new Date();
  await db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Database;
    const user = await lockActiveUser(tx, email);
    // Só alunos têm link automático; para admin, silêncio (a resposta da action é a mesma).
    if (!user || user.role !== "student" || !(await withinUserLimit(tx, "novo-link", user.id, now))) return;
    await enqueueEmail(tx, {
      toEmail: user.email,
      toName: user.name,
      template: "novo-link",
      vars: { nome: user.name, email: user.email, linkAcesso: `${opts.appUrl}/auth/login?login_token=${encodeURIComponent(user.loginToken)}` },
      now,
    });
  });
}

/** Limite por IP dos dois fluxos somados. Mesmo custo exista o e-mail ou não. */
export async function recoveryAllowedForIp(db: Database, ip: string, now: Date = new Date()): Promise<boolean> {
  return (await recordAttempt(db, attemptKey("recuperacao", "ip", ip), RECOVERY_IP_LIMIT, now)) <= RECOVERY_IP_LIMIT.max;
}
