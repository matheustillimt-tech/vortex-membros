import { and, eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import {
  deliveries, deliveryItems, deliveryTags, emailOutbox, fullAccess, lessonProgress, lessons, modules, productAccess,
  productFirstVisits, products, sales, scheduleProducts, scheduleRules, schedules, showcases, tags, userReleaseOverrides, userTags, users,
} from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { getActiveAccessProductIds } from "@/lib/catalog/access";
import { releaseDateFor } from "@/lib/catalog/release";
import * as pur from "@/lib/students/purchases";

let db: Database;
let root: User;
let aluno: User;
let S: number;
let P1: number, P2: number, P3: number;
let D1: number, D2: number, DFull: number;
const now = new Date("2026-10-16T15:00:00Z");
const DAY = 86_400_000;
const past = new Date("2026-01-01T00:00:00Z");

beforeEach(async () => {
  db = await createTestDb();
  [root] = await db.insert(users).values({ email: "root@x.com", name: "Root", role: "admin", adminRole: "root", passwordHash: "x", loginToken: "tr" }).returning();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "Aluno", role: "student", passwordHash: "x", loginToken: "ta" }).returning();
  [{ id: S }] = await db.insert(showcases).values({ name: "Vitrine", status: "published" }).returning();
  [{ id: P1 }] = await db.insert(products).values({ showcaseId: S, name: "Produto 1", status: "published", position: 1 }).returning();
  [{ id: P2 }] = await db.insert(products).values({ showcaseId: S, name: "Produto 2", status: "published", position: 2 }).returning();
  [{ id: P3 }] = await db.insert(products).values({ showcaseId: S, name: "Produto 3", status: "published", position: 3 }).returning();
  [{ id: D1 }] = await db.insert(deliveries).values({ name: "Entrega Um" }).returning();
  [{ id: D2 }] = await db.insert(deliveries).values({ name: "Entrega Dois" }).returning();
  [{ id: DFull }] = await db.insert(deliveries).values({ name: "Tudo" }).returning();
  await db.insert(deliveryItems).values([
    { deliveryId: D1, targetType: "product", targetId: P1, durationType: "lifetime" },
    { deliveryId: D2, targetType: "product", targetId: P2, durationType: "days", duration: 30 },
    { deliveryId: D2, targetType: "product", targetId: P3, durationType: "lifetime" },
    { deliveryId: DFull, targetType: "all", durationType: "lifetime" },
  ]);
});

const sale = (ref: string, amountCents: number) =>
  db.insert(sales).values({ gateway: "kiwify", orderId: ref, status: "approved", processing: "processed", payload: {}, dedupeKey: ref, amountCents, userId: aluno.id });

test("só admin", async () => {
  await expect(pur.listPurchases(db, aluno, aluno.id, now)).rejects.toThrow(/administradores/);
  await expect(pur.addDeliveryToStudent(db, null, aluno.id, D1, { now })).rejects.toThrow(/administradores/);
  await expect(pur.listStudentProducts(db, aluno, aluno.id, now)).rejects.toThrow(/administradores/);
});

test("compras = grupos (entrega, venda) com data, valor da venda e status", async () => {
  const start = new Date(now.getTime() - 2 * DAY);
  await db.insert(productAccess).values([
    { userId: aluno.id, productId: P2, deliveryId: D2, saleRef: "o2", source: "sale", startsAt: start, expiresAt: new Date(now.getTime() + DAY) },
    { userId: aluno.id, productId: P3, deliveryId: D2, saleRef: "o2", source: "sale", startsAt: start },
    { userId: aluno.id, productId: P1, deliveryId: D1, saleRef: "o1", source: "sale", startsAt: new Date(now.getTime() - DAY), revokedAt: now },
  ]);
  await sale("o2", 1114);
  const list = await pur.listPurchases(db, root, aluno.id, now);
  expect(list).toHaveLength(2);
  expect(list[0]).toMatchObject({ deliveryId: D1, deliveryName: "Entrega Um", saleRef: "o1", source: "sale", active: false, amountCents: null });
  expect(list[1]).toMatchObject({ deliveryId: D2, deliveryName: "Entrega Dois", saleRef: "o2", source: "sale", active: true, amountCents: 1114, gateway: "kiwify" });
  expect(list[1].startedAt).toEqual(start);
});

