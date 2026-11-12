import { createHash } from "node:crypto";
import { eq, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { loginAttempts } from "@/db/schema";
import { normalizeEmail } from "./tokens";

export const MAX_LOGIN_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function loginAttemptKey(email: string, ip: string): string {
  return createHash("sha256").update(`${normalizeEmail(email)}|${ip}`).digest("hex");
}

// Bloqueado quando já houve MAX falhas e o bloqueio (iniciado na última falha) ainda não venceu.
export async function checkLoginAllowed(db: Database, key: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1);
  if (!row || row.count < MAX_LOGIN_FAILURES) return true;
  return now.getTime() - row.windowStart.getTime() >= LOGIN_WINDOW_MS;
}

export type AttemptLimit = { max: number; windowMs: number };
export const LOGIN_LIMIT: AttemptLimit = { max: MAX_LOGIN_FAILURES, windowMs: LOGIN_WINDOW_MS };
/** Esqueci a senha + novo link, somados, por IP. */
export const RECOVERY_IP_LIMIT: AttemptLimit = { max: 10, windowMs: 60 * 60 * 1000 };
/** Pedidos por usuário (cada fluxo com a sua chave). */
export const RECOVERY_USER_LIMIT: AttemptLimit = { max: 3, windowMs: 60 * 60 * 1000 };
/** A maior janela em uso: a limpeza só apaga linhas que nenhuma janela ainda conta. */
const LONGEST_WINDOW_MS = Math.max(LOGIN_WINDOW_MS, RECOVERY_IP_LIMIT.windowMs, RECOVERY_USER_LIMIT.windowMs);

/** Chave genérica: sha256 das partes ("recuperacao-ip", ip...). */
export function attemptKey(...parts: (string | number)[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Conta uma tentativa (upsert atômico que devolve a contagem); liberada se o retorno for <= max.
 * Janela vencida recomeça em 1; a tentativa que chega ao máximo reinicia a janela (bloqueio de
 * `windowMs` a partir dela), e as bloqueadas seguintes não o estendem.
 */
export async function recordAttempt(db: Database, key: string, limit: AttemptLimit, now: Date = new Date()): Promise<number> {
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  const cutoff = sql`${new Date(now.getTime() - limit.windowMs).toISOString()}::timestamptz`;
  const expired = sql`${loginAttempts.windowStart} <= ${cutoff}`;
  const [row] = await db
    .insert(loginAttempts)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${loginAttempts.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN ${nowSql}
          WHEN ${loginAttempts.count} + 1 = ${limit.max} THEN ${nowSql}
          ELSE ${loginAttempts.windowStart} END`,
      },
    })
    .returning({ count: loginAttempts.count });
  return row.count;
}

/** Login: a tentativa é reservada ANTES de comparar a senha (rajada paralela não passa toda). */
export function recordLoginAttempt(db: Database, key: string, now: Date = new Date()): Promise<number> {
  return recordAttempt(db, key, LOGIN_LIMIT, now);
}

// Limpeza oportunista: apaga até 500 chaves cuja janela (ou bloqueio) já venceu em qualquer limite.
export async function purgeExpiredLoginAttempts(db: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - LONGEST_WINDOW_MS);
  const expired = db.select({ key: loginAttempts.key }).from(loginAttempts)
    .where(lte(loginAttempts.windowStart, cutoff)).limit(500);
  const deleted = await db.delete(loginAttempts).where(inArray(loginAttempts.key, expired))
    .returning({ key: loginAttempts.key });
  return deleted.length;
}

export async function clearLoginFailures(db: Database, key: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
