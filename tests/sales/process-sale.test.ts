import { and, eq, sql } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { kiwifyPayload, type KiwifyFixture } from "../helpers/kiwify";
import type { Database } from "@/db";
import { deliveries, emailOutbox, fullAccess, platformSettings, productAccess, products, sales, showcases, users, userTags } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import type { User } from "@/lib/auth/sessions";
import { getActiveAccessProductIds } from "@/lib/catalog/access";
import { createDelivery, type DeliveryItemInput } from "@/lib/sales/deliveries";
import { processSale, reprocessStaleQueue } from "@/lib/sales/process-sale";
import { recordSale } from "@/lib/sales/sales-store";
import { createTag } from "@/lib/sales/tags";

const APP = { appUrl: "https://alunos.exemplo.com" };
const PAID_PRODUCT = "00000000-0000-4000-8000-000000000003";
const PAID_ORDER = "00000000-0000-4000-8000-000000000005";
const NOW = new Date("2026-10-16T12:00:00Z");

let db: Database;
let admin: User;
let root: number;
let sub: number;
let manual: number;
let gera: number;
let pA: number;
let pB: number;
let pSub: number;

beforeEach(async () => {
  db = await createTestDb();
  [admin] = await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t-ad" }).returning();
  [{ id: root }] = await db.insert(showcases).values({ name: "Formação", status: "published" }).returning();
  [{ id: sub }] = await db.insert(showcases).values({ name: "Sub", status: "published", parentId: root }).returning();
  const [other] = await db.insert(showcases).values({ name: "Outra", status: "published" }).returning();
  [{ id: manual }, { id: gera }, { id: pA }, { id: pB }] = await db
    .insert(products)
    .values([
      { showcaseId: other.id, name: "Curso de Exemplo", status: "published" },
      { showcaseId: other.id, name: "Produto Exemplo B", status: "published" },
      { showcaseId: root, name: "Produto A", status: "published" },
      { showcaseId: root, name: "Produto B", status: "hidden" },
    ])
    .returning();
  [{ id: pSub }] = await db.insert(products).values({ showcaseId: sub, name: "Produto Sub", status: "published" }).returning();
  await db.insert(products).values({ showcaseId: sub, name: "Excluído", status: "published", deletedAt: NOW });
});

const item = (targetType: DeliveryItemInput["targetType"], targetId: number | null, durationType: DeliveryItemInput["durationType"] = "lifetime", duration: number | null = null): DeliveryItemInput => ({
  targetType,
  targetId,
  durationType,
  duration,
  scheduleId: null,
});

async function delivery(codes: string[], items: DeliveryItemInput[], tagIds: number[] = []) {
  return (await createDelivery(db, admin, { name: `Entrega ${codes[0]}`, type: "single", codes, items, tagIds })).id;
}

async function receive(payload: Record<string, unknown>) {
  return (await recordSale(db, "kiwify", payload, JSON.stringify(payload))).id;
}

const fixture = (name: KiwifyFixture, over: Record<string, unknown> = {}) => ({ ...kiwifyPayload(name), ...over });
const saleRow = async (id: number) => (await db.select().from(sales).where(eq(sales.id, id)))[0];
const outbox = () => db.select().from(emailOutbox);
const userByEmail = async (email: string) => (await db.select().from(users).where(eq(users.email, email)))[0];

async function student(email: string, document: string | null, name = "Aluno Antigo"): Promise<User> {
  const [u] = await db.insert(users).values({ email, name, document, role: "student", passwordHash: "x", loginToken: `tok-${email}` }).returning();
  return u;
}

