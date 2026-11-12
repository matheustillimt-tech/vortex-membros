import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNull, lte, ne } from "drizzle-orm";
import type { Database } from "@/db";
import { sessions, users } from "@/db/schema";

export type User = typeof users.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Database,
  userId: number,
  opts: { remember: boolean; impersonatedBy?: number; expiresAt?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + (opts.remember ? 30 : 1) * DAY_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt, impersonatedBy: opts.impersonatedBy ?? null });
  return { token, expiresAt };
}

/** Sessão válida: o usuário e, se for "entrar como o aluno", o id do admin que a abriu. */
export type SessionInfo = { user: User; impersonatedBy: number | null; expiresAt: Date };

export async function getSession(db: Database, token: string): Promise<SessionInfo | null> {
  const rows = await db
    .select({ user: users, impersonatedBy: sessions.impersonatedBy, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getSessionUser(db: Database, token: string): Promise<User | null> {
  return (await getSession(db, token))?.user ?? null;
}

export async function revokeSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

// Apaga até 500 sessões vencidas por chamada (limpeza oportunista no login).
export async function purgeExpiredSessions(db: Database, now: Date = new Date()): Promise<number> {
  const expired = db.select({ id: sessions.id }).from(sessions).where(lte(sessions.expiresAt, now)).limit(500);
  const deleted = await db.delete(sessions).where(inArray(sessions.id, expired)).returning({ id: sessions.id });
  return deleted.length;
}

// Encerra as sessões do usuário (troca de senha), exceto a do token informado (a sessão atual).
export async function revokeUserSessions(db: Database, userId: number, opts: { except?: string } = {}): Promise<void> {
  const where = opts.except
    ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(opts.except)))
    : eq(sessions.userId, userId);
  await db.delete(sessions).where(where);
}
