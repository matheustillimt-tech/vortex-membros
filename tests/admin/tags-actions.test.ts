import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { deliveries, deliveryTags, tags, userTags, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { countStudentsByTag, deleteTag, listTags, renameTag } from "@/lib/sales/tags";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import * as a from "@/app/dashboard/students/tags/actions";

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
async function student_(email: string, deletedAt: Date | null = null) {
  const [u] = await db.insert(users).values({ email, name: email, role: "student", passwordHash: "x", loginToken: `t-${email}`, deletedAt }).returning();
  return u.id;
}

test("criar: nome obrigatório, até 60, único sem diferenciar maiúsculas", async () => {
  const res = (await a.createTagAction(fd({ name: "  Turma A " }))) as { ok: true; id: number };
  expect(res.ok).toBe(true);
  expect(await listTags(db, admin)).toEqual([{ id: res.id, name: "Turma A" }]);
  expect(await a.createTagAction(fd({ name: "turma a" }))).toEqual({ ok: false, error: "Já existe uma tag com este nome." });
  expect(await a.createTagAction(fd({ name: "   " }))).toEqual({ ok: false, error: "Informe o nome da tag." });
  expect(await a.createTagAction(fd({ name: "x".repeat(61) }))).toEqual({ ok: false, error: "O nome da tag pode ter até 60 caracteres." });
  expect((await a.createTagAction(fd({ name: "x".repeat(60) }))).ok).toBe(true);
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/students/tags");
});

test("renomear: valida, recusa nome de outra tag, aceita mudar só maiúsculas", async () => {
  const [t1] = await db.insert(tags).values({ name: "GARANTIA" }).returning();
  const [t2] = await db.insert(tags).values({ name: "VIP" }).returning();
  expect(await a.renameTagAction(fd({ id: t1.id, name: "Garantia" }))).toEqual({ ok: true });
  expect(await a.renameTagAction(fd({ id: t1.id, name: "vip" }))).toEqual({ ok: false, error: "Já existe uma tag com este nome." });
  expect(await a.renameTagAction(fd({ id: t1.id, name: "" }))).toEqual({ ok: false, error: "Informe o nome da tag." });
  expect(await a.renameTagAction(fd({ id: 999999, name: "Nova" }))).toEqual({ ok: false, error: "Tag não encontrada." });
  expect(await a.renameTagAction(fd({ id: "abc", name: "Nova" }))).toEqual({ ok: false, error: "Requisição inválida." });
  expect(await listTags(db, admin)).toEqual([
    { id: t1.id, name: "Garantia" },
    { id: t2.id, name: "VIP" },
  ]);
});

test("excluir: remove a tag e os vínculos com alunos e entregas, sem excluir alunos", async () => {
  const [t1] = await db.insert(tags).values({ name: "GARANTIA" }).returning();
  const [t2] = await db.insert(tags).values({ name: "VIP" }).returning();
  const u = await student_("u@x.com");
  const [d] = await db.insert(deliveries).values({ name: "E" }).returning();
  await db.insert(userTags).values([{ userId: u, tagId: t1.id }, { userId: u, tagId: t2.id }]);
  await db.insert(deliveryTags).values([{ deliveryId: d.id, tagId: t1.id }]);

  expect(await a.deleteTagAction(fd({ id: t1.id }))).toEqual({ ok: true });
  expect(await listTags(db, admin)).toEqual([{ id: t2.id, name: "VIP" }]);
  expect(await db.select().from(userTags)).toEqual([{ userId: u, tagId: t2.id }]);
  expect(await db.select().from(deliveryTags)).toEqual([]);
  expect((await db.select().from(users)).map((r) => r.id)).toEqual([u]);
  expect(await a.deleteTagAction(fd({ id: t1.id }))).toEqual({ ok: false, error: "Tag não encontrada." });
});

test("contagem de alunos por tag ignora excluídos e administradores", async () => {
  const [t1] = await db.insert(tags).values({ name: "A" }).returning();
  const [t2] = await db.insert(tags).values({ name: "B" }).returning();
  await db.insert(tags).values({ name: "C" });
  const u1 = await student_("1@x.com");
  const u2 = await student_("2@x.com");
  const gone = await student_("3@x.com", new Date());
  const [adm] = await db.insert(users).values({ email: "adm@x.com", name: "adm", role: "admin", passwordHash: "x", loginToken: "ta" }).returning();
  await db.insert(userTags).values([
    { userId: u1, tagId: t1.id },
    { userId: u2, tagId: t1.id },
    { userId: gone, tagId: t1.id },
    { userId: adm.id, tagId: t1.id },
    { userId: u2, tagId: t2.id },
  ]);
  expect(await countStudentsByTag(db, admin)).toEqual({ [t1.id]: 2, [t2.id]: 1 });
});

test("só admin: actions e camada de dados", async () => {
  const [t] = await db.insert(tags).values({ name: "X" }).returning();
  session.user = student;
  expect((await a.createTagAction(fd({ name: "Y" }))).ok).toBe(false);
  expect((await a.renameTagAction(fd({ id: t.id, name: "Y" }))).ok).toBe(false);
  expect((await a.deleteTagAction(fd({ id: t.id }))).ok).toBe(false);
  session.user = null;
  expect((await a.deleteTagAction(fd({ id: t.id }))).ok).toBe(false);
  await expect(renameTag(db, student, t.id, "Y")).rejects.toThrow();
  await expect(deleteTag(db, null, t.id)).rejects.toThrow();
  await expect(countStudentsByTag(db, student)).rejects.toThrow();
  expect(await listTags(db, admin)).toEqual([{ id: t.id, name: "X" }]);
});

test("banco recusa nome repetido sem diferenciar maiúsculas; rename em corrida vira mensagem de duplicada", async () => {
  await db.insert(tags).values({ name: "Turma A" });
  await expect(db.insert(tags).values({ name: "TURMA a" })).rejects.toThrow();
  const [b] = await db.insert(tags).values({ name: "B" }).returning();
  // Simula a corrida: a checagem prévia não vê a outra tag (findByName), mas o índice barra a gravação.
  const spy = vi.spyOn(db, "select").mockImplementationOnce((() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) })) as never);
  expect(await a.renameTagAction(fd({ id: b.id, name: "turma A" }))).toEqual({ ok: false, error: "Já existe uma tag com este nome." });
  spy.mockRestore();
});