test("aprovada cria o aluno, libera a entrega (1 ano / vitalício), aplica tags e enfileira `venda`", async () => {
  const tag = await createTag(db, admin, "GARANTIA");
  const d = await delivery([PAID_PRODUCT], [item("product", manual, "years", 1), item("product", gera)], [tag.id]);
  const id = await receive(fixture("paid"));
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");

  const u = await userByEmail("fulano@exemplo.com");
  expect(u).toMatchObject({ name: "Fulano", document: "00000000000", role: "student" });
  expect(await verifyPassword("123456", u.passwordHash)).toBe(true); // senha padrão das configurações
  const access = await db.select().from(productAccess).where(eq(productAccess.userId, u.id));
  expect(access.map((a) => [a.productId, a.source, a.saleRef, a.deliveryId, a.expiresAt?.toISOString() ?? null]).sort()).toEqual(
    [
      [manual, "sale", PAID_ORDER, d, "2027-10-15T21:04:00.000Z"],
      [gera, "sale", PAID_ORDER, d, null],
    ].sort(),
  );
  expect(access.every((a) => a.startsAt.toISOString() === "2026-10-15T21:04:00.000Z")).toBe(true);
  expect(await db.select().from(userTags).where(eq(userTags.userId, u.id))).toEqual([{ userId: u.id, tagId: tag.id }]);

  const mails = await outbox();
  expect(mails).toHaveLength(1);
  expect(mails[0]).toMatchObject({ toEmail: "fulano@exemplo.com", template: "venda", dedupeKey: `sale:${id}` });
  expect(mails[0].html).toContain("123456");
  expect(mails[0].html).toContain(`https://alunos.exemplo.com/auth/login?login_token=${encodeURIComponent(u.loginToken)}`);

  const row = await saleRow(id);
  expect(row).toMatchObject({ processing: "processed", error: null, notice: null, userId: u.id, deliveryId: d });
  expect(row.processedAt).toEqual(NOW);
  const [del] = await db.select().from(deliveries).where(eq(deliveries.id, d));
  expect(del.lastSaleAt).toEqual(row.receivedAt);

  // reprocessar não duplica nada
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");
  expect(await db.select().from(productAccess).where(eq(productAccess.userId, u.id))).toHaveLength(2);
  expect(await db.select().from(users)).toHaveLength(2);
  expect(await outbox()).toHaveLength(1);
});

test("aluno existente (casado pelo CPF) recebe `novoacesso` e mantém nome e e-mail", async () => {
  const old = await student("antigo@x.com", "000.000.000-00");
  await delivery([PAID_PRODUCT], [item("product", manual, "years", 1), item("product", gera)]);
  const id = await receive(fixture("paid"));
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");
  const u = (await db.select().from(users).where(eq(users.id, old.id)))[0];
  expect(u).toMatchObject({ email: "antigo@x.com", name: "Aluno Antigo", passwordHash: "x" });
  expect(await db.select().from(users)).toHaveLength(2);
  const mails = await outbox();
  expect(mails).toHaveLength(1);
  expect(mails[0]).toMatchObject({ toEmail: "antigo@x.com", template: "novoacesso", dedupeKey: `sale:${id}` });
  expect(mails[0].html).toContain("Curso de Exemplo");
  expect(mails[0].html).toContain("Produto Exemplo B");
  expect((await getActiveAccessProductIds(db, u.id, NOW)).has(manual)).toBe(true);
});

test("Review Focus 1: reembolso tira só o que a venda deu (A continua pela outra venda)", async () => {
  await delivery(["prod-A"], [item("product", pA)]);
  await delivery(["prod-AB"], [item("product", pA), item("product", pB)]);
  const base = kiwifyPayload("paid");
  const x = await receive({ ...base, order_id: "venda-x", Product: { product_id: "prod-A", product_name: "A" }, checkout_link: null });
  const y = await receive({ ...base, order_id: "venda-y", Product: { product_id: "prod-AB", product_name: "AB" }, checkout_link: null });
  expect(await processSale(db, x, { ...APP, now: NOW })).toBe("processed");
  expect(await processSale(db, y, { ...APP, now: NOW })).toBe("processed");
  const u = await userByEmail("fulano@exemplo.com");
  expect([...(await getActiveAccessProductIds(db, u.id, NOW))].sort()).toEqual([pA, pB].sort());

  const refund = await receive({
    ...kiwifyPayload("refunded"),
    order_id: "venda-y",
    Product: { product_id: "prod-AB", product_name: "AB" },
    checkout_link: null,
  });
  expect(await processSale(db, refund, { ...APP, now: NOW })).toBe("processed");
  expect([...(await getActiveAccessProductIds(db, u.id, NOW))]).toEqual([pA]);
  const rows = await db.select().from(productAccess).where(eq(productAccess.userId, u.id));
  expect(rows.filter((r) => r.revokedAt).map((r) => [r.productId, r.saleRef]).sort()).toEqual([[pA, "venda-y"], [pB, "venda-y"]].sort());
  expect(await saleRow(refund)).toMatchObject({ processing: "processed", notice: null, userId: u.id });
  expect(await outbox()).toHaveLength(2); // venda + novoacesso; o reembolso não manda e-mail
});

