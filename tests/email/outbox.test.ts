import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { emailOutbox, loginAttempts, platformSettings } from "@/db/schema";
import { enqueueEmail, processOutbox } from "@/lib/email/outbox";
import { GET as cron } from "@/app/api/cron/emails/route";

let db: Database;
const now = new Date("2026-10-16T15:00:00Z");
const vars = { nome: "Fulano", email: "f@x.com", senha: "123456" };
const ok = () => vi.fn(async () => ({ ok: true as const }));

beforeEach(async () => {
  db = await createTestDb();
  vi.stubEnv("BREVO_API_KEY", "k");
  vi.stubEnv("EMAIL_FROM_EMAIL", "nao-responda@x.com");
  vi.stubEnv("APP_URL", "https://area.x.com");
  vi.stubEnv("BREVO_DAILY_LIMIT", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDbForTests(null);
});

async function rows() {
  return db.select().from(emailOutbox).orderBy(emailOutbox.id);
}

test("enqueue renderiza e grava; dedupe repetido → null", async () => {
  const id = await enqueueEmail(db, { toEmail: "f@x.com", toName: "Fulano", template: "venda", vars, now, dedupeKey: "venda:1" });
  expect(id).toEqual(expect.any(Number));
  expect(await enqueueEmail(db, { toEmail: "f@x.com", toName: "Fulano", template: "venda", vars, now, dedupeKey: "venda:1" })).toBeNull();
  const [r] = await rows();
  expect(r).toMatchObject({ toEmail: "f@x.com", template: "venda", subject: "Seus dados de acesso", status: "queued", attempts: 0 });
  expect(r.html).toContain("https://area.x.com");
  expect(await rows()).toHaveLength(1);
});

test("modelo desativado não entra na fila", async () => {
  await db.insert(platformSettings).values({ id: 1, data: { emails: { templates: { venda: { enabled: false } } } } });
  expect(await enqueueEmail(db, { toEmail: "f@x.com", toName: "F", template: "venda", vars, now })).toBeNull();
  expect(await rows()).toHaveLength(0);
});

test("envia os devidos com remetente e replyTo das configurações", async () => {
  await db.insert(platformSettings).values({ id: 1, data: { siteName: "Escola", emails: { replyTo: "ajuda@x.com" } } });
  await enqueueEmail(db, { toEmail: "f@x.com", toName: "Fulano", template: "venda", vars, now });
  const send = ok();
  expect(await processOutbox(db, { now, send })).toEqual({ sent: 1, failed: 0, deferred: 0 });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ toEmail: "f@x.com", toName: "Fulano", subject: "Seus dados de acesso" }),
    expect.objectContaining({ senderEmail: "nao-responda@x.com", senderName: "Escola", replyTo: "ajuda@x.com" }),
  );
  const [r] = await rows();
  expect(r.status).toBe("sent");
  expect(r.sentAt).toEqual(now);
  expect(await processOutbox(db, { now, send })).toEqual({ sent: 0, failed: 0, deferred: 0 });
});

test("ainda não devido (send_after no futuro) fica para depois", async () => {
  await db.insert(emailOutbox).values({ toEmail: "a@x.com", toName: "A", template: "venda", subject: "s", html: "h", sendAfter: new Date(now.getTime() + 60_000) });
  const send = ok();
  expect(await processOutbox(db, { now, send })).toEqual({ sent: 0, failed: 0, deferred: 0 });
  expect(send).not.toHaveBeenCalled();
});

test("sem BREVO_API_KEY nada é tentado e fica queued", async () => {
  vi.stubEnv("BREVO_API_KEY", "");
  await enqueueEmail(db, { toEmail: "f@x.com", toName: "F", template: "venda", vars, now });
  const send = ok();
  expect(await processOutbox(db, { now, send })).toEqual({ sent: 0, failed: 0, deferred: 0 });
  expect(send).not.toHaveBeenCalled();
  expect((await rows())[0]).toMatchObject({ status: "queued", attempts: 0 });
});

