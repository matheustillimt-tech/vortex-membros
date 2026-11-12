import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { emailOutbox } from "@/db/schema";
import { enqueueEmail, getOutboxHealth, processOutbox, purgeOldOutbox } from "@/lib/email/outbox";
import { withSingleRetry } from "@/lib/email/send-now";
import { GET as cron } from "@/app/api/cron/emails/route";

let db: Database;
const now = new Date("2026-10-16T15:00:00Z");
const vars = { nome: "Fulano", email: "f@x.com", senha: "segredo-123", linkAcesso: "https://a.x.com/auth/token?login_token=tok" };

beforeEach(async () => {
  db = await createTestDb();
  vi.stubEnv("BREVO_API_KEY", "k");
  vi.stubEnv("EMAIL_FROM_EMAIL", "nao-responda@x.com");
  vi.stubEnv("APP_URL", "https://a.x.com");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setDbForTests(null);
});

const rows = () => db.select().from(emailOutbox).orderBy(emailOutbox.id);
const enqueue = (toEmail = "f@x.com") => enqueueEmail(db, { toEmail, toName: "F", template: "venda", vars, now });

test("sent e dead não guardam o html (senha e token)", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await enqueue("a@x.com");
  expect((await rows())[0].html).toContain("segredo-123");
  await processOutbox(db, { now, send: async () => ({ ok: true }) });
  expect((await rows())[0]).toMatchObject({ status: "sent", html: "" });

  await enqueue("b@x.com");
  await db.update(emailOutbox).set({ attempts: 4 }).where(eqTo("b@x.com"));
  await processOutbox(db, { now, send: async () => ({ ok: false, error: "Brevo 503", retryable: true, status: 503 }) });
  expect((await rows())[1]).toMatchObject({ status: "dead", html: "" });
});

test("purgeOldOutbox apaga linhas com mais de 30 dias", async () => {
  const old = new Date(now.getTime() - 31 * 86_400_000);
  await db.insert(emailOutbox).values([
    { toEmail: "o@x.com", toName: "O", template: "venda", subject: "s", html: "", status: "sent", createdAt: old },
    { toEmail: "n@x.com", toName: "N", template: "venda", subject: "s", html: "", status: "sent", createdAt: now },
  ]);
  expect(await purgeOldOutbox(db, now)).toBe(1);
  expect((await rows()).map((r) => r.toEmail)).toEqual(["n@x.com"]);
});

test("o log da falha não repete o detalhe do Brevo (destinatário)", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await enqueue("cliente@x.com");
  await processOutbox(db, { now, send: async () => ({ ok: false, error: "Brevo 400: invalid email cliente@x.com", retryable: false, status: 400 }) });
  const logged = spy.mock.calls.flat().map(String).join(" ");
  expect(logged).toContain("Brevo 400");
  expect(logged).not.toContain("cliente@x.com");
  expect((await rows())[0].lastError).toContain("cliente@x.com"); // o painel ainda mostra
});

test("cada falha vai para o console.error, sem a chave", async () => {
  vi.stubEnv("BREVO_API_KEY", "chave-xyz");
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await enqueue();
  await processOutbox(db, { now, send: async () => ({ ok: false, error: "Brevo 503 chave-xyz", retryable: true, status: 503 }) });
  expect(spy).toHaveBeenCalledTimes(1);
  const logged = spy.mock.calls.flat().map(String).join(" ");
  expect(logged).toContain("Brevo 503");
  expect(logged).not.toContain("chave-xyz");
});

test("401/403: não gasta tentativa, fica failed com aviso e +1 h; para de tentar os outros", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await enqueue("a@x.com");
  await enqueue("b@x.com");
  const send = vi.fn(async () => ({ ok: false as const, error: "Brevo 401: unauthorized", retryable: false, status: 401 }));
  expect(await processOutbox(db, { now, send })).toEqual({ sent: 0, failed: 2, deferred: 0 });
  expect(send).toHaveBeenCalledTimes(1);
  for (const r of await rows()) {
    expect(r).toMatchObject({ status: "failed", attempts: 0, lastError: "Chave do Brevo inválida" });
    expect(r.sendAfter).toEqual(new Date(now.getTime() + 3_600_000));
  }
});

test("getOutboxHealth resume a fila e o último erro", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await getOutboxHealth(db)).toEqual({ queued: 0, failed: 0, dead: 0, lastError: null, keyConfigured: true });
  await enqueue("a@x.com");
  await enqueue("b@x.com");
  await processOutbox(db, { now, limit: 1, send: async () => ({ ok: false, error: "Brevo 403", retryable: false, status: 403 }) });
  expect(await getOutboxHealth(db)).toEqual({ queued: 1, failed: 1, dead: 0, lastError: "Chave do Brevo inválida", keyConfigured: true });
  vi.stubEnv("BREVO_API_KEY", "");
  expect((await getOutboxHealth(db)).keyConfigured).toBe(false);
});

test("withSingleRetry: repete uma vez a falha retentável depois da espera", async () => {
  const sleep = vi.fn(async () => {});
  const send = vi.fn()
    .mockResolvedValueOnce({ ok: false, error: "Brevo 503", retryable: true, status: 503 })
    .mockResolvedValueOnce({ ok: true });
  const wrapped = withSingleRetry(send, 3000, sleep);
  const cfg = { apiKey: "k", senderEmail: "s@x.com", senderName: "S" };
  const msg = { toEmail: "a@x.com", toName: "A", subject: "s", html: "h" };
  expect(await wrapped(msg, cfg)).toEqual({ ok: true });
  expect(sleep).toHaveBeenCalledWith(3000);
  expect(send).toHaveBeenCalledTimes(2);
});

test("withSingleRetry: não repete o não retentável e, se a repetição falha, não repete mais", async () => {
  const sleep = vi.fn(async () => {});
  const fail = { ok: false, error: "Brevo 503", retryable: true, status: 503 };
  const send = vi.fn().mockResolvedValue(fail);
  const wrapped = withSingleRetry(send, 3000, sleep);
  const cfg = { apiKey: "k", senderEmail: "s@x.com", senderName: "S" };
  const msg = { toEmail: "a@x.com", toName: "A", subject: "s", html: "h" };
  expect(await wrapped(msg, cfg)).toEqual(fail);
  expect(await wrapped(msg, cfg)).toEqual(fail);
  expect(send).toHaveBeenCalledTimes(3); // 1ª + repetição; depois o Brevo é dado como fora e não repete
  const send400 = vi.fn().mockResolvedValue({ ok: false, error: "Brevo 400", retryable: false, status: 400 });
  await withSingleRetry(send400, 3000, sleep)(msg, cfg);
  expect(send400).toHaveBeenCalledTimes(1);
});

test("cron também apaga linhas antigas da fila", async () => {
  setDbForTests(db);
  vi.stubEnv("CRON_SECRET", "s3cr3t");
  vi.stubEnv("BREVO_API_KEY", "");
  await db.insert(emailOutbox).values({ toEmail: "o@x.com", toName: "O", template: "venda", subject: "s", html: "", status: "dead", createdAt: new Date(Date.now() - 40 * 86_400_000) });
  const res = await cron(new NextRequest("http://x/api/cron/emails", { headers: { authorization: "Bearer s3cr3t" } }));
  expect(await res.json()).toMatchObject({ outboxPurged: 1 });
  expect(await rows()).toHaveLength(0);
});

function eqTo(email: string) {
  return eq(emailOutbox.toEmail, email);
}