test("Review Focus 2: reembolso de venda anterior à plataforma remove a entrega casada, exceto o que vem de outra fonte", async () => {
  const REFUND_PRODUCT = "00000000-0000-4000-8000-000000000019";
  const d = await delivery([REFUND_PRODUCT], [item("product", manual, "years", 1), item("product", gera), item("product", pA)]);
  const u = await student("fulano@exemplo.com", null);
  const old = new Date("2026-01-01Z");
  const legacy = { userId: u.id, source: "sale" as const, saleRef: null, deliveryId: d, startsAt: old };
  await db.insert(productAccess).values([
    { ...legacy, productId: manual },
    { ...legacy, productId: gera },
    { userId: u.id, productId: gera, source: "manual", startsAt: old }, // Produto Exemplo B também por acesso manual
    { userId: u.id, productId: pA, source: "sale", saleRef: "outra-venda", deliveryId: null, startsAt: old }, // A por outra venda
    { userId: u.id, productId: pB, source: "import", startsAt: old }, // fora da entrega
  ]);
  const id = await receive(fixture("refunded"));
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");
  expect([...(await getActiveAccessProductIds(db, u.id, NOW))].sort()).toEqual([gera, pA, pB].sort());
  const row = await saleRow(id);
  expect(row).toMatchObject({ processing: "processed", notice: "Venda anterior à plataforma: conferir", userId: u.id, deliveryId: d });
  // reprocessar é idempotente
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");
  expect([...(await getActiveAccessProductIds(db, u.id, NOW))].sort()).toEqual([gera, pA, pB].sort());
});

test("venda anterior à plataforma de cliente desconhecido: processada com aviso, sem criar aluno", async () => {
  await delivery(["00000000-0000-4000-8000-000000000019"], [item("product", manual)]);
  const id = await receive(fixture("refunded"));
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");
  expect(await saleRow(id)).toMatchObject({ processing: "processed", notice: "Venda anterior à plataforma: conferir", userId: null });
  expect(await db.select().from(users)).toHaveLength(1);
});

test("sem entrega: erro com o texto explicativo; depois de criar a entrega, reprocessar libera", async () => {
  const cb = await receive(fixture("chargedback"));
  expect(await processSale(db, cb, { ...APP, now: NOW })).toBe("error");
  expect((await saleRow(cb)).error).toBe(
    "Erro ao construir carga: Não existe nenhuma entrega configurada para o ID: chk0003, 00000000-0000-4000-8000-000000000013",
  );

  const id = await receive(fixture("paid"));
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("error");
  expect(await saleRow(id)).toMatchObject({
    processing: "error",
    error: `Erro ao construir carga: Não existe nenhuma entrega configurada para o ID: chk0001, ${PAID_PRODUCT}`,
    userId: null,
  });
  expect(await db.select().from(users)).toHaveLength(1); // nada criado (transação desfeita)

  await delivery(["chk0001"], [item("product", manual)]);
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");
  expect(await saleRow(id)).toMatchObject({ processing: "processed", error: null });
  const u = await userByEmail("fulano@exemplo.com");
  expect((await getActiveAccessProductIds(db, u.id, NOW)).has(manual)).toBe(true);
});

test("produto na lista de ignorados: `ignored`, sem efeito", async () => {
  await db.insert(platformSettings).values({ id: 1, data: { kiwify: { ignoredProductIds: [PAID_PRODUCT] } } });
  await delivery([PAID_PRODUCT], [item("product", manual)]);
  const id = await receive(fixture("paid"));
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("ignored");
  expect(await saleRow(id)).toMatchObject({ processing: "ignored" });
  expect(await db.select().from(users)).toHaveLength(1);
});