test("migração 0016 junta tags repetidas na de menor id, levando os vínculos", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`drop index tags_name_lower_uq`);
  const [keep] = await db.insert(tags).values({ name: "VIP" }).returning();
  const [dup] = await db.insert(tags).values({ name: "vip" }).returning();
  const [other] = await db.insert(tags).values({ name: "Outra" }).returning();
  const u1 = await student_("d1@x.com");
  const u2 = await student_("d2@x.com");
  const [d] = await db.insert(deliveries).values({ name: "E" }).returning();
  await db.insert(userTags).values([{ userId: u1, tagId: keep.id }, { userId: u1, tagId: dup.id }, { userId: u2, tagId: dup.id }]);
  await db.insert(deliveryTags).values([{ deliveryId: d.id, tagId: dup.id }]);

  const file = fs.readFileSync(path.resolve(__dirname, "../../drizzle/0016_visualizacoes_indices_tags.sql"), "utf8");
  const statements = file.split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean);
  const from = statements.findIndex((x) => x.includes('CREATE TEMP TABLE "tag_dupes"'));
  for (const st of statements.slice(from)) await db.execute(sql.raw(st));

  expect((await listTags(db, admin)).map((t) => t.id).sort()).toEqual([keep.id, other.id].sort());
  expect((await db.select().from(userTags)).map((r) => `${r.userId}:${r.tagId}`).sort()).toEqual([`${u1}:${keep.id}`, `${u2}:${keep.id}`].sort());
  expect(await db.select().from(deliveryTags)).toEqual([{ deliveryId: d.id, tagId: keep.id }]);
  await expect(db.insert(tags).values({ name: "Vip" })).rejects.toThrow();
});
