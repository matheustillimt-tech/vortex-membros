import { expect, test, vi } from "vitest";
import { sendViaBrevo } from "@/lib/email/brevo";

const msg = { toEmail: "aluno@exemplo.com", toName: "Fulano", subject: "Seus dados de acesso", html: "<p>oi</p>" };
const cfg = { apiKey: "chave-teste", senderEmail: "nao-responda@exemplo.com", senderName: "Minha Escola", replyTo: "suporte@exemplo.com" };

function fakeFetch(status: number, body = "{}") {
  return vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => new Response(body, { status }));
}

test("envia o corpo JSON esperado com o header api-key", async () => {
  const fetchImpl = fakeFetch(201, '{"messageId":"x"}');
  const r = await sendViaBrevo(msg, { ...cfg, fetchImpl });
  expect(r).toEqual({ ok: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, init] = fetchImpl.mock.calls[0];
  expect(String(url)).toBe("https://api.brevo.com/v3/smtp/email");
  expect(init?.method).toBe("POST");
  const headers = new Headers(init?.headers);
  expect(headers.get("api-key")).toBe("chave-teste");
  expect(headers.get("content-type")).toBe("application/json");
  expect(JSON.parse(String(init?.body))).toEqual({
    sender: { email: "nao-responda@exemplo.com", name: "Minha Escola" },
    to: [{ email: "aluno@exemplo.com", name: "Fulano" }],
    replyTo: { email: "suporte@exemplo.com" },
    subject: "Seus dados de acesso",
    htmlContent: "<p>oi</p>",
  });
});

test("sem replyTo o campo não vai no corpo", async () => {
  const fetchImpl = fakeFetch(201);
  await sendViaBrevo(msg, { ...cfg, replyTo: null, fetchImpl });
  expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).not.toHaveProperty("replyTo");
});

test("400 não é retentável e o erro não contém a chave", async () => {
  const r = await sendViaBrevo(msg, { ...cfg, fetchImpl: fakeFetch(400, '{"code":"invalid_parameter"}') });
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.retryable).toBe(false);
  expect(r.error).toContain("400");
  expect(r.error).not.toContain(cfg.apiKey);
});

test("429 e 503 são retentáveis", async () => {
  for (const status of [429, 503]) {
    const r = await sendViaBrevo(msg, { ...cfg, fetchImpl: fakeFetch(status) });
    expect(r).toMatchObject({ ok: false, retryable: true });
  }
});

test("erro de rede é retentável e não vaza a chave", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new TypeError(`fetch failed (api-key ${cfg.apiKey})`);
  });
  const r = await sendViaBrevo(msg, { ...cfg, fetchImpl });
  expect(r).toMatchObject({ ok: false, retryable: true });
  if (!r.ok) expect(r.error).not.toContain(cfg.apiKey);
});