test("inativar e reativar a compra revoga/restaura só o grupo", async () => {
  await db.insert(productAccess).values([
    { userId: aluno.id, productId: P1, deliveryId: D1, saleRef: "o1", source: "sale", startsAt: past },
    { userId: aluno.id, productId: P2, deliveryId: D2, saleRef: "o2", source: "sale", startsAt: past },
  ]);
  const key = { deliveryId: D1, saleRef: "o1" };
  await pur.setPurchaseActive(db, root, aluno.id, key, false, now);
  expect([...(await getActiveAccessProductIds(db, aluno.id, now))]).toEqual([P2]);
  await pur.setPurchaseActive(db, root, aluno.id, key, true, now);
  expect([...(await getActiveAccessProductIds(db, aluno.id, now))].sort()).toEqual([P1, P2].sort());
  await expect(pur.setPurchaseActive(db, root, aluno.id, { deliveryId: D1, saleRef: "nada" }, false, now)).rejects.toThrow("Compra não encontrada.");
});

test("programar encerramento define o fim do grupo (vazio = sem data)", async () => {
  await db.insert(productAccess).values({ userId: aluno.id, productId: P1, deliveryId: D1, saleRef: "o1", source: "sale" });
  await db.insert(fullAccess).values({ userId: aluno.id, deliveryId: D1, saleRef: "o1", source: "sale" });
  const end = new Date(now.getTime() + 5 * DAY);
  await pur.schedulePurchaseEnd(db, root, aluno.id, { deliveryId: D1, saleRef: "o1" }, end);
  expect((await db.select().from(productAccess))[0].expiresAt).toEqual(end);
  expect((await db.select().from(fullAccess))[0].expiresAt).toEqual(end);
  await pur.schedulePurchaseEnd(db, root, aluno.id, { deliveryId: D1, saleRef: "o1" }, null);
  expect((await db.select().from(productAccess))[0].expiresAt).toBeNull();
});

test("excluir só compra avulsa: revoga e some da lista", async () => {
  await db.insert(productAccess).values([
    { userId: aluno.id, productId: P1, deliveryId: D1, saleRef: "manual:x", source: "manual", startsAt: past },
    { userId: aluno.id, productId: P2, deliveryId: D2, saleRef: "o2", source: "sale", startsAt: past },
  ]);
  await expect(pur.deletePurchase(db, root, aluno.id, { deliveryId: D2, saleRef: "o2" }, now)).rejects.toThrow("Só compras avulsas podem ser excluídas.");
  await pur.deletePurchase(db, root, aluno.id, { deliveryId: D1, saleRef: "manual:x" }, now);
  expect((await pur.listPurchases(db, root, aluno.id, now)).map((p) => p.saleRef)).toEqual(["o2"]);
  expect([...(await getActiveAccessProductIds(db, aluno.id, now))]).toEqual([P2]);
});

test("adicionar entrega: concede com prazo como acesso manual, aplica as tags e manda 'novoacesso'; some das opções", async () => {
  const [tag] = await db.insert(tags).values({ name: "VIP" }).returning();
  await db.insert(deliveryTags).values({ deliveryId: D2, tagId: tag.id });
  await db.update(deliveries).set({ archivedAt: now }).where(eq(deliveries.id, DFull));
  expect((await pur.listAvailableDeliveries(db, root, aluno.id)).map((d) => d.label)).toEqual(["Kiwify | Entrega Dois", "Kiwify | Entrega Um"]);

  await pur.addDeliveryToStudent(db, root, aluno.id, D2, { now });
  const rows = await db.select().from(productAccess).where(eq(productAccess.userId, aluno.id));
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.source === "manual" && r.deliveryId === D2 && /^manual:[0-9a-f-]{36}$/.test(r.saleRef!))).toBe(true);
  expect(new Set(rows.map((r) => r.saleRef)).size).toBe(1);
  expect(rows.find((r) => r.productId === P2)!.expiresAt).toEqual(new Date(now.getTime() + 30 * DAY));
  expect(rows.find((r) => r.productId === P3)!.expiresAt).toBeNull();
  expect(await db.select().from(userTags)).toEqual([{ userId: aluno.id, tagId: tag.id }]);
  const [mail] = await db.select().from(emailOutbox);
  expect(mail).toMatchObject({ toEmail: "a@x.com", template: "novoacesso" });
  expect(mail.html).toContain("Produto 2, Produto 3");

  expect((await pur.listAvailableDeliveries(db, root, aluno.id)).map((d) => d.label)).toEqual(["Kiwify | Entrega Um"]);
  await expect(pur.addDeliveryToStudent(db, root, aluno.id, D2, { now })).rejects.toThrow("O aluno já tem esta entrega.");
  await expect(pur.addDeliveryToStudent(db, root, aluno.id, DFull, { now })).rejects.toThrow("Entrega não encontrada.");
  const list = await pur.listPurchases(db, root, aluno.id, now);
  expect(list[0]).toMatchObject({ source: "manual", deliveryName: "Entrega Dois", active: true });
});

