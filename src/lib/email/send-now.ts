import { after } from "next/server";
import { getDb } from "@/db";
import { brevoSender, processOutbox, type OutboxSender } from "./outbox";
import { safeErrorSummary } from "@/lib/log";

const RETRY_DELAY_MS = 3_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Repete uma vez, depois de `delayMs`, o envio que falhou de forma retentável (429, 5xx, rede).
 * Se a repetição também falhar, o Brevo é dado como fora e as próximas mensagens desta rodada
 * não esperam de novo (ficam para o backoff da fila).
 */
export function withSingleRetry(send: OutboxSender, delayMs = RETRY_DELAY_MS, wait: (ms: number) => Promise<void> = sleep): OutboxSender {
  let down = false;
  return async (msg, cfg) => {
    const first = await send(msg, cfg);
    if (first.ok || !first.retryable || down) return first;
    await wait(delayMs);
    const second = await send(msg, cfg);
    if (!second.ok) down = true;
    return second;
  };
}

/**
 * Envia a fila logo depois da resposta. Chamado por quem acabou de chamar enqueueEmail e pelo
 * layout do painel (cada visita de admin move o que estiver pendente). O agendador de produção é
 * o pg_cron do Supabase chamando /api/cron/emails a cada 5 min (ver README).
 * Nunca lança: fora de uma requisição (`after` indisponível) ou com erro, só registra no log.
 */
export function scheduleOutboxFlush(): void {
  try {
    after(async () => {
      try {
        await processOutbox(getDb(), { limit: 20, send: withSingleRetry(brevoSender) });
      } catch (err) {
        console.error("[email] falha ao processar a fila:", safeErrorSummary(err));
      }
    });
  } catch (err) {
    console.error("[email] não foi possível agendar o envio:", safeErrorSummary(err));
  }
}
