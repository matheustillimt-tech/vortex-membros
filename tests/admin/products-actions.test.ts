import { asc, eq, isNull, and } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { lessons, modules, products, showcases } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as c from "@/lib/admin/content";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import * as a from "@/app/dashboard/content/products/actions";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;
const DENIED = { ok: false, error: "Acesso restrito a administradores." };

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
async function showcaseRow(id: number) {
  return (await db.select().from(showcases).where(eq(showcases.id, id)))[0];
}
async function productRow(id: number) {
  return (await db.select().from(products).where(eq(products.id, id)))[0];
}
async function productIds(showcaseId: number) {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.showcaseId, showcaseId), isNull(products.deletedAt)))
    .orderBy(asc(products.position));
  return rows.map((r) => r.id);
}

test("vitrine: criar, subvitrine, renomear, status, duplicar, lixeira e restaurar", async () => {
  const created = await a.createShowcaseAction(fd({ name: "  Formação  " }));
  expect(created).toMatchObject({ ok: true });
  const id = (created as { id: number }).id;
  expect(await showcaseRow(id)).toMatchObject({ name: "Formação", parentId: null, status: "published" });
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/content/products");

  const sub = (await a.createShowcaseAction(fd({ name: "Sub", parentId: id }))) as { id: number };
  expect(await showcaseRow(sub.id)).toMatchObject({ parentId: id });

  expect(await a.renameShowcaseAction(fd({ id, name: "Renomeada" }))).toEqual({ ok: true });
  expect((await showcaseRow(id)).name).toBe("Renomeada");
  expect(await a.renameShowcaseAction(fd({ id, name: "   " }))).toEqual({ ok: false, error: "Informe um nome." });

  expect(await a.setShowcaseStatusAction(fd({ id, status: "unlisted" }))).toEqual({ ok: true });
  expect((await showcaseRow(id)).status).toBe("unlisted");
  expect(await a.setShowcaseStatusAction(fd({ id, status: "hacked" }))).toEqual({ ok: false, error: "Status inválido." });

  const dup = (await a.duplicateShowcaseAction(fd({ id }))) as { ok: true; id: number };
  expect((await showcaseRow(dup.id)).name).toBe("Renomeada (cópia)");

  expect(await a.trashShowcaseAction(fd({ id }))).toEqual({ ok: true });
  expect((await showcaseRow(id)).deletedAt).not.toBeNull();
  expect(await a.restoreShowcaseAction(fd({ id }))).toEqual({ ok: true });
  expect((await showcaseRow(id)).deletedAt).toBeNull();
});

test("produto: criar, renomear, status, imagem, duplicar (para outra vitrine), lixeira e restaurar", async () => {
  const s1 = await c.createShowcase(db, admin, { name: "A" });
  const s2 = await c.createShowcase(db, admin, { name: "B" });
  const created = (await a.createProductAction(fd({ showcaseId: s1.id, name: "Curso" }))) as { ok: true; id: number };
  expect(created.ok).toBe(true);
  const id = created.id;
  expect(await productRow(id)).toMatchObject({ showcaseId: s1.id, name: "Curso", status: "published" });

  expect(await a.renameProductAction(fd({ id, name: "Curso 2" }))).toEqual({ ok: true });
  expect(await a.setProductStatusAction(fd({ id, status: "hidden" }))).toEqual({ ok: true });
  expect(await a.setProductImageAction(fd({ id, thumbnailUrl: "/media/900000001" }))).toEqual({ ok: true });
  expect(await productRow(id)).toMatchObject({ name: "Curso 2", status: "hidden", thumbnailUrl: "/media/900000001" });
  expect(await a.setProductImageAction(fd({ id, thumbnailUrl: "javascript:alert(1)" }))).toEqual({
    ok: false,
    error: "Endereço de imagem inválido.",
  });
  expect(await a.setProductImageAction(fd({ id, thumbnailUrl: "" }))).toEqual({ ok: true });
  expect((await productRow(id)).thumbnailUrl).toBeNull();

  const same = (await a.duplicateProductAction(fd({ id }))) as { id: number };
  expect((await productRow(same.id)).showcaseId).toBe(s1.id);
  const other = (await a.duplicateProductAction(fd({ id, targetShowcaseId: s2.id }))) as { id: number };
  expect(await productRow(other.id)).toMatchObject({ showcaseId: s2.id, name: "Curso 2 (cópia)" });

  expect(await a.trashProductAction(fd({ id }))).toEqual({ ok: true });
  expect((await productRow(id)).deletedAt).not.toBeNull();
  expect(await a.restoreProductAction(fd({ id }))).toEqual({ ok: true });
  expect((await productRow(id)).deletedAt).toBeNull();
});

