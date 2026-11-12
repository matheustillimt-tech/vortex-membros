import { and, count, desc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";
import type { Database } from "@/db";
import { emailOutbox } from "@/db/schema";
import { getPlatformSettings } from "@/lib/settings";
import { sendViaBrevo, type BrevoConfig, type BrevoMessage, type SendResult } from "./brevo";
import type { EmailTemplateKey } from "./defaults";
import { renderEmail, type EmailVars } from "./templates";

export const MAX_ATTEMPTS = 5;
/** Espera depois da 1ª, 2ª, 3ª e 4ª falha; a 5ª marca `dead`. */
export const BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
/** Reserva de uma linha enquanto é enviada (se o processo morrer, volta a ser tentada depois). */
const LEASE_MS = 15 * 60_000;
const DEFAULT_DAILY_LIMIT = 300;
/** Chave recusada (401/403): não gasta tentativa, tenta de novo em 1 h (a troca da chave não perde e-mails). */
export const INVALID_KEY_ERROR = "Chave do Brevo inválida";
const INVALID_KEY_RETRY_MS = 3_600_000;
/** Linhas da fila (de qualquer status) mais velhas que isso são apagadas pelo cron. */
export const OUTBOX_RETENTION_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;

export function getAppUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

function dailyLimit(): number {
  const n = Number(process.env.BREVO_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

/**
 * Início do dia em America/Sao_Paulo (UTC-3 fixo desde 2019) como instante UTC: 03:00Z daquela data.
 */
export function saoPauloDayStart(now: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3));
}

/**
 * Renderiza na hora e grava na fila. Null quando o modelo está desativado ou quando `dedupeKey`
 * já foi usado (o mesmo e-mail não sai duas vezes).
 */
export async function enqueueEmail(
  db: Database,
  input: { toEmail: string; toName: string; template: EmailTemplateKey; vars: EmailVars; dedupeKey?: string; now?: Date },
): Promise<number | null> {
  const settings = await getPlatformSettings(db);
  const now = input.now ?? new Date();
  const rendered = renderEmail(input.template, input.vars, { settings, appUrl: getAppUrl(), now });
  if (!rendered) return null;
  const [row] = await db
    .insert(emailOutbox)
    .values({
      toEmail: input.toEmail,
      toName: input.toName.trim() || input.toEmail,
      template: input.template,
      subject: rendered.subject,
      html: rendered.html,
      sendAfter: now,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey })
    .returning({ id: emailOutbox.id });
  return row?.id ?? null;
}

export type OutboxSender = (msg: BrevoMessage, cfg: Omit<BrevoConfig, "fetchImpl">) => Promise<SendResult>;
export const brevoSender: OutboxSender = (msg, cfg) => sendViaBrevo(msg, cfg);

/**
 * Envia o que está devido (`queued`/`failed` com `send_after <= now`). Respeita o limite diário
 * (o excedente vai para 03:00Z do dia seguinte), conta tentativas com intervalo crescente e marca
 * `dead` na 5ª falha. Sem BREVO_API_KEY ou EMAIL_FROM_EMAIL não tenta nada. Nunca lança por causa
 * de um envio.
 */
export async function processOutbox(
  db: Database,
  opts: { now?: Date; limit?: number; send?: OutboxSender } = {},
): Promise<{ sent: number; failed: number; deferred: number }> {
  const result = { sent: 0, failed: 0, deferred: 0 };
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.EMAIL_FROM_EMAIL?.trim();
  if (!apiKey || !senderEmail) return result;

  const now = opts.now ?? new Date();
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500));
  const send: OutboxSender = opts.send ?? brevoSender;
  const redact = (text: string) => text.split(apiKey).join("[redacted]").slice(0, 500);

  // Reserva atômica (SKIP LOCKED): duas execuções simultâneas não pegam a mesma linha.
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(and(inArray(emailOutbox.status, ["queued", "failed"]), lte(emailOutbox.sendAfter, now)))
    .orderBy(emailOutbox.sendAfter, emailOutbox.id)
    .limit(limit)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(emailOutbox)
    .set({ sendAfter: new Date(now.getTime() + LEASE_MS) })
    .where(inArray(emailOutbox.id, due))
    .returning();
  if (claimed.length === 0) return result;
  claimed.sort((a, b) => a.id - b.id);

  const dayStart = saoPauloDayStart(now);
  const [{ sentToday }] = await db
    .select({ sentToday: count() })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "sent"), gte(emailOutbox.sentAt, dayStart)));
  let remaining = dailyLimit() - sentToday;

  const settings = await getPlatformSettings(db);
  const cfg = {
    apiKey,
    senderEmail,
    senderName: settings.emails.senderName?.trim() || process.env.EMAIL_FROM_NAME?.trim() || settings.siteName,
    replyTo: settings.emails.replyTo,
  };

  let keyRejected = false;
  for (const row of claimed) {
    if (remaining <= 0) {
      await db.update(emailOutbox).set({ sendAfter: new Date(dayStart.getTime() + DAY_MS) }).where(eq(emailOutbox.id, row.id));
      result.deferred++;
      continue;
    }
    let r: SendResult;
    if (keyRejected) {
      // A chave já foi recusada nesta rodada: nem tenta, só adia.
      r = { ok: false, retryable: false, status: 401, error: INVALID_KEY_ERROR };
    } else {
      try {
        r = await send({ toEmail: row.toEmail, toName: row.toName, subject: row.subject, html: row.html }, cfg);
      } catch (err) {
        r = { ok: false, retryable: true, error: err instanceof Error ? err.message : "erro no envio" };
      }
    }
    const attempts = row.attempts + 1;
    if (r.ok) {
      // O html tem senha e link de login: depois de enviado, não fica guardado.
      await db.update(emailOutbox).set({ status: "sent", sentAt: now, attempts, lastError: null, html: "" }).where(eq(emailOutbox.id, row.id));
      result.sent++;
      remaining--;
      continue;
    }
    result.failed++;
    if (r.status === 401 || r.status === 403) {
      if (!keyRejected) console.error(`[email] ${INVALID_KEY_ERROR} (Brevo ${r.status}): nada será enviado até a chave ser corrigida`);
      keyRejected = true;
      await db
        .update(emailOutbox)
        .set({ status: "failed", lastError: INVALID_KEY_ERROR, sendAfter: new Date(now.getTime() + INVALID_KEY_RETRY_MS) })
        .where(eq(emailOutbox.id, row.id));
      continue;
    }
    // As outras falhas contam tentativa e voltam com intervalo crescente; a 5ª marca `dead`.
    const dead = attempts >= MAX_ATTEMPTS;
    const error = redact(r.error);
    // No log só o status: o detalhe do Brevo pode repetir o destinatário (fica em last_error, no painel).
    console.error(`[email] falha no envio #${row.id} (tentativa ${attempts}/${MAX_ATTEMPTS}${dead ? ", desistindo" : ""}): Brevo ${r.status ?? "sem resposta"}`);
    await db
      .update(emailOutbox)
      .set({
        status: dead ? "dead" : "failed",
        attempts,
        lastError: error,
        sendAfter: dead ? now : new Date(now.getTime() + BACKOFF_MS[attempts - 1]),
        ...(dead ? { html: "" } : {}),
      })
      .where(eq(emailOutbox.id, row.id));
  }
  return result;
}

