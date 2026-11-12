import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { deliveries, fullAccess, productAccess, products, schedules, showcases, users, userTags } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import {
  archiveDelivery,
  createDelivery,
  duplicateDelivery,
  findDeliveryForSale,
  getDelivery,
  listDeliveries,
  restoreDelivery,
  updateDelivery,
  type DeliveryInput,
} from "@/lib/sales/deliveries";
import { applyTags, createTag, listTags } from "@/lib/sales/tags";

let db: Database;
let admin: User;
let student: User;
let showcaseId: number;
let p1: number;
let p2: number;

beforeEach(async () => {
  db = await createTestDb();
  [admin] = await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t1" }).returning();
  [student] = await db.insert(users).values({ email: "al@x.com", name: "Al", role: "student", passwordHash: "x", loginToken: "t2" }).returning();
  [{ id: showcaseId }] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  [{ id: p1 }, { id: p2 }] = await db
    .insert(products)
    .values([
      { showcaseId, name: "Manual", status: "published" },
      { showcaseId, name: "Produto Exemplo B", status: "published" },
    ])
    .returning();
});

const input = (over: Partial<DeliveryInput> = {}): DeliveryInput => ({
  name: "Curso de Exemplo",
  type: "single",
  codes: ["00000000-0000-4000-8000-000000000019"],
  items: [
    { targetType: "product", targetId: p1, durationType: "years", duration: 1, scheduleId: null },
    { targetType: "product", targetId: p2, durationType: "lifetime", duration: null, scheduleId: null },
  ],
  tagIds: [],
  ...over,
});

test("cria, lê e atualiza uma entrega (itens e tags substituídos)", async () => {
  const tag = await createTag(db, admin, "GARANTIA");
  const { id } = await createDelivery(db, admin, input({ codes: [" abc ", "abc", "chk0001"], tagIds: [tag.id] }));
  expect(id).toBeGreaterThanOrEqual(900000000);
  const d = await getDelivery(db, admin, id);
  expect(d).toMatchObject({ name: "Curso de Exemplo", gateway: "kiwify", type: "single", codes: ["abc", "chk0001"], tagIds: [tag.id] });
  expect(d!.items.map((i) => [i.targetType, i.targetId, i.durationType, i.duration])).toEqual([
    ["product", p1, "years", 1],
    ["product", p2, "lifetime", null],
  ]);

  await updateDelivery(db, admin, id, {
    name: "Novo nome",
    type: "subscription",
    items: [{ targetType: "all", targetId: null, durationType: "lifetime", duration: null, scheduleId: null }],
    tagIds: [],
  });
  const u = await getDelivery(db, admin, id);
  expect(u).toMatchObject({ name: "Novo nome", type: "subscription", codes: ["abc", "chk0001"], tagIds: [] });
  expect(u!.items).toHaveLength(1);
  expect(u!.items[0]).toMatchObject({ targetType: "all", targetId: null });
  // atualização parcial: só o nome
  await updateDelivery(db, admin, id, { name: "Só o nome" });
  expect((await getDelivery(db, admin, id))!.items).toHaveLength(1);
});

test("validação da entrega", async () => {
  const bad = async (over: Partial<DeliveryInput>, msg: RegExp) => expect(createDelivery(db, admin, input(over))).rejects.toThrow(msg);
  await bad({ name: "  " }, /nome/i);
  await bad({ name: "x".repeat(121) }, /nome/i);
  await bad({ codes: [] }, /código/i);
  await bad({ codes: ["x".repeat(101)] }, /código/i);
  await bad({ items: [] }, /conteúdo/i);
  await bad({ items: [{ targetType: "product", targetId: p1, durationType: "days", duration: 0, scheduleId: null }] }, /tempo/i);
  await bad({ items: [{ targetType: "product", targetId: p1, durationType: "days", duration: 1001, scheduleId: null }] }, /tempo/i);
  await bad({ items: [{ targetType: "product", targetId: 123, durationType: "lifetime", duration: null, scheduleId: null }] }, /produto/i);
  await bad({ items: [{ targetType: "showcase", targetId: 123, durationType: "lifetime", duration: null, scheduleId: null }] }, /vitrine/i);
  await bad({ items: [{ targetType: "product", targetId: p1, durationType: "lifetime", duration: null, scheduleId: 999 }] }, /programação/i);
  await bad({ tagIds: [999] }, /tag/i);
  await bad({ type: "outro" as never }, /modalidade/i);
  await expect(createDelivery(db, student, input())).rejects.toThrow("administradores");
  const [s] = await db.insert(schedules).values({ name: "Turma" }).returning();
  await expect(
    createDelivery(db, admin, input({ items: [{ targetType: "product", targetId: p1, durationType: "days", duration: 30, scheduleId: s.id }] })),
  ).resolves.toBeTruthy();
});

