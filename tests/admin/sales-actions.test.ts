import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { kiwifyPayload, kiwifyRaw } from "../helpers/kiwify";
import { setDbForTests, type Database } from "@/db";
import { products, sales, showcases, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { createDelivery } from "@/lib/sales/deliveries";
import { recordSale } from "@/lib/sales/sales-store";
import { getPlatformSettings } from "@/lib/settings";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "alunos.exemplo.com", "x-forwarded-proto": "https" }),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
const flush = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send-now", () => ({ scheduleOutboxFlush: flush }));
const processSpy = vi.hoisted(() => ({ calls: [] as Array<{ id: number; appUrl: string }> }));
vi.mock("@/lib/sales/process-sale", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/sales/process-sale")>();
  return {
    ...mod,
    processSale: async (db: Database, id: number, opts: { appUrl: string }) => {
      processSpy.calls.push({ id, appUrl: opts.appUrl });
      return mod.processSale(db, id, opts);
    },
  };
});

import * as a from "@/app/dashboard/sales/actions";

const PAID_PRODUCT = "00000000-0000-4000-8000-000000000003";

let db: Database;
let admin: User;
let student: User;
let productId: number;

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  [admin] = await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t-ad" }).returning();
  [student] = await db.insert(users).values({ email: "al@x.com", name: "Al", role: "student", passwordHash: "x", loginToken: "t-al" }).returning();
  const [s] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  [{ id: productId }] = await db.insert(products).values({ showcaseId: s.id, name: "Manual", status: "published" }).returning();
  session.user = admin;
  revalidatePath.mockClear();
  flush.mockClear();
  processSpy.calls = [];
});
afterEach(() => setDbForTests(null));

function fd(fields: Record<string, string | number | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) for (const x of v) f.append(k, x);
    else f.set(k, String(v));
  }
  return f;
}
const paid = () => recordSale(db, "kiwify", kiwifyPayload("paid"), kiwifyRaw("paid"));
const processing = async (id: number) => (await db.select().from(sales).where(eq(sales.id, id)))[0];

test("todas as actions exigem admin pela sessão", async () => {
  const { id } = await paid();
  for (const u of [null, student]) {
    session.user = u;
    const denied = { ok: false, error: "Acesso restrito a administradores." };
    expect(await a.reprocessSaleAction(fd({ id }))).toEqual(denied);
    expect(await a.reprocessQueueAction(fd({}))).toEqual(denied);
    expect(await a.reprocessErrorsAction(fd({}))).toEqual(denied);
    expect(await a.ignoreSaleAction(fd({ id }))).toEqual(denied);
    expect(await a.deleteSaleAction(fd({ id }))).toEqual(denied);
    expect(await a.saveIgnoredProductsAction(fd({ ids: ["1"] }))).toEqual(denied);
    expect(await a.listSalesAction(fd({ view: "latest" }))).toEqual(denied);
    expect(await a.getSaleAction(fd({ id }))).toEqual(denied);
  }
  expect(processSpy.calls).toEqual([]);
  expect((await processing(id)).processing).toBe("queued");
});

test("ids inválidos: requisição inválida, sem tocar no banco", async () => {
  const bad = { ok: false, error: "Requisição inválida." };
  for (const id of ["", "abc", "-1", "1.5", "99999999999999999999"]) {
    expect(await a.reprocessSaleAction(fd({ id }))).toEqual(bad);
    expect(await a.ignoreSaleAction(fd({ id }))).toEqual(bad);
    expect(await a.deleteSaleAction(fd({ id }))).toEqual(bad);
    expect(await a.getSaleAction(fd({ id }))).toEqual(bad);
  }
  expect(processSpy.calls).toEqual([]);
});

test("reprocessar chama processSale com o endereço do site e dispara o envio de e-mails", async () => {
  const { id } = await paid();
  // sem entrega: erro com o texto explicativo
  expect(await a.reprocessSaleAction(fd({ id }))).toEqual({ ok: true });
  expect(processSpy.calls).toEqual([{ id, appUrl: "https://alunos.exemplo.com" }]);
  const failed = await processing(id);
  expect(failed.processing).toBe("error");
  expect(failed.error).toMatch(/^Erro ao construir carga: Não existe nenhuma entrega configurada para o ID: /);

  await createDelivery(db, admin, {
    name: "Manual",
    type: "single",
    codes: [PAID_PRODUCT],
    items: [{ targetType: "product", targetId: productId, durationType: "lifetime", duration: null, scheduleId: null }],
    tagIds: [],
  });
  expect(await a.reprocessErrorsAction(fd({}))).toEqual({ ok: true });
  expect((await processing(id)).processing).toBe("processed");
  expect(flush).toHaveBeenCalled();
  // Oferta = Product.product_offer_name ?? Product.product_name
  expect(await a.getSaleAction(fd({ id }))).toMatchObject({ ok: true, sale: { offer: "Acesso Vitalicio Curso de Exemplo", processing: "processed", amount: "11.14", paymentMethod: "Cartão de crédito" } });
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/sales");

  // venda inexistente / na lixeira
  expect(await a.reprocessSaleAction(fd({ id: id + 999 }))).toEqual({ ok: false, error: "Venda não encontrada." });
});