test("adicionar entrega com 'todos os produtos' dá acesso completo manual", async () => {
  await pur.addDeliveryToStudent(db, root, aluno.id, DFull, { now });
  const [fa] = await db.select().from(fullAccess);
  expect(fa).toMatchObject({ userId: aluno.id, source: "manual", deliveryId: DFull, expiresAt: null });
  const [mail] = await db.select().from(emailOutbox);
  expect(mail.html).toContain("todos os produtos");
});

test("produtos do aluno: vitrine, liberado até, progresso e liberação; acesso completo lista todos", async () => {
  const [m] = await db.insert(modules).values({ productId: P1, title: "M", status: "published" }).returning();
  const ls = await db.insert(lessons).values([1, 2, 3, 4].map((i) => ({ moduleId: m.id, title: `A${i}`, status: "published" as const, position: i }))).returning();
  await db.insert(lessonProgress).values({ userId: aluno.id, lessonId: ls[0].id });
  const until = new Date(now.getTime() + 10 * DAY);
  await db.insert(productAccess).values([
    { userId: aluno.id, productId: P1, deliveryId: D1, saleRef: "o1", source: "sale", expiresAt: until },
    { userId: aluno.id, productId: P1, deliveryId: D1, saleRef: "o9", source: "sale", revokedAt: now },
  ]);
  let rows = await pur.listStudentProducts(db, root, aluno.id, now);
  expect(rows).toEqual([
    { productId: P1, name: "Produto 1", showcase: "Vitrine", until, fromFullAccess: false, completed: 1, total: 4, percent: 25, immediate: false, scheduleName: null },
  ]);
  await db.insert(fullAccess).values({ userId: aluno.id, source: "manual", saleRef: "manual:f" });
  rows = await pur.listStudentProducts(db, root, aluno.id, now);
  expect(rows.map((r) => [r.name, r.until, r.fromFullAccess])).toEqual([
    ["Produto 1", null, false], // vitalício do acesso completo ganha
    ["Produto 2", null, true],
    ["Produto 3", null, true],
  ]);
});

test("alterar tempo de acesso: data, vitalício, somar (a partir do início) e para todos", async () => {
  const start = new Date("2026-10-01T12:00:00Z");
  await db.insert(productAccess).values([
    { userId: aluno.id, productId: P1, saleRef: "o1", source: "sale", startsAt: start },
    { userId: aluno.id, productId: P2, saleRef: "o2", source: "sale", startsAt: start },
  ]);
  await db.insert(fullAccess).values({ userId: aluno.id, source: "manual", saleRef: "manual:f", startsAt: start, expiresAt: now });
  const date = new Date("2026-12-31T03:00:00Z");
  await pur.setAccessUntil(db, root, aluno.id, P1, { type: "date", date }, now);
  const get = async () => db.select().from(productAccess).orderBy(productAccess.productId);
  expect((await get()).map((r) => r.expiresAt)).toEqual([date, null]);
  await pur.setAccessUntil(db, root, aluno.id, P1, { type: "lifetime" }, now);
  expect((await get())[0].expiresAt).toBeNull();
  await pur.setAccessUntil(db, root, aluno.id, "all", { type: "add", days: 1, weeks: 1, months: 1, years: 0 }, now);
  const expected = new Date("2026-11-09T12:00:00Z"); // 1 mês (1/11) + 1 semana + 1 dia
  expect((await get()).map((r) => r.expiresAt)).toEqual([expected, expected]);
  expect((await db.select().from(fullAccess))[0].expiresAt).toEqual(expected);
  await expect(pur.setAccessUntil(db, root, aluno.id, P1, { type: "add", days: 0, weeks: 0, months: 0, years: 0 }, now)).rejects.toThrow("Escolha uma data, Vitalício ou um tempo a adicionar.");
  await expect(pur.setAccessUntil(db, root, aluno.id, P3, { type: "lifetime" }, now)).rejects.toThrow(/acesso completo/);
});

