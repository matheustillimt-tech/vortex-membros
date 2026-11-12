import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import type { Database } from "@/db";
import { userLogs, users, type UserLogEvent } from "@/db/schema";
import { safeErrorSummary } from "@/lib/log";

/** Rótulos da aba Logs: os quatro primeiros são os principais. */
export const EVENT_LABELS: Record<UserLogEvent, string> = {
  login: "Realizou login",
  login_link: "Realizou login por link de acesso",
  first_access: "Primeiro acesso à plataforma",
  new_device: "Novo dispositivo registrado",
  password_changed: "Senha alterada",
  impersonated: "Acessado por um administrador",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Um user-agent que não aparece nos logs do aluno há esse tempo volta a ser "novo dispositivo". */
const DEVICE_MEMORY_MS = 90 * DAY_MS;
const IP_MAX = 64;
const USER_AGENT_MAX = 512;

const clip = (v: string, max: number): string | null => {
  const s = v.trim().slice(0, max);
  return s ? s : null;
};

/**
 * Registra um login bem-sucedido: `first_access` na primeira vez (e grava `first_access_at`),
 * `new_device` quando o user-agent não aparece nos logs dos últimos 90 dias (não no primeiro acesso:
 * o primeiro dispositivo não é "novo") e `login`/`login_link`. Ordem de inserção = ordem de exibição
 * (do mais antigo para o mais recente).
 */
export async function recordLogin(
  db: Database,
  user: { id: number; firstAccessAt: Date | null },
  ctx: { via: "password" | "link"; ip: string; userAgent: string },
  now: Date = new Date(),
): Promise<void> {
  const ip = clip(ctx.ip, IP_MAX);
  const userAgent = clip(ctx.userAgent, USER_AGENT_MAX);

  // Condicional no banco: dois logins simultâneos não geram dois "primeiro acesso".
  const first =
    user.firstAccessAt === null &&
    (await db
      .update(users)
      .set({ firstAccessAt: now })
      .where(and(eq(users.id, user.id), isNull(users.firstAccessAt)))
      .returning({ id: users.id })).length > 0;

  let newDevice = false;
  if (!first && userAgent) {
    const seen = await db
      .select({ id: userLogs.id })
      .from(userLogs)
      .where(
        and(
          eq(userLogs.userId, user.id),
          gte(userLogs.createdAt, new Date(now.getTime() - DEVICE_MEMORY_MS)),
          eq(userLogs.userAgent, userAgent),
          // Só os logins do próprio aluno (um "impersonated" traz o navegador do admin).
          inArray(userLogs.event, ["login", "login_link", "first_access", "new_device"]),
        ),
      )
      .limit(1);
    newDevice = seen.length === 0;
  }

  const events: UserLogEvent[] = [];
  if (first) events.push("first_access");
  if (newDevice) events.push("new_device");
  events.push(ctx.via === "link" ? "login_link" : "login");
  await db.insert(userLogs).values(events.map((event) => ({ userId: user.id, event, ip, userAgent, createdAt: now })));
}

/** recordLogin para o caminho do login: falha no log nunca impede a entrada (loga só o resumo do erro). */
export async function recordLoginSafely(
  db: Database,
  user: { id: number; firstAccessAt: Date | null },
  ctx: { via: "password" | "link"; ip: string; userAgent: string },
): Promise<void> {
  try {
    await recordLogin(db, user, ctx);
  } catch (err) {
    console.error("[alunos] falha ao registrar o login:", safeErrorSummary(err));
  }
}

/** Grava um evento avulso (senha alterada, personificação…). */
export async function recordEvent(
  db: Database,
  userId: number,
  event: UserLogEvent,
  ctx: { ip?: string; userAgent?: string } = {},
  now: Date = new Date(),
): Promise<void> {
  await db.insert(userLogs).values({
    userId,
    event,
    ip: clip(ctx.ip ?? "", IP_MAX),
    userAgent: clip(ctx.userAgent ?? "", USER_AGENT_MAX),
    createdAt: now,
  });
}

/**
 * Último acesso por visita, no máximo 1 vez por hora: um UPDATE condicional (não escreve nada se o
 * último acesso já é da última hora). Devolve se atualizou.
 */
export async function touchLastAccess(db: Database, userId: number, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ lastAccessAt: now })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.lastAccessAt), lt(users.lastAccessAt, new Date(now.getTime() - HOUR_MS))),
      ),
    )
    .returning({ id: users.id });
  return rows.length > 0;
}

/** Para quem já tem o usuário em mãos: evita até o UPDATE quando o último acesso é recente. */
export function lastAccessIsFresh(lastAccessAt: Date | null, now: Date = new Date()): boolean {
  return lastAccessAt !== null && now.getTime() - lastAccessAt.getTime() < HOUR_MS;
}
