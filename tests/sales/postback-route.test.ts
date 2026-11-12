import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { kiwifyRaw } from "../helpers/kiwify";
import { setDbForTests, type Database } from "@/db";
import { platformSettings, productAccess, products, sales, showcases, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { createDelivery } from "@/lib/sales/deliveries";

const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void afterQueue.push(fn) }));
const flush = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send-now", () => ({ scheduleOutboxFlush: flush }));

import { POST } from "@/app/api/postback/kiwify/[secret]/route";
import { GET as cron } from "@/app/api/cron/emails/route";

const SECRET = "s".repeat(40) + "_-9";
let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  afterQueue.length = 0;
  flush.mockClear();
  await db.insert(platformSettings).values({ id: 1, data: { kiwify: { webhookSecret: SECRET } } });
  const [admin] = (await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t" }).returning()) as User[];
  const [sc] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  const [p] = await db.insert(products).values({ showcaseId: sc.id, name: "Manual", status: "published" }).returning();
  await createDelivery(db, admin, {
    name: "Manual",
    type: "single",
    codes: ["00000000-0000-4000-8000-000000000003"],
    items: [{ targetType: "product", targetId: p.id, durationType: "lifetime", duration: null, scheduleId: null }],
    tagIds: [],
  });
});
afterEach(() => {
  setDbForTests(null);
  vi.unstubAllEnvs();
});

const call = (secret: string, body: string, query = "") =>
  POST(new NextRequest(`https://alunos.exemplo.com/api/postback/kiwify/${secret}${query}`, { method: "POST", body, headers: { "content-type": "application/json" } }), {
    params: Promise.resolve({ secret }),
  });
const runAfter = async () => {
  for (const fn of afterQueue.splice(0)) await fn();
};

test("segredo certo: grava, responde 200 e processa depois da resposta", async () => {
  const res = await call(SECRET, kiwifyRaw("paid"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  const [row] = await db.select().from(sales);
  expect(row.processing).toBe("queued");
  expect(afterQueue).toHaveLength(1);
  expect(flush).not.toHaveBeenCalled();
  await runAfter();
  expect(flush).toHaveBeenCalledTimes(1); // depois do processamento
  expect((await db.select().from(sales))[0].processing).toBe("processed");
  expect(await db.select().from(productAccess)).toHaveLength(1);
});

test("401 com segredo errado ou sem segredo configurado; nada é gravado", async () => {
  expect((await call("errado", kiwifyRaw("paid"))).status).toBe(401);
  expect((await call(SECRET.slice(0, -1) + "X", kiwifyRaw("paid"))).status).toBe(401);
  await db.update(platformSettings).set({ data: {} });
  expect((await call(SECRET, kiwifyRaw("paid"))).status).toBe(401);
  expect(await db.select().from(sales)).toHaveLength(0);
});

test("400 para corpo que não é JSON (ou não é objeto)", async () => {
  expect((await call(SECRET, "isto não é json")).status).toBe(400);
  expect((await call(SECRET, "[1,2]")).status).toBe(400);
  expect(await db.select().from(sales)).toHaveLength(0);
});

test("413 para corpo acima de 1 MB", async () => {
  const big = JSON.stringify({ order_id: "x", lixo: "a".repeat(1024 * 1024) });
  expect((await call(SECRET, big)).status).toBe(413);
  expect(await db.select().from(sales)).toHaveLength(0);
});

test("com token configurado: exige a assinatura (query ou corpo)", async () => {
  await db.update(platformSettings).set({ data: { kiwify: { webhookSecret: SECRET, signatureToken: "tok-kiwify" } } });
  const raw = kiwifyRaw("paid");
  const sig = createHmac("sha1", "tok-kiwify").update(raw).digest("hex");
  expect((await call(SECRET, raw)).status).toBe(401);
  expect((await call(SECRET, raw, "?signature=deadbeef")).status).toBe(401);
  expect(await db.select().from(sales)).toHaveLength(0);
  expect((await call(SECRET, raw, `?signature=${sig}`)).status).toBe(200);

  // Assinatura no campo `signature` do corpo: o HMAC é do corpo sem esse campo.
  const { signature: _ignored, ...rest } = JSON.parse(kiwifyRaw("refunded"));
  void _ignored;
  const unsigned = JSON.stringify(rest);
  const bodySig = createHmac("sha1", "tok-kiwify").update(unsigned).digest("hex");
  expect((await call(SECRET, JSON.stringify({ ...rest, signature: bodySig }))).status).toBe(200);
  expect((await call(SECRET, JSON.stringify({ ...rest, order_id: "adulterado", signature: bodySig }))).status).toBe(401);
});

test("evento repetido: 200 sem novo processamento", async () => {
  expect((await call(SECRET, kiwifyRaw("paid"))).status).toBe(200);
  await runAfter();
  const res = await call(SECRET, kiwifyRaw("paid"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, duplicate: true });
  expect(afterQueue).toHaveLength(0);
  expect(await db.select().from(sales)).toHaveLength(1);
});

test("erro de processamento vira 'Com erro', nunca 500", async () => {
  const res = await call(SECRET, kiwifyRaw("chargedback"));
  expect(res.status).toBe(200);
  await runAfter();
  const [row] = await db.select().from(sales);
  expect(row.processing).toBe("error");
});

test("cron reprocessa as vendas paradas na fila há mais de 5 minutos", async () => {
  vi.stubEnv("CRON_SECRET", "s3cr3t");
  vi.stubEnv("BREVO_API_KEY", "");
  expect((await call(SECRET, kiwifyRaw("paid"))).status).toBe(200);
  afterQueue.length = 0; // o after() "não rodou"
  await db.update(sales).set({ receivedAt: new Date(Date.now() - 10 * 60_000) });
  const res = await cron(new NextRequest("http://x/api/cron/emails", { headers: { authorization: "Bearer s3cr3t" } }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ sales: { processed: 1, error: 0, ignored: 0 } });
  expect((await db.select().from(sales))[0].processing).toBe("processed");
});