test("liberação imediata: override libera as aulas programadas só para este aluno", async () => {
  const [m] = await db.insert(modules).values({ productId: P1, title: "M", status: "published" }).returning();
  const [l] = await db.insert(lessons).values({ moduleId: m.id, title: "A", status: "published" }).returning();
  const [sch] = await db.insert(schedules).values({ name: "Turma 1" }).returning();
  await db.insert(scheduleProducts).values({ scheduleId: sch.id, productId: P1 });
  await db.insert(scheduleRules).values({ scheduleId: sch.id, targetType: "lesson", targetId: l.id, mode: "days_after_access", days: 10 });
  await db.insert(productAccess).values({ userId: aluno.id, productId: P1, saleRef: "o1", source: "sale", startsAt: now });
  expect(await releaseDateFor(db, aluno, l.id, now)).not.toBeNull();
  expect((await pur.listStudentProducts(db, root, aluno.id, now))[0]).toMatchObject({ immediate: false, scheduleName: "Turma 1" });

  await pur.toggleReleaseOverride(db, root, aluno.id, P1, true);
  expect(await releaseDateFor(db, aluno, l.id, now)).toBeNull();
  expect((await pur.listStudentProducts(db, root, aluno.id, now))[0].immediate).toBe(true);
  await pur.toggleReleaseOverride(db, root, aluno.id, P1, true); // idempotente
  expect(await db.select().from(userReleaseOverrides)).toHaveLength(1);
  await pur.toggleReleaseOverride(db, root, aluno.id, P1, false);
  expect(await releaseDateFor(db, aluno, l.id, now)).not.toBeNull();
});

test("excluir progresso só do produto; iniciar todos os acessos cria as primeiras visitas que faltam", async () => {
  const [m1] = await db.insert(modules).values({ productId: P1, title: "M", status: "published" }).returning();
  const [m2] = await db.insert(modules).values({ productId: P2, title: "M", status: "published" }).returning();
  const [l1] = await db.insert(lessons).values({ moduleId: m1.id, title: "A", status: "published" }).returning();
  const [l2] = await db.insert(lessons).values({ moduleId: m2.id, title: "B", status: "published" }).returning();
  await db.insert(lessonProgress).values([{ userId: aluno.id, lessonId: l1.id }, { userId: aluno.id, lessonId: l2.id }]);
  await pur.deleteProgress(db, root, aluno.id, P1);
  expect((await db.select().from(lessonProgress)).map((r) => r.lessonId)).toEqual([l2.id]);

  await db.insert(productAccess).values([
    { userId: aluno.id, productId: P1, saleRef: "o1", source: "sale" },
    { userId: aluno.id, productId: P2, saleRef: "o2", source: "sale" },
  ]);
  await db.insert(productFirstVisits).values({ userId: aluno.id, productId: P1, firstAt: new Date("2026-01-01Z") });
  expect(await pur.startAllAccesses(db, root, aluno.id, now)).toBe(1);
  const visits = await db.select().from(productFirstVisits).where(and(eq(productFirstVisits.userId, aluno.id)));
  expect(visits.map((v) => [v.productId, v.firstAt])).toEqual(
    expect.arrayContaining([[P1, new Date("2026-01-01Z")], [P2, now]]),
  );
});

test("entrega vencida volta a aparecer e pode ser adicionada de novo; override exige produto existente", async () => {
  await db.insert(productAccess).values({ userId: aluno.id, productId: P1, deliveryId: D1, saleRef: "o1", source: "sale", startsAt: past, expiresAt: new Date(now.getTime() - DAY) });
  expect((await pur.listAvailableDeliveries(db, root, aluno.id, now)).map((d) => d.label)).toContain("Kiwify | Entrega Um");
  await pur.addDeliveryToStudent(db, root, aluno.id, D1, { now });
  expect((await pur.listAvailableDeliveries(db, root, aluno.id, now)).map((d) => d.label)).not.toContain("Kiwify | Entrega Um");
  await expect(pur.toggleReleaseOverride(db, root, aluno.id, 999, true)).rejects.toThrow("Produto não encontrado.");
});

test("compras de aluno excluído não são alteradas", async () => {
  await db.insert(productAccess).values({ userId: aluno.id, productId: P1, deliveryId: D1, saleRef: "o1", source: "sale", startsAt: past });
  await db.update(users).set({ deletedAt: now }).where(eq(users.id, aluno.id));
  await expect(pur.setPurchaseActive(db, root, aluno.id, { deliveryId: D1, saleRef: "o1" }, false, now)).rejects.toThrow("Aluno não encontrado.");
});