test("reprocessar a fila só pega as vendas na fila; os erros ficam para o outro botão", async () => {
  const q = await paid();
  const refunded = await recordSale(db, "kiwify", kiwifyPayload("refunded"), kiwifyRaw("refunded"));
  await db.update(sales).set({ processing: "error", error: "x" }).where(eq(sales.id, refunded.id));
  expect(await a.reprocessQueueAction(fd({}))).toEqual({ ok: true });
  expect(processSpy.calls.map((c) => c.id)).toEqual([q.id]);
});

test("ignorar marca a venda como Ignorado; excluir manda para a lixeira", async () => {
  const { id } = await paid();
  expect(await a.ignoreSaleAction(fd({ id }))).toEqual({ ok: true });
  expect((await processing(id)).processing).toBe("ignored");

  expect(await a.deleteSaleAction(fd({ id }))).toEqual({ ok: true });
  expect((await processing(id)).deletedAt).toBeInstanceOf(Date);
  const list = await a.listSalesAction(fd({ view: "latest" }));
  expect(list).toMatchObject({ ok: true, rows: [] });
  expect(await a.getSaleAction(fd({ id }))).toEqual({ ok: false, error: "Venda não encontrada." });
  expect(await a.ignoreSaleAction(fd({ id }))).toEqual({ ok: false, error: "Venda não encontrada." });
});

test("lista de produtos ignorados: grava em settings.kiwify, apara, sem repetir; valida limites", async () => {
  expect(await a.saveIgnoredProductsAction(fd({ ids: [" 10288 ", "abc", "10288", ""] }))).toEqual({ ok: true });
  expect((await getPlatformSettings(db)).kiwify.ignoredProductIds).toEqual(["10288", "abc"]);
  expect(await a.saveIgnoredProductsAction(fd({}))).toEqual({ ok: true });
  expect((await getPlatformSettings(db)).kiwify.ignoredProductIds).toEqual([]);

  const bad = { ok: false, error: "Requisição inválida." };
  expect(await a.saveIgnoredProductsAction(fd({ ids: ["x".repeat(101)] }))).toEqual(bad);
  expect(await a.saveIgnoredProductsAction(fd({ ids: Array.from({ length: 201 }, (_, i) => String(i)) }))).toEqual(bad);
  // não mexe no segredo da URL nem no token
  expect(await a.saveIgnoredProductsAction(fd({ ids: ["1"] }))).toEqual({ ok: true });
  const k = (await getPlatformSettings(db)).kiwify;
  expect(k).toEqual({ webhookSecret: null, signatureToken: null, ignoredProductIds: ["1"] });
});

test("lista: linhas formatadas, filtros, busca, contador de erros e detalhe com o payload", async () => {
  const { id } = await paid();
  const refunded = await recordSale(db, "kiwify", kiwifyPayload("refunded"), kiwifyRaw("refunded"));
  await db.update(sales).set({ processing: "error", error: "Falhou" }).where(eq(sales.id, refunded.id));

  const all = await a.listSalesAction(fd({ view: "latest" }));
  if (!all.ok) throw new Error(all.error);
  expect(all.rows.map((r) => r.id)).toEqual([refunded.id, id]);
  expect(all.errorCount).toBe(1);
  expect(all.rows[1]).toMatchObject({ id, gateway: "kiwify", gatewayLabel: "Kiwify", status: "approved", processing: "queued" });
  expect(all.rows[1].receivedAt).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}\/\d{2}$/);

  const errors = await a.listSalesAction(fd({ view: "error" }));
  expect(errors).toMatchObject({ ok: true, rows: [{ id: refunded.id }] });
  const none = await a.listSalesAction(fd({ view: "latest", field: "email", q: "ninguem@" }));
  expect(none).toMatchObject({ ok: true, rows: [] });
  // filtros fora da lista viram o padrão
  const odd = await a.listSalesAction(fd({ view: "xxx", field: "yyy", q: "x", gateways: ["payt"] }));
  expect(odd).toMatchObject({ ok: true, rows: [{ id: refunded.id }, { id }] });

  const detail = await a.getSaleAction(fd({ id: refunded.id }));
  if (!detail.ok) throw new Error(detail.error);
  expect(detail.sale).toMatchObject({ id: refunded.id, processing: "error", error: "Falhou", gatewayLabel: "Kiwify" });
  expect(JSON.parse(detail.sale.payloadJson)).toEqual(kiwifyPayload("refunded"));
  const offerPayload = kiwifyPayload("paid");
  offerPayload.order_id = "outro-pedido";
  offerPayload.Product.product_offer_name = "Oficial 27,90";
  const withOffer = await recordSale(db, "kiwify", offerPayload, JSON.stringify(offerPayload));
  expect(await a.getSaleAction(fd({ id: withOffer.id }))).toMatchObject({ ok: true, sale: { offer: "Oficial 27,90" } });
});
