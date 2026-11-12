import { getDb } from "@/db";
import { getAppUrl } from "@/lib/auth/app-url";
import { safeErrorSummary } from "@/lib/log";
import { processImport } from "@/lib/students/import";

/** maxDuration (60 s) menos 15 s de margem: o prazo é conferido a cada linha. */
const BUDGET_MS = 45_000;

/**
 * Processa a importação depois da resposta. Com CRON_SECRET, para em ~45 s e passa o resto para
 * `/api/imports/{id}/process` (nova função, novo prazo); sem ele (dev), vai até o fim. Se a
 * corrente cair, o cron diário retoma as paradas há mais de 10 min.
 */
export async function runImport(id: number): Promise<void> {
  const secret = process.env.CRON_SECRET?.trim();
  const appUrl = getAppUrl();
  try {
    const { done, error } = await processImport(getDb(), id, { appUrl, deadline: secret ? Date.now() + BUDGET_MS : undefined });
    // Erro: não encadeia (evita repetir sem parar); o cron retoma depois de 10 min.
    if (done || error || !secret) return;
    const res = await fetch(`${appUrl}/api/imports/${id}/process`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, cache: "no-store" });
    if (!res.ok) console.error("[importação] continuação recusada:", res.status);
  } catch (e) {
    console.error("[importação] processamento falhou:", safeErrorSummary(e));
  }
}