test("aguardando pagamento e recusada: processadas sem efeito", async () => {
  await delivery([PAID_PRODUCT], [item("product", manual)]);
  const w = await receive(fixture("paid", { webhook_event_type: "pix_created", order_status: "waiting_payment" }));
  const r = await receive(fixture("paid", { webhook_event_type: "order_rejected", order_status: "refused" }));
  expect(await processSale(db, w, { ...APP, now: NOW })).toBe("processed");
  expect(await processSale(db, r, { ...APP, now: NOW })).toBe("processed");
  expect(await db.select().from(users)).toHaveLength(1);
  expect(await db.select().from(productAccess)).toHaveLength(0);
});

test("Review Focus 3: o mesmo evento 3 vezes em paralelo → um aluno, um conjunto de acessos, um e-mail", async () => {
  await delivery([PAID_PRODUCT], [item("product", manual, "years", 1), item("product", gera)]);
  const p = kiwifyPayload("paid");
  const recorded = await Promise.all([1, 2, 3].map(() => recordSale(db, "kiwify", p, JSON.stringify(p))));
  expect(recorded.filter((r) => !r.duplicate)).toHaveLength(1);
  await Promise.all(recorded.map((r) => processSale(db, r.id, { ...APP, now: NOW })));
  expect(await db.select().from(users).where(eq(users.role, "student"))).toHaveLength(1);
  expect(await db.select().from(productAccess)).toHaveLength(2);
  expect(await outbox()).toHaveLength(1);
  expect(await db.select().from(sales)).toHaveLength(1);
});

test("Review Focus 5: sem CPF, com CNPJ, e-mail em maiúsculas, e-mail vazio, sem e-mail nem documento", async () => {
  await delivery([PAID_PRODUCT], [item("product", manual)]);
  const base = kiwifyPayload("paid");
  const customer = (c: Record<string, unknown>, order: string) => ({ ...base, order_id: order, Customer: { ...base.Customer, ...c } });

  // sem CPF, e-mail em maiúsculas → casa pelo e-mail normalizado
  const byEmail = await student("maiusculo@x.com", null, "Por E-mail");
  const s1 = await receive(customer({ CPF: null, email: "  MAIUSCULO@X.COM " }, "o-1"));
  expect(await processSale(db, s1, { ...APP, now: NOW })).toBe("processed");
  expect((await saleRow(s1)).userId).toBe(byEmail.id);

  // CNPJ (sem CPF) → casa pelo documento
  const byCnpj = await student("empresa@x.com", "12345678000190", "Empresa");
  const s2 = await receive(customer({ CPF: null, cnpj: "12.345.678/0001-90", email: "outro@x.com" }, "o-2"));
  expect(await processSale(db, s2, { ...APP, now: NOW })).toBe("processed");
  expect((await saleRow(s2)).userId).toBe(byCnpj.id);
  expect(await userByEmail("outro@x.com")).toBeUndefined();

  // e-mail vazio, CPF de um aluno existente
  const byCpf = await student("cpf@x.com", "98765432100", "Por CPF");
  const s3 = await receive(customer({ CPF: "987.654.321-00", email: "" }, "o-3"));
  expect(await processSale(db, s3, { ...APP, now: NOW })).toBe("processed");
  expect((await saleRow(s3)).userId).toBe(byCpf.id);

  // sem CPF, e-mail novo → cria
  const s4 = await receive(customer({ CPF: null, email: "Novo@X.com" }, "o-4"));
  expect(await processSale(db, s4, { ...APP, now: NOW })).toBe("processed");
  expect((await userByEmail("novo@x.com"))?.document).toBeNull();

  // sem e-mail e sem documento
  const s5 = await receive(customer({ CPF: null, cnpj: null, email: null }, "o-5"));
  expect(await processSale(db, s5, { ...APP, now: NOW })).toBe("error");
  expect((await saleRow(s5)).error).toBe("Venda sem e-mail e sem CPF/CNPJ do cliente: não foi possível identificar o aluno.");

  // sem e-mail, com documento que ninguém tem
  const s6 = await receive(customer({ CPF: "111.111.111-11", email: "" }, "o-6"));
  expect(await processSale(db, s6, { ...APP, now: NOW })).toBe("error");
  expect((await saleRow(s6)).error).toBe("Venda sem e-mail do cliente: não foi possível criar o aluno.");
});

