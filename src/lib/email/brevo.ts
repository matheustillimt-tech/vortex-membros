export type BrevoMessage = { toEmail: string; toName: string; subject: string; html: string };
export type BrevoConfig = {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  replyTo?: string | null;
  fetchImpl?: typeof fetch;
};
/** `status` = código HTTP do Brevo quando houve resposta (ausente em erro de rede). */
export type SendResult = { ok: true } | { ok: false; error: string; retryable: boolean; status?: number };

export const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 15_000;

/** Tira a chave de qualquer texto que vá para o banco ou para o log. */
function redact(text: string, apiKey: string): string {
  return apiKey ? text.split(apiKey).join("[redacted]") : text;
}

/**
 * Envia um e-mail pela API transacional do Brevo. 2xx = ok; 429, 5xx e erro de rede são
 * retentáveis; os outros 4xx não. Nunca lança e nunca devolve a chave no erro.
 */
export async function sendViaBrevo(msg: BrevoMessage, cfg: BrevoConfig): Promise<SendResult> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const body = {
    sender: { email: cfg.senderEmail, name: cfg.senderName },
    to: [{ email: msg.toEmail, name: msg.toName }],
    ...(cfg.replyTo ? { replyTo: { email: cfg.replyTo } } : {}),
    subject: msg.subject,
    htmlContent: msg.html,
  };
  try {
    const res = await fetchImpl(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    const retryable = res.status === 429 || res.status >= 500;
    return { ok: false, retryable, status: res.status, error: redact(`Brevo ${res.status}${detail ? `: ${detail}` : ""}`, cfg.apiKey) };
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : "erro de rede";
    return { ok: false, retryable: true, error: redact(`Brevo indisponível (${message})`, cfg.apiKey).slice(0, 300) };
  }
}
