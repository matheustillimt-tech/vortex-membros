import { and, asc, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { lessons, modules, products } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as c from "@/lib/admin/content";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));

import * as a from "@/app/dashboard/content/product/[id]/actions";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;
const DENIED = { ok: false, error: "Acesso restrito a administradores." };

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  session.user = admin;
  revalidatePath.mockClear();
  redirect.mockClear();
});
afterEach(() => setDbForTests(null));

function fd(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}
async function lessonIds(moduleId: number) {
  const rows = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)))
    .orderBy(asc(lessons.position));
  return rows.map((r) => r.id);
}
async function setup() {
  const s = await c.createShowcase(db, admin, { name: "V" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  const other = await c.createProduct(db, admin, { showcaseId: s.id, name: "Outro" });
  const m1 = await c.createModule(db, admin, { productId: p.id, title: "M1" });
  const m2 = await c.createModule(db, admin, { productId: p.id, title: "M2" });
  const mx = await c.createModule(db, admin, { productId: other.id, title: "MX" });
  const l1 = await c.createLesson(db, admin, { moduleId: m1.id, title: "L1" });
  const l2 = await c.createLesson(db, admin, { moduleId: m1.id, title: "L2" });
  const l3 = await c.createLesson(db, admin, { moduleId: m2.id, title: "L3" });
  return { p: p.id, other: other.id, m1: m1.id, m2: m2.id, mx: mx.id, l1: l1.id, l2: l2.id, l3: l3.id };
}

test("módulos: criar, renomear, status, capa, lixeira e restaurar; revalida as telas", async () => {
  const { p } = await setup();
  const res = (await a.createModuleAction(fd({ productId: p, title: "  Novo  " }))) as { ok: true; id: number };
  expect(res.ok).toBe(true);
  expect((await db.select().from(modules).where(eq(modules.id, res.id)))[0]).toMatchObject({ productId: p, title: "Novo", position: 2 });
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/content/product/[id]", "layout");
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/content/products");

  const id = res.id;
  expect(await a.renameModuleAction(fd({ id, title: "Renomeado" }))).toEqual({ ok: true });
  expect(await a.setModuleStatusAction(fd({ id, status: "hidden" }))).toEqual({ ok: true });
  expect(await a.setModuleCoverAction(fd({ id, coverUrl: "/media/900000001" }))).toEqual({ ok: true });
  expect((await db.select().from(modules).where(eq(modules.id, id)))[0]).toMatchObject({
    title: "Renomeado",
    status: "hidden",
    coverUrl: "/media/900000001",
  });
  expect(await a.setModuleCoverAction(fd({ id, coverUrl: "javascript:alert(1)" }))).toEqual({ ok: false, error: "Endereço de imagem inválido." });
  expect(await a.setModuleStatusAction(fd({ id, status: "x" }))).toEqual({ ok: false, error: "Status inválido." });
  expect(await a.createModuleAction(fd({ productId: p, title: " " }))).toEqual({ ok: false, error: "Informe um título." });

  expect(await a.trashModuleAction(fd({ id }))).toEqual({ ok: true });
  expect((await c.listProductTrash(db, admin, p)).modules.map((m) => m.id)).toEqual([id]);
  expect(await a.restoreModuleAction(fd({ id }))).toEqual({ ok: true });
  expect((await c.listProductTrash(db, admin, p)).modules).toEqual([]);
});

test("aulas: criar, renomear, status, miniatura, lixeira e restaurar", async () => {
  const { p, m1 } = await setup();
  const res = (await a.createLessonAction(fd({ moduleId: m1, title: "Aula nova" }))) as { ok: true; id: number };
  const id = res.id;
  expect(await lessonIds(m1)).toHaveLength(3);
  expect(await a.renameLessonAction(fd({ id, title: "Aula X" }))).toEqual({ ok: true });
  expect(await a.setLessonStatusAction(fd({ id, status: "hidden" }))).toEqual({ ok: true });
  expect(await a.setLessonThumbnailAction(fd({ id, thumbnailUrl: "/media/900000002" }))).toEqual({ ok: true });
  expect((await db.select().from(lessons).where(eq(lessons.id, id)))[0]).toMatchObject({
    title: "Aula X",
    status: "hidden",
    thumbnailUrl: "/media/900000002",
  });
  expect(await a.trashLessonAction(fd({ id }))).toEqual({ ok: true });
  const trash = await c.listProductTrash(db, admin, p);
  expect(trash.lessons).toEqual([expect.objectContaining({ id, title: "Aula X", moduleTitle: "M1" })]);
  expect(await a.restoreLessonAction(fd({ id }))).toEqual({ ok: true });
  expect(await lessonIds(m1)).toContain(id);
});

test("ordem: reordenar módulos/aulas, mover aula entre módulos do mesmo produto; outro produto é recusado", async () => {
  const { p, m1, m2, mx, l1, l2, l3 } = await setup();
  expect(await a.reorderTreeAction(fd({ kind: "module", parentId: p, ids: `${m2},${m1}` }))).toEqual({ ok: true });
  const tree = await c.getProductTree(db, admin, p);
  expect(tree.modules.map((m) => m.id)).toEqual([m2, m1]);
  expect(await a.reorderTreeAction(fd({ kind: "lesson", parentId: m1, ids: `${l2},${l1}` }))).toEqual({ ok: true });
  expect(await lessonIds(m1)).toEqual([l2, l1]);

  expect(await a.moveLessonAction(fd({ id: l1, moduleId: m2, position: 0 }))).toEqual({ ok: true });
  expect(await lessonIds(m1)).toEqual([l2]);
  expect(await lessonIds(m2)).toEqual([l1, l3]);
  expect(await a.moveLessonAction(fd({ id: l1, moduleId: m2, position: 5 }))).toEqual({ ok: true });
  expect(await lessonIds(m2)).toEqual([l3, l1]);

  // módulo de outro produto: recusado sem alterar nada
  expect(await a.moveLessonAction(fd({ id: l1, moduleId: mx, position: 0 }))).toEqual({ ok: false, error: "Ordem inválida." });
  // módulo excluído
  await c.trashModule(db, admin, m1);
  expect(await a.moveLessonAction(fd({ id: l3, moduleId: m1, position: 0 }))).toEqual({ ok: false, error: "Ordem inválida." });
  expect(await lessonIds(m2)).toEqual([l3, l1]);
  expect(await lessonIds(mx)).toEqual([]);

  // ids de outro pai / lixo
  expect(await a.reorderTreeAction(fd({ kind: "lesson", parentId: m2, ids: `${l3},${l2}` }))).toEqual({ ok: false, error: "Ordem inválida." });
  expect(await a.reorderTreeAction(fd({ kind: "product", parentId: m2, ids: `${l3},${l1}` }))).toEqual({ ok: false, error: "Requisição inválida." });
  expect(await a.reorderTreeAction(fd({ kind: "lesson", parentId: "", ids: `${l3},${l1}` }))).toEqual({ ok: false, error: "Requisição inválida." });
  expect(await a.moveLessonAction(fd({ id: "1e3", moduleId: m2, position: 0 }))).toEqual({ ok: false, error: "Requisição inválida." });
});

test("publicar tudo: produto, módulos e aulas viram publicados", async () => {
  const { p, m1, l1, other } = await setup();
  await c.updateProduct(db, admin, p, { status: "hidden" });
  await c.updateModule(db, admin, m1, { status: "hidden" });
  await c.updateLesson(db, admin, l1, { status: "hidden" });
  await c.updateProduct(db, admin, other, { status: "hidden" });
  expect(await a.publishAllAction(fd({ productId: p }))).toEqual({ ok: true });
  const tree = await c.getProductTree(db, admin, p);
  expect(tree.product.status).toBe("published");
  expect(tree.modules.every((m) => m.status === "published" && m.lessons.every((l) => l.status === "published"))).toBe(true);
  expect((await db.select().from(products).where(eq(products.id, other)))[0].status).toBe("hidden");
  expect(await a.publishAllAction(fd({ productId: 123 }))).toEqual({ ok: false, error: "Não encontrado." });
});

test("getProductTree: produto excluído/inexistente → Não encontrado; aluno recusado", async () => {
  const { p } = await setup();
  await expect(c.getProductTree(db, student, p)).rejects.toThrow("Acesso restrito a administradores.");
  await c.trashProduct(db, admin, p);
  await expect(c.getProductTree(db, admin, p)).rejects.toThrow("Não encontrado.");
});

test("aluno e visitante: toda action recusada e nada gravado", async () => {
  const { p, m1, m2, l1, l2 } = await setup();
  const before = {
    m: await db.select().from(modules).orderBy(asc(modules.id)),
    l: await db.select().from(lessons).orderBy(asc(lessons.id)),
    p: await db.select().from(products).orderBy(asc(products.id)),
  };
  const calls: [keyof typeof a, Record<string, string | number>][] = [
    ["publishAllAction", { productId: p }],
    ["createModuleAction", { productId: p, title: "X" }],
    ["renameModuleAction", { id: m1, title: "X" }],
    ["setModuleStatusAction", { id: m1, status: "hidden" }],
    ["setModuleCoverAction", { id: m1, coverUrl: "/media/1" }],
    ["trashModuleAction", { id: m1 }],
    ["restoreModuleAction", { id: m1 }],
    ["createLessonAction", { moduleId: m1, title: "X" }],
    ["renameLessonAction", { id: l1, title: "X" }],
    ["setLessonStatusAction", { id: l1, status: "hidden" }],
    ["setLessonThumbnailAction", { id: l1, thumbnailUrl: "/media/1" }],
    ["trashLessonAction", { id: l1 }],
    ["restoreLessonAction", { id: l1 }],
    ["reorderTreeAction", { kind: "lesson", parentId: m1, ids: `${l2},${l1}` }],
    ["moveLessonAction", { id: l1, moduleId: m2, position: 0 }],
    ["trashProductAndLeaveAction", { id: p }],
  ];
  for (const who of [student, null]) {
    session.user = who;
    for (const [name, fields] of calls) {
      const fn = a[name] as (f: FormData) => Promise<unknown>;
      expect(await fn(fd(fields)), name).toEqual(DENIED);
    }
  }
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
  expect(await db.select().from(modules).orderBy(asc(modules.id))).toEqual(before.m);
  expect(await db.select().from(lessons).orderBy(asc(lessons.id))).toEqual(before.l);
  expect(await db.select().from(products).orderBy(asc(products.id))).toEqual(before.p);
});

test("erro de banco não vaza para a interface", async () => {
  const { m1 } = await setup();
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const broken = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "update" || prop === "select") {
        return () => {
          throw new Error('Failed query: update "modules" set ... params: segredo');
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  setDbForTests(broken as Database);
  expect(await a.renameModuleAction(fd({ id: m1, title: "X" }))).toEqual({ ok: false, error: "Não foi possível salvar." });
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

test("excluir produto pelo cabeçalho: vai para a lixeira e redireciona para Produtos", async () => {
  const { p } = await setup();
  await a.trashProductAndLeaveAction(fd({ id: p }));
  expect((await db.select().from(products).where(eq(products.id, p)))[0].deletedAt).not.toBeNull();
  expect(redirect).toHaveBeenCalledWith("/dashboard/content/products");
  redirect.mockClear();
  expect(await a.trashProductAndLeaveAction(fd({ id: "x" }))).toEqual({ ok: false, error: "Requisição inválida." });
  expect(redirect).not.toHaveBeenCalled();
});

test("publicar tudo não mexe em aulas de módulo na lixeira", async () => {
  const { p, m1, l1 } = await setup();
  await c.updateLesson(db, admin, l1, { status: "hidden" });
  await c.trashModule(db, admin, m1);
  expect(await a.publishAllAction(fd({ productId: p }))).toEqual({ ok: true });
  expect((await db.select().from(lessons).where(eq(lessons.id, l1)))[0].status).toBe("hidden");
});

test("restaurar aula de módulo na lixeira restaura o módulo junto", async () => {
  const { p, m1, l1, l2 } = await setup();
  await c.trashLesson(db, admin, l1);
  await c.trashModule(db, admin, m1);
  expect(await a.restoreLessonAction(fd({ id: l1 }))).toEqual({ ok: true });
  const tree = await c.getProductTree(db, admin, p);
  const mod = tree.modules.find((m) => m.id === m1);
  expect(mod?.lessons.map((l) => l.id).sort()).toEqual([l1, l2].sort());
  expect((await c.listProductTrash(db, admin, p)).modules).toEqual([]);
  expect(await a.restoreLessonAction(fd({ id: 424242 }))).toEqual({ ok: false, error: "Não encontrado." });
});