test("vitrine entrega os produtos dela e das subvitrines; `all` vira acesso completo", async () => {
  await delivery([PAID_PRODUCT], [item("showcase", root, "days", 30)]);
  const id = await receive(fixture("paid"));
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");
  const u = await userByEmail("fulano@exemplo.com");
  const rows = await db.select().from(productAccess).where(eq(productAccess.userId, u.id));
  expect(rows.map((r) => r.productId).sort()).toEqual([pA, pB, pSub].sort());
  expect(rows[0].expiresAt?.toISOString()).toBe("2026-11-14T21:04:00.000Z");

  const all = await delivery(["clube"], [item("all", null)]);
  const s2 = await receive({ ...kiwifyPayload("paid"), order_id: "clube-1", Product: { product_id: "clube" }, checkout_link: null });
  expect(await processSale(db, s2, { ...APP, now: NOW })).toBe("processed");
  const fa = await db.select().from(fullAccess).where(eq(fullAccess.userId, u.id));
  expect(fa).toHaveLength(1);
  expect(fa[0]).toMatchObject({ source: "sale", saleRef: "clube-1", deliveryId: all, expiresAt: null, revokedAt: null });
  expect((await getActiveAccessProductIds(db, u.id, NOW)).has(manual)).toBe(true);
  expect((await outbox()).map((m) => m.template)).toEqual(["venda", "novoacesso"]);

  const refund = await receive({ ...kiwifyPayload("refunded"), order_id: "clube-1", Product: { product_id: "clube" }, checkout_link: null });
  expect(await processSale(db, refund, { ...APP, now: NOW })).toBe("processed");
  expect((await db.select().from(fullAccess).where(eq(fullAccess.userId, u.id)))[0].revokedAt).toEqual(NOW);
  expect((await getActiveAccessProductIds(db, u.id, NOW)).has(manual)).toBe(false);
});

test("assinatura: acesso pela recorrência; renovação estende; cancelamento revoga", async () => {
  await delivery(["00000000-0000-4000-8000-000000000016"], [item("product", manual, "months", 1)]);
  const p = kiwifyPayload("subscription-test-paid");
  const first = await receive(p);
  expect(await processSale(db, first, { ...APP, now: NOW })).toBe("processed");
  const u = await userByEmail("fulano@exemplo.com");
  const [row] = await db.select().from(productAccess).where(eq(productAccess.userId, u.id));
  expect(row).toMatchObject({ saleRef: "00000000-0000-4000-8000-000000000017" });
  expect(row.expiresAt?.toISOString()).toBe("2026-10-20T05:12:00.000Z");

  const renewal = structuredClone(p);
  renewal.webhook_event_type = "subscription_renewed";
  renewal.order_id = "renovacao-1";
  renewal.approved_date = "2026-10-20 02:12";
  const r = await receive(renewal);
  expect(await processSale(db, r, { ...APP, now: NOW })).toBe("processed");
  const rows = await db.select().from(productAccess).where(eq(productAccess.userId, u.id));
  expect(rows).toHaveLength(1);
  expect(rows[0].expiresAt?.toISOString()).toBe("2026-11-20T05:12:00.000Z");

  const cancel = structuredClone(p);
  cancel.webhook_event_type = "subscription_canceled";
  cancel.order_id = "cancelamento-1";
  const c = await receive(cancel);
  expect(await processSale(db, c, { ...APP, now: NOW })).toBe("processed");
  expect((await db.select().from(productAccess).where(and(eq(productAccess.userId, u.id))))[0].revokedAt).toEqual(NOW);
});

