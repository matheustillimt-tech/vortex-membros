import { asc } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { deliveries, deliveryItems, scheduleProducts, scheduleRules, schedules } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as c from "@/lib/admin/content";
import * as sch from "@/lib/admin/schedules";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import * as a from "@/app/dashboard/content/schedules/actions";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  session.user = admin;
  revalidatePath.mockClear();
});
afterEach(() => setDbForTests(null));

function fd(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}
async function setup() {
  const s = await c.createShowcase(db, admin, { name: "V" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  const other = await c.createProduct(db, admin, { showcaseId: s.id, name: "Outro" });
  const m = await c.createModule(db, admin, { productId: p.id, title: "M" });
  const l = await c.createLesson(db, admin, { moduleId: m.id, title: "L" });
  const om = await c.createModule(db, admin, { productId: other.id, title: "OM" });
  const ol = await c.createLesson(db, admin, { moduleId: om.id, title: "OL" });
  return { p: p.id, other: other.id, m: m.id, l: l.id, om: om.id, ol: ol.id };
}
const rule = (scheduleId: number, targetType: string, targetId: number, extra: Record<string, string | number>) =>
  fd({ scheduleId, targetType, targetId, ...extra });

test("CRUD: criar (com produto), renomear, adicionar/remover produto, lixeira e restaurar", async () => {
  const t = await setup();
  const res = (await a.createScheduleAction(fd({ name: " Turma 1 ", productId: t.p }))) as { ok: true; id: number };
  expect(res.ok).toBe(true);
  expect(await a.renameScheduleAction(fd({ id: res.id, name: "Turma A" }))).toEqual({ ok: true });
  expect(await a.addScheduleProductAction(fd({ scheduleId: res.id, productId: t.other }))).toEqual({ ok: true });
  let list = await sch.listSchedules(db, admin);
  expect(list).toMatchObject([{ id: res.id, name: "Turma A", products: [{ id: t.other }, { id: t.p }], ruleCount: 0 }]);

  // produto já em outra programação ativa
  const second = (await a.createScheduleAction(fd({ name: "Turma B" }))) as { ok: true; id: number };
  expect(await a.addScheduleProductAction(fd({ scheduleId: second.id, productId: t.p }))).toEqual({ ok: false, error: "Este produto já está em outra programação." });
  expect(await a.createScheduleAction(fd({ name: "C", productId: t.p }))).toEqual({ ok: false, error: "Este produto já está em outra programação." });

  expect(await a.removeScheduleProductAction(fd({ scheduleId: res.id, productId: t.other }))).toEqual({ ok: true });
  expect(await a.trashScheduleAction(fd({ id: res.id }))).toEqual({ ok: true });
  expect((await sch.listSchedules(db, admin)).map((s) => s.id)).toEqual([second.id]);
  expect((await sch.listScheduleTrash(db, admin)).map((s) => s.id)).toEqual([res.id]);
  // excluída libera o produto para outra programação; restaurar então é recusado
  expect(await a.addScheduleProductAction(fd({ scheduleId: second.id, productId: t.p }))).toEqual({ ok: true });
  expect(await a.restoreScheduleAction(fd({ id: res.id }))).toEqual({ ok: false, error: "Um dos produtos já está em outra programação." });
  expect(await a.removeScheduleProductAction(fd({ scheduleId: second.id, productId: t.p }))).toEqual({ ok: true });
  expect(await a.restoreScheduleAction(fd({ id: res.id }))).toEqual({ ok: true });
  list = await sch.listSchedules(db, admin);
  expect(list.map((s) => s.id).sort()).toEqual([res.id, second.id].sort());
  expect(revalidatePath).toHaveBeenCalled();
});

test("regras: dias e data; 'none' limpa; validação dos alvos e valores", async () => {
  const t = await setup();
  const { id } = (await a.createScheduleAction(fd({ name: "T", productId: t.p }))) as { ok: true; id: number };
  expect(await a.setScheduleRuleAction(rule(id, "module", t.m, { mode: "days_after_access", days: 7 }))).toEqual({ ok: true });
  expect(await a.setScheduleRuleAction(rule(id, "lesson", t.l, { mode: "fixed_date", date: "2026-12-25" }))).toEqual({ ok: true });
  expect(await a.setScheduleRuleAction(rule(id, "module", t.m, { mode: "days_after_access", days: 0 }))).toEqual({ ok: true }); // atualiza
  const { rules } = await sch.getProductSchedule(db, admin, t.p);
  expect(rules[`module:${t.m}`]).toEqual({ mode: "days_after_access", days: 0, date: null });
  expect(rules[`lesson:${t.l}`]).toEqual({ mode: "fixed_date", days: null, date: new Date("2026-12-25T03:00:00Z") });
  expect(await a.setScheduleRuleAction(rule(id, "lesson", t.l, { mode: "none" }))).toEqual({ ok: true });
  expect((await sch.getProductSchedule(db, admin, t.p)).rules[`lesson:${t.l}`]).toBeUndefined();

  const before = await db.select().from(scheduleRules).orderBy(asc(scheduleRules.id));
  const bad: [FormData, string][] = [
    [rule(id, "lesson", t.ol, { mode: "fixed_date", date: "2026-12-25" }), "Este conteúdo não pertence aos produtos da programação."],
    [rule(id, "module", t.om, { mode: "days_after_access", days: 1 }), "Este conteúdo não pertence aos produtos da programação."],
    [rule(id, "module", t.m, { mode: "days_after_access", days: 3651 }), "Informe de 0 a 3650 dias."],
    [rule(id, "module", t.m, { mode: "days_after_access", days: -1 }), "Informe de 0 a 3650 dias."],
    [rule(id, "module", t.m, { mode: "days_after_access", days: "1.5" }), "Informe de 0 a 3650 dias."],
    [rule(id, "module", t.m, { mode: "fixed_date", date: "2026-02-30" }), "Data inválida."],
    [rule(id, "module", t.m, { mode: "fixed_date", date: "25/12/2026" }), "Data inválida."],
    [rule(id, "module", t.m, { mode: "forever" }), "Requisição inválida."],
    [rule(id, "product", t.p, { mode: "days_after_access", days: 1 }), "Requisição inválida."],
    [rule(id, "module", 999, { mode: "days_after_access", days: 1 }), "Não encontrado."],
    [rule(999, "module", t.m, { mode: "days_after_access", days: 1 }), "Não encontrado."],
  ];
  for (const [input, error] of bad) expect(await a.setScheduleRuleAction(input), error).toEqual({ ok: false, error });
  expect(await db.select().from(scheduleRules).orderBy(asc(scheduleRules.id))).toEqual(before);
  expect(await a.createScheduleAction(fd({ name: "  " }))).toEqual({ ok: false, error: "Informe um nome." });
  expect(await a.addScheduleProductAction(fd({ scheduleId: id, productId: 999 }))).toEqual({ ok: false, error: "Não encontrado." });
});

test("lista: Atualizado em muda com nome, produtos e regras; Uso conta entregas não arquivadas", async () => {
  const t = await setup();
  const { id } = (await a.createScheduleAction(fd({ name: "T", productId: t.p }))) as { ok: true; id: number };
  const old = new Date("2026-01-01T12:00:00Z");
  const stamp = async () => (await sch.listSchedules(db, admin))[0].updatedAt.getTime();
  const reset = () => db.update(schedules).set({ updatedAt: old });
  for (const change of [
    () => a.renameScheduleAction(fd({ id, name: "T2" })),
    () => a.addScheduleProductAction(fd({ scheduleId: id, productId: t.other })),
    () => a.setScheduleRuleAction(rule(id, "module", t.m, { mode: "days_after_access", days: 3 })),
    () => a.setScheduleRuleAction(rule(id, "module", t.m, { mode: "none" })),
    () => a.removeScheduleProductAction(fd({ scheduleId: id, productId: t.other })),
  ]) {
    await reset();
    expect(await change()).toEqual({ ok: true });
    expect(await stamp()).toBeGreaterThan(old.getTime());
  }

  expect((await sch.listSchedules(db, admin))[0].deliveryCount).toBe(0);
  const [d1] = await db.insert(deliveries).values({ name: "E1" }).returning();
  const [d2] = await db.insert(deliveries).values({ name: "E2", archivedAt: new Date() }).returning();
  for (const d of [d1, d2])
    await db.insert(deliveryItems).values([
      { deliveryId: d.id, targetType: "product", targetId: t.p, durationType: "lifetime", scheduleId: id },
      { deliveryId: d.id, targetType: "product", targetId: t.other, durationType: "lifetime", scheduleId: id },
    ]);
  expect((await sch.listSchedules(db, admin))[0].deliveryCount).toBe(1);
});

test("aluno e visitante: recusados, nada gravado", async () => {
  const t = await setup();
  const { id } = await sch.createSchedule(db, admin, { name: "T", productId: t.p });
  const snapshot = async () => [
    await db.select().from(schedules).orderBy(asc(schedules.id)),
    await db.select().from(scheduleProducts),
    await db.select().from(scheduleRules),
  ];
  const before = await snapshot();
  revalidatePath.mockClear();
  const denied = { ok: false, error: "Acesso restrito a administradores." };
  for (const who of [student, null]) {
    session.user = who;
    expect(await a.createScheduleAction(fd({ name: "X" }))).toEqual(denied);
    expect(await a.renameScheduleAction(fd({ id, name: "X" }))).toEqual(denied);
    expect(await a.trashScheduleAction(fd({ id }))).toEqual(denied);
    expect(await a.restoreScheduleAction(fd({ id }))).toEqual(denied);
    expect(await a.addScheduleProductAction(fd({ scheduleId: id, productId: t.other }))).toEqual(denied);
    expect(await a.removeScheduleProductAction(fd({ scheduleId: id, productId: t.p }))).toEqual(denied);
    expect(await a.setScheduleRuleAction(rule(id, "module", t.m, { mode: "days_after_access", days: 1 }))).toEqual(denied);
  }
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(await snapshot()).toEqual(before);
  await expect(sch.listSchedules(db, student)).rejects.toThrow("Acesso restrito a administradores.");
  await expect(sch.getProductSchedule(db, student, t.p)).rejects.toThrow("Acesso restrito a administradores.");
});
