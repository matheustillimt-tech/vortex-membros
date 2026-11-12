import { headers } from "next/headers";
import { after } from "next/server";
import { getDb, type Database } from "@/db";
import { scheduleOutboxFlush } from "@/lib/email/send-now";
import { getAppUrl } from "./app-url";
import { clientIp } from "./client-ip";
import { recoveryAllowedForIp } from "./password-reset";
import { safeErrorSummary } from "@/lib/log";

type Job = (db: Database, email: string, opts: { appUrl: string }) => Promise<void>;

/**
 * Esqueci a senha / novo link, do lado da action. Antes da resposta só roda o que não depende do
 * e-mail (limite por IP, sempre a mesma consulta); procurar o usuário, gravar e enfileirar vai
 * para o after(), depois da resposta. Assim o tempo de resposta não revela quem é cadastrado.
 */
export async function scheduleRecovery(job: Job, email: string): Promise<void> {
  const h = await headers();
  const db = getDb();
  if (!(await recoveryAllowedForIp(db, clientIp(h)))) return;
  const appUrl = getAppUrl(h);
  after(async () => {
    try {
      await job(db, email, { appUrl });
      scheduleOutboxFlush();
    } catch (err) {
      console.error("[auth] falha no pedido de recuperação:", safeErrorSummary(err));
    }
  });
}