test("limite diário: o excedente vai para 03:00Z do dia seguinte", async () => {
  vi.stubEnv("BREVO_DAILY_LIMIT", "2");
  // 1 já enviado hoje (dia de São Paulo começa 03:00Z)
  await db.insert(emailOutbox).values({ toEmail: "z@x.com", toName: "Z", template: "venda", subject: "s", html: "h", status: "sent", sentAt: new Date("2026-10-16T03:30:00Z") });
  // enviado ontem (horário de SP) não conta
  await db.insert(emailOutbox).values({ toEmail: "y@x.com", toName: "Y", template: "venda", subject: "s", html: "h", status: "sent", sentAt: new Date("2026-10-16T02:30:00Z") });
  for (const e of ["a@x.com", "b@x.com", "c@x.com"]) {
    await db.insert(emailOutbox).values({ toEmail: e, toName: "N", template: "venda", subject: "s", html: "h", sendAfter: new Date(now.getTime() - 1000) });
  }
  const send = ok();
  expect(await processOutbox(db, { now, send })).toEqual({ sent: 1, failed: 0, deferred: 2 });
  const pending = (await rows()).filter((r) => r.status === "queued");
  expect(pending).toHaveLength(2);
  for (const p of pending) expect(p.sendAfter).toEqual(new Date("2026-10-17T03:00:00Z"));
});

test("falha: backoff crescente e dead na 5ª", async () => {
  await enqueueEmail(db, { toEmail: "f@x.com", toName: "F", template: "venda", vars, now });
  const send = vi.fn(async () => ({ ok: false as const, error: "Brevo 503", retryable: true }));
  const steps = [5 * 60_000, 30 * 60_000, 2 * 3600_000, 12 * 3600_000];
  let t = now;
  for (let i = 0; i < 4; i++) {
    expect(await processOutbox(db, { now: t, send })).toEqual({ sent: 0, failed: 1, deferred: 0 });
    const [r] = await rows();
    expect(r).toMatchObject({ status: "failed", attempts: i + 1, lastError: "Brevo 503" });
    expect(r.sendAfter).toEqual(new Date(t.getTime() + steps[i]));
    // antes do intervalo, não tenta de novo
    expect(await processOutbox(db, { now: new Date(r.sendAfter.getTime() - 1000), send })).toEqual({ sent: 0, failed: 0, deferred: 0 });
    t = r.sendAfter;
  }
  expect(await processOutbox(db, { now: t, send })).toEqual({ sent: 0, failed: 1, deferred: 0 });
  expect((await rows())[0]).toMatchObject({ status: "dead", attempts: 5 });
  expect(await processOutbox(db, { now: new Date(t.getTime() + 86_400_000 * 3), send })).toEqual({ sent: 0, failed: 0, deferred: 0 });
  expect(send).toHaveBeenCalledTimes(5);
});

test("falha que volta a dar certo vira sent", async () => {
  await enqueueEmail(db, { toEmail: "f@x.com", toName: "F", template: "venda", vars, now });
  await processOutbox(db, { now, send: vi.fn(async () => ({ ok: false as const, error: "rede", retryable: true })) });
  expect(await processOutbox(db, { now: new Date(now.getTime() + 5 * 60_000), send: ok() })).toEqual({ sent: 1, failed: 0, deferred: 0 });
  expect((await rows())[0]).toMatchObject({ status: "sent", attempts: 2, lastError: null });
});

test("exceção do envio conta como falha sem derrubar o processamento", async () => {
  await enqueueEmail(db, { toEmail: "a@x.com", toName: "A", template: "venda", vars, now });
  await enqueueEmail(db, { toEmail: "b@x.com", toName: "B", template: "venda", vars, now });
  const send = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ ok: true });
  expect(await processOutbox(db, { now, send })).toEqual({ sent: 1, failed: 1, deferred: 0 });
});

test("cron: 401 sem o segredo certo", async () => {
  setDbForTests(db);
  vi.stubEnv("CRON_SECRET", "s3cr3t");
  expect((await cron(new NextRequest("http://x/api/cron/emails"))).status).toBe(401);
  expect((await cron(new NextRequest("http://x/api/cron/emails", { headers: { authorization: "Bearer errado" } }))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "");
  expect((await cron(new NextRequest("http://x/api/cron/emails", { headers: { authorization: "Bearer " } }))).status).toBe(401);
});

test("cron: com o segredo processa a fila e apaga login_attempts vencidas", async () => {
  setDbForTests(db);
  vi.stubEnv("CRON_SECRET", "s3cr3t");
  vi.stubEnv("BREVO_API_KEY", "");
  await db.insert(loginAttempts).values([
    { key: "velha", count: 3, windowStart: new Date(Date.now() - 3600_000) },
    { key: "nova", count: 3, windowStart: new Date() },
  ]);
  const res = await cron(new NextRequest("http://x/api/cron/emails", { headers: { authorization: "Bearer s3cr3t" } }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ sent: 0, failed: 0, deferred: 0, loginAttemptsPurged: 1 });
  const keys = (await db.select().from(loginAttempts)).map((r) => r.key);
  expect(keys).toEqual(["nova"]);
});
