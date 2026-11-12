import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import { kiwifyPayload, kiwifyRaw, type KiwifyFixture } from "../helpers/kiwify";
import type { Database } from "@/db";
import { sales, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { parseKiwify } from "@/lib/sales/kiwify";
import { deleteSale, getSale, listSales, recordSale } from "@/lib/sales/sales-store";

let db: Database;
let admin: User;
let student: User;

beforeEach(async () => {
  db = await createTestDb();
  [admin] = await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t1" }).returning();
  [student] = await db.insert(users).values({ email: "al@x.com", name: "Al", role: "student", passwordHash: "x", loginToken: "t2" }).returning();
});

const record = (name: KiwifyFixture, payload = kiwifyPayload(name)) => recordSale(db, "kiwify", payload, JSON.stringify(payload));

test("parseKiwify extrai os campos dos 4 payloads reais", () => {
  const paid = parseKiwify(kiwifyPayload("paid"));
  expect(paid).toMatchObject({
    orderId: "00000000-0000-4000-8000-000000000005",
    event: "order_approved",
    status: "approved",
    productIds: ["00000000-0000-4000-8000-000000000003"],
    checkoutLink: "chk0001",
    planId: null,
    subscriptionId: null,
    customer: { email: "fulano@exemplo.com", name: "Fulano", document: "00000000000" },
    amountCents: 1114,
    paymentMethod: "credit_card",
  });
  // "2026-10-15 18:04" em Brasília (UTC-3)
  expect(paid.approvedAt?.toISOString()).toBe("2026-10-15T21:04:00.000Z");

  const refunded = parseKiwify(kiwifyPayload("refunded"));
  expect(refunded).toMatchObject({
    orderId: "00000000-0000-4000-8000-000000000010",
    event: "order_refunded",
    status: "refunded",
    // product_id e a oferta (os dois aparecem em "ID do produto no gateway")
    productIds: ["00000000-0000-4000-8000-000000000019", "00000000-0000-4000-8000-000000000015"],
    checkoutLink: "chk0002",
    amountCents: 2790,
    paymentMethod: "pix",
  });

  const cb = parseKiwify(kiwifyPayload("chargedback"));
  expect(cb).toMatchObject({ status: "chargeback", event: "chargeback", checkoutLink: "chk0003", amountCents: 1229 });

  const sub = parseKiwify(kiwifyPayload("subscription-test-paid"));
  expect(sub).toMatchObject({
    status: "approved",
    productIds: ["00000000-0000-4000-8000-000000000002"],
    checkoutLink: null,
    planId: "00000000-0000-4000-8000-000000000016",
    subscriptionId: "00000000-0000-4000-8000-000000000017",
    customer: { email: "fulano@exemplo.com", name: "Fulano", document: "00000000000" }, // veio em `cnpj`
    amountCents: 8914,
  });
});

test("parseKiwify: mapa de status e campos ausentes", () => {
  const p = (extra: Record<string, unknown>) => parseKiwify({ ...kiwifyPayload("paid"), ...extra });
  expect(p({ webhook_event_type: "subscription_canceled" }).status).toBe("canceled");
  expect(p({ webhook_event_type: "subscription_late" }).status).toBe("late");
  expect(p({ webhook_event_type: "subscription_renewed" }).status).toBe("renewed");
  expect(p({ webhook_event_type: "pix_created", order_status: "waiting_payment" }).status).toBe("waiting");
  expect(p({ webhook_event_type: "order_rejected", order_status: "refused" }).status).toBe("refused");
  expect(p({ webhook_event_type: "algo_novo", order_status: "paid" }).status).toBe("approved");
  expect(p({ webhook_event_type: "algo_novo", order_status: "outro" }).status).toBe("other");
  const blank = parseKiwify({ Customer: { email: "  FULANO@Exemplo.COM ", CPF: null, cnpj: "12.345.678/0001-90" } });
  expect(blank.customer).toEqual({ email: "fulano@exemplo.com", name: null, document: "12345678000190" });
  expect(blank.orderId).toBeNull();
  expect(blank.productIds).toEqual([]);
  expect(blank.amountCents).toBeNull();
  expect(parseKiwify("lixo").status).toBe("other");
});

test("recordSale grava as colunas extraídas e o payload cru", async () => {
  const { id, duplicate } = await record("refunded");
  expect(duplicate).toBe(false);
  const [row] = await db.select().from(sales).where(eq(sales.id, id));
  expect(row).toMatchObject({
    gateway: "kiwify",
    orderId: "00000000-0000-4000-8000-000000000010",
    event: "order_refunded",
    status: "refunded",
    processing: "queued",
    customerEmail: "fulano@exemplo.com",
    customerName: "Fulano",
    customerDocument: "00000000000",
    productIds: ["00000000-0000-4000-8000-000000000019", "00000000-0000-4000-8000-000000000015"],
    checkoutLink: "chk0002",
    amountCents: 2790,
    paymentMethod: "pix",
    dedupeKey: "kiwify:00000000-0000-4000-8000-000000000010:order_refunded",
  });
  expect(row.payload).toEqual(kiwifyPayload("refunded"));
  expect(row.id).toBeGreaterThanOrEqual(900000000);
});

test("recordSale: o mesmo evento não duplica; outro evento do mesmo pedido entra", async () => {
  const a = await record("paid");
  const b = await record("paid");
  expect(b).toEqual({ id: a.id, duplicate: true });
  const c = await record("paid", { ...kiwifyPayload("paid"), webhook_event_type: "order_refunded", order_status: "refunded" });
  expect(c.duplicate).toBe(false);
  expect(await db.select().from(sales)).toHaveLength(2);
});

test("recordSale: assinatura diferencia pela quantidade de cobranças", async () => {
  const p = kiwifyPayload("subscription-test-paid");
  const first = await recordSale(db, "kiwify", p, JSON.stringify(p));
  const [row] = await db.select().from(sales).where(eq(sales.id, first.id));
  expect(row.dedupeKey).toBe("kiwify:00000000-0000-4000-8000-000000000007:order_approved:1");
  expect(row.planId).toBe("00000000-0000-4000-8000-000000000016");
  expect(row.subscriptionId).toBe("00000000-0000-4000-8000-000000000017");
  const renewal = structuredClone(p);
  renewal.Subscription.charges.completed.push({ ...p.Subscription.charges.completed[0] });
  expect((await recordSale(db, "kiwify", renewal, JSON.stringify(renewal))).duplicate).toBe(false);
  expect((await recordSale(db, "kiwify", p, JSON.stringify(p))).duplicate).toBe(true);
});

test("recordSale sem order_id usa o hash do corpo como chave", async () => {
  const raw = '{"webhook_event_type":"order_approved"}';
  const a = await recordSale(db, "kiwify", JSON.parse(raw), raw);
  const b = await recordSale(db, "kiwify", JSON.parse(raw), raw);
  expect(b).toEqual({ id: a.id, duplicate: true });
  const [row] = await db.select().from(sales).where(eq(sales.id, a.id));
  expect(row.dedupeKey).toMatch(/^kiwify:sha256:[0-9a-f]{64}$/);
});

test("recordSale aceita o payload exatamente como chegou", async () => {
  const raw = kiwifyRaw("chargedback");
  const { id } = await recordSale(db, "kiwify", JSON.parse(raw), raw);
  expect((await getSale(db, admin, id))?.payload).toEqual(JSON.parse(raw));
});

test("listSales: visões, busca, gateway, paginação e lixeira; só admin", async () => {
  const ids: number[] = [];
  for (let i = 0; i < 25; i++) {
    const p = kiwifyPayload("paid");
    p.order_id = `pedido-${i}`;
    if (i === 3) p.Customer = { ...p.Customer, email: "OUTRA@x.com", full_name: "Beltrano", CPF: "111.222.333-44" };
    ids.push((await recordSale(db, "kiwify", p, JSON.stringify(p))).id);
  }
  await db.update(sales).set({ processing: "error", error: "x" }).where(eq(sales.id, ids[1]));
  await db.update(sales).set({ processing: "processed" }).where(eq(sales.id, ids[2]));

  const page1 = await listSales(db, admin, { view: "latest" });
  expect(page1.rows).toHaveLength(20);
  expect(page1.rows[0].id).toBe(ids[24]); // mais recente primeiro
  expect(page1.nextCursor).toBe(ids[5]);
  const page2 = await listSales(db, admin, { view: "latest", cursor: page1.nextCursor!, loaded: 20 });
  expect(page2.rows.map((r) => r.id)).toEqual([ids[4], ids[3], ids[2], ids[1], ids[0]]);
  expect(page2.nextCursor).toBeNull();

  expect((await listSales(db, admin, { view: "error" })).rows.map((r) => r.id)).toEqual([ids[1]]);
  expect((await listSales(db, admin, { view: "queued" })).rows.map((r) => r.id)).not.toContain(ids[1]);
  const byEmail = await listSales(db, admin, { view: "latest", search: { field: "email", q: "outra@" } });
  expect(byEmail.rows.map((r) => r.id)).toEqual([ids[3]]);
  expect((await listSales(db, admin, { view: "latest", search: { field: "name", q: "beltr" } })).rows).toHaveLength(1);
  expect((await listSales(db, admin, { view: "latest", search: { field: "document", q: "111.222" } })).rows).toHaveLength(1);
  expect((await listSales(db, admin, { view: "latest", search: { field: "order", q: "pedido-7" } })).rows.map((r) => r.id)).toEqual([ids[7]]);
  expect((await listSales(db, admin, { view: "latest", search: { field: "subscription", q: "x" } })).rows).toHaveLength(0);
  expect((await listSales(db, admin, { view: "latest", gateways: ["stripe"] })).rows).toHaveLength(0);
  expect((await listSales(db, admin, { view: "latest", gateways: ["kiwify"] })).rows).toHaveLength(20);

  await deleteSale(db, admin, ids[24]);
  expect((await listSales(db, admin, { view: "latest" })).rows[0].id).toBe(ids[23]);
  expect(await getSale(db, admin, ids[24])).toBeNull();

  await expect(listSales(db, student, { view: "latest" })).rejects.toThrow("administradores");
  await expect(deleteSale(db, student, ids[0])).rejects.toThrow("administradores");
});

test("listSales para em 200", async () => {
  for (let i = 0; i < 205; i++) {
    const p = { order_id: `p-${i}`, webhook_event_type: "order_approved" };
    await recordSale(db, "kiwify", p, JSON.stringify(p));
  }
  let cursor: number | null | undefined;
  let loaded = 0;
  let res;
  do {
    res = await listSales(db, admin, { view: "latest", cursor: cursor ?? undefined, loaded });
    loaded += res.rows.length;
    cursor = res.nextCursor;
  } while (cursor);
  expect(loaded).toBe(200);
  expect(res.limitReached).toBe(true);
});