/** Apaga as linhas da fila criadas há mais de 30 dias (até 1000 por chamada). */
export async function purgeOldOutbox(db: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - OUTBOX_RETENTION_MS);
  const old = db.select({ id: emailOutbox.id }).from(emailOutbox).where(lt(emailOutbox.createdAt, cutoff)).limit(1000);
  const deleted = await db.delete(emailOutbox).where(inArray(emailOutbox.id, old)).returning({ id: emailOutbox.id });
  return deleted.length;
}

export type OutboxHealth = { queued: number; failed: number; dead: number; lastError: string | null; keyConfigured: boolean };

/** Resumo da fila para o aviso da tela Configurações → E-mails. */
export async function getOutboxHealth(db: Database): Promise<OutboxHealth> {
  const counts = await db
    .select({ status: emailOutbox.status, n: count() })
    .from(emailOutbox)
    .where(inArray(emailOutbox.status, ["queued", "failed", "dead"]))
    .groupBy(emailOutbox.status);
  const by = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const [last] = await db
    .select({ lastError: emailOutbox.lastError })
    .from(emailOutbox)
    .where(and(inArray(emailOutbox.status, ["failed", "dead"]), isNotNull(emailOutbox.lastError)))
    .orderBy(desc(emailOutbox.sendAfter), desc(emailOutbox.id))
    .limit(1);
  return {
    queued: by("queued"),
    failed: by("failed"),
    dead: by("dead"),
    lastError: last?.lastError ?? null,
    keyConfigured: Boolean(process.env.BREVO_API_KEY?.trim() && process.env.EMAIL_FROM_EMAIL?.trim()),
  };
}