test("findDeliveryForSale casa por product_id, checkout_link ou plano; ignora arquivada", async () => {
  const a = await createDelivery(db, admin, input({ codes: ["prod-A"] }));
  const b = await createDelivery(db, admin, input({ codes: ["chk0001"] }));
  const c = await createDelivery(db, admin, input({ codes: ["plano-1"] }));
  expect((await findDeliveryForSale(db, { productIds: ["prod-A"], checkoutLink: "zzz", planId: null }))?.id).toBe(a.id);
  expect((await findDeliveryForSale(db, { productIds: ["nada"], checkoutLink: "chk0001", planId: null }))?.id).toBe(b.id);
  expect((await findDeliveryForSale(db, { productIds: ["nada"], checkoutLink: null, planId: "plano-1" }))?.id).toBe(c.id);
  expect(await findDeliveryForSale(db, { productIds: ["nada"], checkoutLink: null, planId: null })).toBeNull();
  expect(await findDeliveryForSale(db, { productIds: [], checkoutLink: null, planId: null })).toBeNull();
  await archiveDelivery(db, admin, a.id);
  expect(await findDeliveryForSale(db, { productIds: ["prod-A"], checkoutLink: null, planId: null })).toBeNull();
  await restoreDelivery(db, admin, a.id);
  expect((await findDeliveryForSale(db, { productIds: ["prod-A"], checkoutLink: null, planId: null }))?.id).toBe(a.id);
});

test("listDeliveries: filtros, busca e contagem de alunos ativos e inativos", async () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const a = await createDelivery(db, admin, input({ name: "Formação Renda com IA", codes: ["k-1"] }));
  const b = await createDelivery(db, admin, input({ name: "Clube Elite", type: "subscription", codes: ["k-2"] }));
  const arch = await createDelivery(db, admin, input({ name: "Velha", codes: ["k-3"] }));
  await archiveDelivery(db, admin, arch.id);

  const mk = async (email: string) =>
    (await db.insert(users).values({ email, name: email, role: "student", passwordHash: "x", loginToken: email }).returning())[0].id;
  const [u1, u2, u3] = [await mk("1@x.com"), await mk("2@x.com"), await mk("3@x.com")];
  const s = { source: "sale" as const, deliveryId: a.id, startsAt: new Date("2026-01-01Z") };
  await db.insert(productAccess).values([
    { ...s, userId: u1, productId: p1, saleRef: "o1" }, // ativo
    { ...s, userId: u1, productId: p2, saleRef: "o1", revokedAt: new Date("2026-10-01Z") }, // u1 segue ativo pelo p1
    { ...s, userId: u2, productId: p1, saleRef: "o2", expiresAt: new Date("2026-10-01Z") }, // inativo
    { ...s, userId: u3, productId: p1, saleRef: "o3", revokedAt: new Date("2026-10-01Z") }, // inativo
  ]);
  await db.insert(fullAccess).values({ userId: u1, source: "sale", saleRef: "o9", deliveryId: b.id, startsAt: new Date("2026-01-01Z") });

  const list = await listDeliveries(db, admin, { archived: false }, now);
  expect(list.map((d) => d.name)).toEqual(["Clube Elite", "Formação Renda com IA"]);
  const ra = list.find((d) => d.id === a.id)!;
  expect(ra.access).toEqual({ total: 3, active: 1, inactive: 2 });
  expect(ra.codes).toEqual(["k-1"]);
  expect(list.find((d) => d.id === b.id)!.access).toEqual({ total: 1, active: 1, inactive: 0 });

  expect((await listDeliveries(db, admin, { archived: true }, now)).map((d) => d.id)).toEqual([arch.id]);
  expect((await listDeliveries(db, admin, { archived: false, type: "subscription" }, now)).map((d) => d.id)).toEqual([b.id]);
  expect((await listDeliveries(db, admin, { archived: false, search: "renda" }, now)).map((d) => d.id)).toEqual([a.id]);
  expect((await listDeliveries(db, admin, { archived: false, search: "k-2" }, now)).map((d) => d.id)).toEqual([b.id]);
  expect(await listDeliveries(db, admin, { archived: false, gateway: "kiwify" }, now)).toHaveLength(2);
  await expect(listDeliveries(db, student, { archived: false })).rejects.toThrow("administradores");
});

test("duplicar copia itens e tags, sem os códigos", async () => {
  const tag = await createTag(db, admin, "Turma A");
  const { id } = await createDelivery(db, admin, input({ tagIds: [tag.id] }));
  const copy = await duplicateDelivery(db, admin, id);
  const d = await getDelivery(db, admin, copy.id);
  expect(d).toMatchObject({ name: "Curso de Exemplo (cópia)", codes: [], tagIds: [tag.id] });
  expect(d!.items).toHaveLength(2);
  expect(await db.select().from(deliveries).where(eq(deliveries.id, copy.id))).toHaveLength(1);
});

test("tags: criar (sem duplicar), listar e aplicar", async () => {
  const t1 = await createTag(db, admin, " GARANTIA ");
  const again = await createTag(db, admin, "garantia");
  expect(again.id).toBe(t1.id);
  const t2 = await createTag(db, admin, "Turma A");
  expect((await listTags(db, admin)).map((t) => t.name)).toEqual(["GARANTIA", "Turma A"]);
  await expect(createTag(db, admin, "")).rejects.toThrow(/nome/i);
  await expect(createTag(db, student, "x")).rejects.toThrow("administradores");
  await applyTags(db, student.id, [t1.id, t2.id]);
  await applyTags(db, student.id, [t1.id]);
  expect(await db.select().from(userTags).where(eq(userTags.userId, student.id))).toHaveLength(2);
});