test("reprocessStaleQueue processa só as da fila com mais de 5 minutos", async () => {
  await delivery([PAID_PRODUCT], [item("product", manual)]);
  const old = await receive(fixture("paid"));
  const recent = await receive(fixture("paid", { order_id: "recente" }));
  await db.update(sales).set({ receivedAt: new Date(NOW.getTime() - 6 * 60_000) }).where(eq(sales.id, old));
  await db.update(sales).set({ receivedAt: new Date(NOW.getTime() - 60_000) }).where(eq(sales.id, recent));
  expect(await reprocessStaleQueue(db, { ...APP, now: NOW })).toEqual({ processed: 1, error: 0, ignored: 0 });
  expect((await saleRow(old)).processing).toBe("processed");
  expect((await saleRow(recent)).processing).toBe("queued");
});

test("venda inexistente ou na lixeira: erro sem efeito", async () => {
  await expect(processSale(db, 123, { ...APP, now: NOW })).resolves.toBe("error");
});

// ---------- ordem aprovação/reembolso (I1) ----------

const REFUND_TEXT = "Venda reembolsada: acesso não liberado";
const refundOf = (over: Record<string, unknown> = {}) =>
  fixture("refunded", { order_id: PAID_ORDER, Product: kiwifyPayload("paid").Product, checkout_link: "chk0001", ...over });

test("reprocessar a aprovação depois do reembolso não devolve o acesso", async () => {
  await delivery([PAID_PRODUCT], [item("product", manual), item("product", gera)]);
  const ok = await receive(fixture("paid"));
  expect(await processSale(db, ok, { ...APP, now: NOW })).toBe("processed");
  const refund = await receive(refundOf());
  expect(await processSale(db, refund, { ...APP, now: NOW })).toBe("processed");
  const u = await userByEmail("fulano@exemplo.com");
  expect((await getActiveAccessProductIds(db, u.id, NOW)).size).toBe(0);

  expect(await processSale(db, ok, { ...APP, now: NOW })).toBe("processed");
  expect((await getActiveAccessProductIds(db, u.id, NOW)).size).toBe(0);
  expect(await saleRow(ok)).toMatchObject({ processing: "processed", notice: REFUND_TEXT });
});

test("reembolso processado antes da aprovação (fora de ordem): a aprovação não libera", async () => {
  await delivery([PAID_PRODUCT], [item("product", manual)]);
  const refund = await receive(refundOf());
  expect(await processSale(db, refund, { ...APP, now: NOW })).toBe("processed");
  const ok = await receive(fixture("paid"));
  expect(await processSale(db, ok, { ...APP, now: NOW })).toBe("processed");
  expect(await saleRow(ok)).toMatchObject({ processing: "processed", notice: REFUND_TEXT });
  expect(await db.select().from(productAccess)).toHaveLength(0);
  expect(await outbox()).toHaveLength(0);
});

test("aprovação na fila (after falhou) e reembolso chega: sem a regra de venda antiga; a aprovação depois não libera", async () => {
  const d = await delivery([PAID_PRODUCT], [item("product", manual)]);
  const u = await student("fulano@exemplo.com", null);
  // acesso antigo da mesma entrega, que a regra legada removeria
  await db.insert(productAccess).values({ userId: u.id, productId: manual, source: "import", saleRef: null, deliveryId: d, startsAt: new Date("2026-01-01Z") });
  const ok = await receive(fixture("paid")); // fica na fila
  const refund = await receive(refundOf());
  expect(await processSale(db, refund, { ...APP, now: NOW })).toBe("processed");
  expect((await saleRow(refund)).notice).toBeNull();
  expect((await getActiveAccessProductIds(db, u.id, NOW)).has(manual)).toBe(true); // legado intacto
  expect(await processSale(db, ok, { ...APP, now: NOW })).toBe("processed");
  expect((await saleRow(ok)).notice).toBe(REFUND_TEXT);
  expect(await db.select().from(productAccess).where(eq(productAccess.saleRef, PAID_ORDER))).toHaveLength(0);
});

