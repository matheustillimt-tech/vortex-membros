import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { getAppUrl } from "@/lib/auth/app-url";
import { purgeExpiredLoginAttempts } from "@/lib/auth/rate-limit";
import { processOutbox, purgeOldOutbox } from "@/lib/email/outbox";
import { reprocessStaleQueue } from "@/lib/sales/process-sale";
import { resumeStaleImports } from "@/lib/students/import";
import { safeErrorSummary } from "@/lib/log";

export const maxDuration = 60;

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Compara em tempo constante; sem CRON_SECRET configurado, ninguém passa. */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return timingSafeEqual(sha(header), sha(`Bearer ${secret}`));
}

async function step<T>(name: string, fallback: T, run: () => Promise<T>): Promise<[T, boolean]> {
  try {
    return [await run(), true];
  } catch (err) {
    console.error(`[cron] ${name} falhou:`, safeErrorSummary(err));
    return [fallback, false];
  }
}

/**
 * Vendas paradas na fila, envio da fila de e-mails e limpezas. Agendadores:
 * - produção: pg_cron do Supabase chamando esta rota a cada 5 min com o header
 *   `Authorization: Bearer <CRON_SECRET>` (ver README, seção "E-mails agendados");
 * - reserva: cron diário da Vercel (vercel.json; o plano Hobby só permite um por dia).
 * Cada etapa é isolada: uma falha não impede as outras.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDb();
  // Vendas paradas na fila há mais de 5 min (o after() do webhook não rodou): antes dos e-mails,
  // para os e-mails que elas gerarem saírem nesta mesma execução.
  const [salesQueue, okSales] = await step("fila de vendas", { processed: 0, error: 0, ignored: 0 }, () =>
    reprocessStaleQueue(db, { appUrl: getAppUrl(), limit: 50 }),
  );
  // Importações paradas há mais de 10 min (a corrente do after() caiu), antes dos e-mails para não
  // ficarem sem tempo: prazo próprio de 20 s, conferido a cada linha.
  const [importsResumed, okImports] = await step("importações", 0, () => resumeStaleImports(db, { appUrl: getAppUrl(), deadline: Date.now() + 20_000 }));
  const [outbox, okOutbox] = await step("fila de e-mails", { sent: 0, failed: 0, deferred: 0 }, () => processOutbox(db, { limit: 50 }));
  const [outboxPurged, okPurge] = await step("limpeza da fila", 0, () => purgeOldOutbox(db));
  const [loginAttemptsPurged, okAttempts] = await step("limpeza de login_attempts", 0, async () => {
    let total = 0;
    // Lotes de 500 (limite da função), com teto para não estourar o tempo da execução.
    for (let i = 0; i < 20; i++) {
      const n = await purgeExpiredLoginAttempts(db);
      total += n;
      if (n < 500) break;
    }
    return total;
  });
  const ok = okSales && okOutbox && okPurge && okAttempts && okImports;
  return NextResponse.json({ ...outbox, outboxPurged, loginAttemptsPurged, sales: salesQueue, importsResumed }, { status: ok ? 200 : 500 });
}
