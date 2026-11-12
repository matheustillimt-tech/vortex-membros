import { sendViaBrevo, type BrevoConfig } from "@/lib/email/brevo";
import { escapeHtml } from "@/lib/email/layout";
import { formatSentAt } from "@/lib/email/templates";
import { safeErrorSummary } from "@/lib/log";

export type ErrorRequest = { path: string; method: string };
export type ErrorContext = { routePath: string; routeType: string };

const WINDOW_MS = 15 * 60_000;
const MAX_PER_HOUR = 6;

/** Redirect, notFound e afins chegam como "erro" mas são fluxo normal do Next. */
function isControlFlow(err: unknown): boolean {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  return /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(digest);
}

function digestOf(err: unknown): string | null {
  const d = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  return /^[A-Za-z0-9_:-]{1,64}$/.test(d) ? d : null;
}

/**
 * Avisa o dono da plataforma por e-mail quando o servidor dá erro (instrumentation.ts → onRequestError).
 * Sem dados do aluno: rota sem query (pode ter token ou e-mail), resumo do erro (safeErrorSummary)
 * e o digest para achar o detalhe no log da Vercel. Mesmo erro na mesma rota: um aviso a cada 15 min,
 * e no máximo 6 por hora em cada instância, para uma pane não virar uma enxurrada.
 */
export function createErrorAlerter(deps: {
  to: string | null;
  brevo: Omit<BrevoConfig, "fetchImpl"> | null;
  send?: typeof sendViaBrevo;
  now?: () => Date;
}) {
  const send = deps.send ?? sendViaBrevo;
  const now = deps.now ?? (() => new Date());
  const lastSent = new Map<string, number>();
  let hourStart = 0;
  let sentThisHour = 0;

  return async function alert(err: unknown, req: ErrorRequest, ctx: ErrorContext): Promise<boolean> {
    if (isControlFlow(err)) return false;
    const summary = safeErrorSummary(err);
    const path = req.path.split("?")[0].slice(0, 200);
    console.error(`[alerta] ${req.method} ${path} (${ctx.routeType} ${ctx.routePath}): ${summary}`);
    if (!deps.to || !deps.brevo) return false;

    const t = now().getTime();
    const key = `${ctx.routePath}|${summary}`;
    if (t - (lastSent.get(key) ?? -Infinity) < WINDOW_MS) return false;
    if (t - hourStart >= 3_600_000) { hourStart = t; sentThisHour = 0; }
    if (sentThisHour >= MAX_PER_HOUR) return false;
    lastSent.set(key, t);
    sentThisHour++;

    const digest = digestOf(err);
    const rows: [string, string][] = [
      ["Quando", formatSentAt(now())],
      ["Página", `${req.method} ${path}`],
      ["Rota", `${ctx.routePath} (${ctx.routeType})`],
      ["Erro", summary],
      ...(digest ? ([["Código no log", digest]] as [string, string][]) : []),
    ];
    const html =
      `<p>O servidor da área de membros deu erro. Os detalhes completos estão nos logs da Vercel (Logs, filtrando pela rota ou pelo código).</p>` +
      `<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>` +
      `<p style="color:#888">Mesmo erro na mesma rota avisa no máximo uma vez a cada 15 minutos.</p>`;
    const r = await send({ toEmail: deps.to, toName: "Administrador", subject: `Erro no site: ${path}`, html }, deps.brevo);
    if (!r.ok) console.error(`[alerta] e-mail não saiu: ${r.error}`);
    return r.ok;
  };
}

/** Alerta do ambiente: só em produção e com Brevo configurado; destino ALERT_EMAIL ou o admin inicial. */
export function alerterFromEnv() {
  const env = process.env;
  const production = env.VERCEL_ENV === "production";
  const apiKey = env.BREVO_API_KEY?.trim();
  const senderEmail = env.EMAIL_FROM_EMAIL?.trim();
  return createErrorAlerter({
    to: production ? env.ALERT_EMAIL?.trim() || env.BOOTSTRAP_ADMIN_EMAIL?.trim() || null : null,
    brevo: apiKey && senderEmail ? { apiKey, senderEmail, senderName: env.EMAIL_FROM_NAME?.trim() || "Vórtex Membros" } : null,
  });
}