test("aprovação e reembolso do mesmo pedido em paralelo: no fim, sem acesso", async () => {
  // No PGlite as transações são serializadas; em Postgres a garantia vem da trava por pedido.
  await delivery([PAID_PRODUCT], [item("product", manual)]);
  const ok = await receive(fixture("paid"));
  const refund = await receive(refundOf());
  await Promise.all([processSale(db, ok, { ...APP, now: NOW }), processSale(db, refund, { ...APP, now: NOW })]);
  const u = await userByEmail("fulano@exemplo.com");
  if (u) expect((await getActiveAccessProductIds(db, u.id, NOW)).size).toBe(0);
  await Promise.all([processSale(db, refund, { ...APP, now: NOW }), processSale(db, ok, { ...APP, now: NOW })]);
  if (u) expect((await getActiveAccessProductIds(db, u.id, NOW)).size).toBe(0);
});

test("cancelamento de assinatura não bloqueia a renovação seguinte", async () => {
  await delivery(["00000000-0000-4000-8000-000000000016"], [item("product", manual, "months", 1)]);
  const p = kiwifyPayload("subscription-test-paid");
  const late = structuredClone(p);
  late.webhook_event_type = "subscription_late";
  const first = await receive(p);
  await processSale(db, first, { ...APP, now: NOW });
  await processSale(db, await receive(late), { ...APP, now: NOW });
  const renewal = structuredClone(p);
  renewal.webhook_event_type = "subscription_renewed";
  renewal.order_id = "renovacao-2";
  const r = await receive(renewal);
  expect(await processSale(db, r, { ...APP, now: NOW })).toBe("processed");
  const u = await userByEmail("fulano@exemplo.com");
  expect((await getActiveAccessProductIds(db, u.id, NOW)).has(manual)).toBe(true);
});

// ---------- fontes revogadas (I2) ----------

test("reembolso revoga acesso importado ligado à venda; manual nunca", async () => {
  const d = await delivery([PAID_PRODUCT], [item("product", manual), item("product", gera)]);
  const u = await student("fulano@exemplo.com", null);
  const old = new Date("2026-01-01Z");
  await db.insert(productAccess).values([
    { userId: u.id, productId: manual, source: "import", saleRef: PAID_ORDER, deliveryId: d, startsAt: old },
    { userId: u.id, productId: gera, source: "manual", saleRef: PAID_ORDER, startsAt: old },
  ]);
  const refund = await receive(refundOf());
  expect(await processSale(db, refund, { ...APP, now: NOW })).toBe("processed");
  expect([...(await getActiveAccessProductIds(db, u.id, NOW))]).toEqual([gera]);
  expect((await saleRow(refund)).notice).toBeNull();
});

test("venda antiga: revoga linhas sem referência de venda ou importação da entrega; mantém manual e outra venda", async () => {
  const REFUND_PRODUCT = "00000000-0000-4000-8000-000000000019";
  const d = await delivery([REFUND_PRODUCT], [item("product", manual), item("product", gera), item("product", pA)]);
  const u = await student("fulano@exemplo.com", null);
  const old = new Date("2026-01-01Z");
  await db.insert(productAccess).values([
    { userId: u.id, productId: manual, source: "import", saleRef: null, deliveryId: d, startsAt: old },
    { userId: u.id, productId: gera, source: "manual", saleRef: null, startsAt: old },
    { userId: u.id, productId: pA, source: "import", saleRef: "outro-pedido", deliveryId: d, startsAt: old },
  ]);
  const id = await receive(fixture("refunded"));
  expect(await processSale(db, id, { ...APP, now: NOW })).toBe("processed");
  expect([...(await getActiveAccessProductIds(db, u.id, NOW))].sort()).toEqual([gera, pA].sort());
  expect((await saleRow(id)).notice).toBe("Venda anterior à plataforma: conferir");
});

// ---------- log sem dados (I3) ----------

test("erro inesperado: o log não traz SQL, parâmetros nem dados do cliente", async () => {
  await delivery([PAID_PRODUCT], [item("product", manual)]);
  await db.execute(sql`drop table delivery_tags`);
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const id = await receive(fixture("paid"));
    expect(await processSale(db, id, { ...APP, now: NOW })).toBe("error");
    const logged = spy.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("DrizzleQueryError");
    expect(logged).toContain("42P01");
    expect(logged).not.toMatch(/Failed query|params|fulano|select/i);
  } finally {
    spy.mockRestore();
  }
});