test("reordenar e mover entre vitrines; ids forjados ou de outro pai são recusados", async () => {
  const s1 = await c.createShowcase(db, admin, { name: "A" });
  const s2 = await c.createShowcase(db, admin, { name: "B" });
  const p1 = await c.createProduct(db, admin, { showcaseId: s1.id, name: "1" });
  const p2 = await c.createProduct(db, admin, { showcaseId: s1.id, name: "2" });
  const p3 = await c.createProduct(db, admin, { showcaseId: s2.id, name: "3" });

  expect(await a.reorderAction(fd({ kind: "product", parentId: s1.id, ids: `${p2.id},${p1.id}` }))).toEqual({ ok: true });
  expect(await productIds(s1.id)).toEqual([p2.id, p1.id]);

  expect(await a.reorderAction(fd({ kind: "showcase", parentId: "", ids: `${s2.id},${s1.id}` }))).toEqual({ ok: true });
  expect((await showcaseRow(s2.id)).position).toBe(0);

  // id de outro pai
  expect(await a.reorderAction(fd({ kind: "product", parentId: s1.id, ids: `${p2.id},${p3.id}` }))).toEqual({
    ok: false,
    error: "Ordem inválida.",
  });
  // lixo no form
  for (const bad of [
    { kind: "product", parentId: s1.id, ids: `${p2.id},abc` },
    { kind: "lesson", parentId: s1.id, ids: `${p2.id},${p1.id}` },
    { kind: "product", parentId: "-1", ids: `${p2.id},${p1.id}` },
  ]) {
    expect(await a.reorderAction(fd(bad))).toEqual({ ok: false, error: "Requisição inválida." });
  }
  expect(await productIds(s1.id)).toEqual([p2.id, p1.id]);

  expect(await a.moveProductAction(fd({ id: p1.id, showcaseId: s2.id, position: 0 }))).toEqual({ ok: true });
  expect(await productIds(s1.id)).toEqual([p2.id]);
  expect(await productIds(s2.id)).toEqual([p1.id, p3.id]);
  expect(await a.moveProductAction(fd({ id: p1.id, showcaseId: 999 }))).toEqual({ ok: false, error: "Requisição inválida." });
});

test("aluno e visitante: toda action é recusada e nada é gravado", async () => {
  const s = await c.createShowcase(db, admin, { name: "A" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  const p2 = await c.createProduct(db, admin, { showcaseId: s.id, name: "P2" });
  const calls: [keyof typeof a, Record<string, string | number>][] = [
    ["createShowcaseAction", { name: "X" }],
    ["renameShowcaseAction", { id: s.id, name: "X" }],
    ["setShowcaseStatusAction", { id: s.id, status: "unlisted" }],
    ["duplicateShowcaseAction", { id: s.id }],
    ["trashShowcaseAction", { id: s.id }],
    ["restoreShowcaseAction", { id: s.id }],
    ["createProductAction", { showcaseId: s.id, name: "X" }],
    ["renameProductAction", { id: p.id, name: "X" }],
    ["setProductStatusAction", { id: p.id, status: "hidden" }],
    ["setProductImageAction", { id: p.id, thumbnailUrl: "/media/1" }],
    ["duplicateProductAction", { id: p.id }],
    ["trashProductAction", { id: p.id }],
    ["restoreProductAction", { id: p.id }],
    ["reorderAction", { kind: "product", parentId: s.id, ids: `${p2.id},${p.id}` }],
    ["moveProductAction", { id: p.id, showcaseId: s.id, position: 1 }],
  ];
  for (const who of [student, null]) {
    session.user = who;
    for (const [name, fields] of calls) {
      const fn = a[name] as (f: FormData) => Promise<a.ActionResult>;
      expect(await fn(fd(fields)), name).toEqual(DENIED);
    }
  }
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(await db.select().from(showcases)).toHaveLength(1);
  expect(await showcaseRow(s.id)).toMatchObject({ name: "A", status: "published", deletedAt: null });
  expect(await db.select().from(products)).toHaveLength(2);
  expect(await productRow(p.id)).toMatchObject({ name: "P", status: "published", thumbnailUrl: null, deletedAt: null, position: 0 });
});

test("listShowcaseTree: subvitrines, contagem de aulas e itens excluídos de fora", async () => {
  const s = await c.createShowcase(db, admin, { name: "A" });
  const sub = await c.createShowcase(db, admin, { name: "Sub", parentId: s.id });
  const gone = await c.createShowcase(db, admin, { name: "Excluída" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  await c.createProduct(db, admin, { showcaseId: sub.id, name: "Q" });
  await c.createProduct(db, admin, { showcaseId: gone.id, name: "R" });
  const m = await c.createModule(db, admin, { productId: p.id, title: "M" });
  const m2 = await c.createModule(db, admin, { productId: p.id, title: "M2" });
  await c.createLesson(db, admin, { moduleId: m.id, title: "1" });
  const l2 = await c.createLesson(db, admin, { moduleId: m.id, title: "2" });
  await c.createLesson(db, admin, { moduleId: m2.id, title: "3" });
  await c.trashLesson(db, admin, l2.id);
  await c.trashModule(db, admin, m2.id);
  await c.trashShowcase(db, admin, gone.id);

  const tree = await c.listShowcaseTree(db, admin);
  expect(tree.map((n) => n.name)).toEqual(["A"]);
  expect(tree[0].products).toEqual([expect.objectContaining({ id: p.id, name: "P", lessonCount: 1, isFree: false })]);
  expect(tree[0].children.map((n) => [n.name, n.products.map((x) => x.name)])).toEqual([["Sub", ["Q"]]]);
  await expect(c.listShowcaseTree(db, student)).rejects.toThrow("Acesso restrito a administradores.");
  expect(await db.select().from(lessons)).toHaveLength(3);
  expect(await db.select().from(modules)).toHaveLength(2);
});

test("erros: só mensagens de domínio vão para a interface; erro de banco vira mensagem genérica", async () => {
  // domínio
  expect(await a.renameShowcaseAction(fd({ id: 999, name: "X" }))).toEqual({ ok: false, error: "Não encontrado." });
  expect(await a.createProductAction(fd({ showcaseId: "abc", name: "X" }))).toEqual({ ok: false, error: "Requisição inválida." });
  // banco/driver: a mensagem (com SQL) não vaza
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const broken = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "insert" || prop === "select") {
        return () => {
          throw new Error('Failed query: insert into "showcases" ... params: segredo');
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  setDbForTests(broken as Database);
  const res = await a.createShowcaseAction(fd({ name: "X" }));
  expect(res).toEqual({ ok: false, error: "Não foi possível salvar." });
  expect(JSON.stringify(res)).not.toContain("Failed query");
  expect(spy).toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
  spy.mockRestore();
});
