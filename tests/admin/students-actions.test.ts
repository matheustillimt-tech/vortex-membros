import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { deliveries, deliveryItems, emailOutbox, productAccess, products, showcases, studentNotes, tags, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "alunos.exemplo.com", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => undefined, set: vi.fn() }),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/email/send-now", () => ({ scheduleOutboxFlush: vi.fn() }));

import * as list from "@/app/dashboard/students/actions";
import * as prof from "@/app/dashboard/student/[id]/actions";

let db: Database;
let root: User;
let aluno: User;
let P: number;
let D: number;

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  [root] = await db.insert(users).values({ email: "root@x.com", name: "Root", role: "admin", adminRole: "root", passwordHash: "x", loginToken: "tr" }).returning();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "Aluno", role: "student", passwordHash: "x", loginToken: "ta", document: "12345678909" }).returning();
  const [s] = await db.insert(showcases).values({ name: "Vitrine", status: "published" }).returning();
  [{ id: P }] = await db.insert(products).values({ showcaseId: s.id, name: "Produto", status: "published" }).returning();
  [{ id: D }] = await db.insert(deliveries).values({ name: "Entrega" }).returning();
  await db.insert(deliveryItems).values({ deliveryId: D, targetType: "product", targetId: P, durationType: "lifetime" });
  session.user = root;
  revalidatePath.mockClear();
});
afterEach(() => setDbForTests(null));

function fd(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}

test("aluno e deslogado não executam nenhuma action", async () => {
  for (const u of [aluno, null]) {
    session.user = u;
    expect(await list.createStudentAction(fd({ name: "X", email: "x@x.com" }))).toEqual({ ok: false, error: "Acesso restrito a administradores." });
    expect(await list.deleteStudentAction(fd({ id: aluno.id }))).toMatchObject({ ok: false });
    expect(await list.listStudentsAction(fd({}))).toMatchObject({ ok: false });
    expect(await list.loadFilterOptionsAction(fd({ kind: "products" }))).toMatchObject({ ok: false });
    expect(await prof.addNoteAction(fd({ id: aluno.id, body: "x" }))).toMatchObject({ ok: false });
    expect(await prof.addDeliveryAction(fd({ id: aluno.id, deliveryId: D }))).toMatchObject({ ok: false });
    expect(await prof.listLogsAction(fd({ id: aluno.id }))).toMatchObject({ ok: false });
  }
  expect(await db.select().from(studentNotes)).toHaveLength(0);
  expect(await db.select().from(productAccess)).toHaveLength(0);
});

test("lista: filtros da URL/formulário, linhas formatadas e paginação", async () => {
  const res = await list.listStudentsAction(fd({ field: "document", q: "123.456.789-09" }));
  expect(res).toMatchObject({ ok: true, total: 1, nextCursor: null });
  if (!res.ok) throw new Error();
  expect(res.rows).toEqual([
    { id: aluno.id, name: "Aluno", email: "a@x.com", document: "123.456.789-09", lastAccess: "Nunca acessou", initials: "A", color: expect.stringMatching(/^bg-/) },
  ]);
  expect(await list.listStudentsAction(fd({ status: "bogus" }))).toMatchObject({ ok: true, total: 1 }); // valor fora da lista = sem filtro
});

test("opções dos filtros sob demanda", async () => {
  await db.insert(tags).values({ name: "GARANTIA" });
  const r = await list.loadFilterOptionsAction(fd({ kind: "products" }));
  expect(r).toEqual({ ok: true, options: [{ value: String(P), label: "Produto" }] });
  expect(await list.loadFilterOptionsAction(fd({ kind: "tags" }))).toMatchObject({ ok: true, options: [{ label: "GARANTIA" }] });
  expect(await list.loadFilterOptionsAction(fd({ kind: "deliveries" }))).toMatchObject({ ok: true, options: [{ value: String(D), label: "Entrega" }] });
  expect(await list.loadFilterOptionsAction(fd({ kind: "showcases" }))).toMatchObject({ ok: true, options: [{ label: "Vitrine" }] });
  expect(await list.loadFilterOptionsAction(fd({ kind: "x" }))).toEqual({ ok: false, error: "Requisição inválida." });
});

test("criar, reenviar, excluir e restaurar pela lista", async () => {
  const c = await list.createStudentAction(fd({ name: "Nova", email: "nova@x.com" }));
  expect(c).toMatchObject({ ok: true });
  expect(await db.select().from(emailOutbox)).toHaveLength(1);
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/students");
  expect(await list.resendWelcomeAction(fd({ id: aluno.id }))).toEqual({ ok: true });
  expect(await list.deleteStudentAction(fd({ id: aluno.id }))).toEqual({ ok: true });
  expect((await db.select().from(users).where(eq(users.id, aluno.id)))[0].deletedAt).not.toBeNull();
  expect(await list.restoreStudentAction(fd({ id: aluno.id }))).toEqual({ ok: true });
  expect(await list.deleteStudentAction(fd({ id: "abc" }))).toEqual({ ok: false, error: "Requisição inválida." });
});

test("perfil: editar, senha (confere), notas, tags, entrega, compras, tempo, liberação e progresso", async () => {
  expect(await prof.updateStudentAction(fd({ id: aluno.id, name: "Novo Nome", email: "a@x.com", document: "", phone: "11900000000", ddi: "55" }))).toEqual({ ok: true });
  expect((await db.select().from(users).where(eq(users.id, aluno.id)))[0]).toMatchObject({ name: "Novo Nome", phone: "+5511900000000" });
  expect(await prof.setStudentPasswordAction(fd({ id: aluno.id, password: "abcdef1", password2: "abcdef2" }))).toEqual({ ok: false, error: "As senhas não conferem." });
  expect(await prof.setStudentPasswordAction(fd({ id: aluno.id, password: "abcdef1", password2: "abcdef1" }))).toEqual({ ok: true });
  expect(await prof.addNoteAction(fd({ id: aluno.id, body: "nota" }))).toMatchObject({ ok: true });
  const [note] = await db.select().from(studentNotes);
  expect(await prof.deleteNoteAction(fd({ id: aluno.id, noteId: note.id }))).toEqual({ ok: true });
  const [t] = await db.insert(tags).values({ name: "VIP" }).returning();
  expect(await prof.setStudentTagsAction(fd({ id: aluno.id, tagIds: String(t.id) }))).toEqual({ ok: true });

  expect(await prof.addDeliveryAction(fd({ id: aluno.id, deliveryId: D }))).toEqual({ ok: true });
  const [acc] = await db.select().from(productAccess);
  const key = { id: aluno.id, deliveryId: D, saleRef: acc.saleRef! };
  expect(await prof.setPurchaseActiveAction(fd({ ...key, active: "0" }))).toEqual({ ok: true });
  expect((await db.select().from(productAccess))[0].revokedAt).not.toBeNull();
  expect(await prof.setPurchaseActiveAction(fd({ ...key, active: "1" }))).toEqual({ ok: true });
  // 31/12/2026 23:59 em São Paulo = 01/01/2027 02:59Z
  expect(await prof.schedulePurchaseEndAction(fd({ ...key, end: "2026-12-31T23:59" }))).toEqual({ ok: true });
  expect((await db.select().from(productAccess))[0].expiresAt).toEqual(new Date("2027-01-01T02:59:00Z"));
  expect(await prof.schedulePurchaseEndAction(fd({ ...key, end: "31/12/2026" }))).toEqual({ ok: false, error: "Data inválida." });
  expect(await prof.setAccessUntilAction(fd({ id: aluno.id, productId: P, mode: "lifetime" }))).toEqual({ ok: true });
  expect((await db.select().from(productAccess))[0].expiresAt).toBeNull();
  expect(await prof.setAccessUntilAction(fd({ id: aluno.id, productId: "all", mode: "add", days: 2, weeks: 0, months: 0, years: 0 }))).toEqual({ ok: true });
  expect(await prof.toggleReleaseAction(fd({ id: aluno.id, productId: P, immediate: "1" }))).toEqual({ ok: true });
  expect(await prof.deleteProgressAction(fd({ id: aluno.id, productId: P }))).toEqual({ ok: true });
  expect(await prof.startAllAccessesAction(fd({ id: aluno.id }))).toEqual({ ok: true });
  expect(await prof.deletePurchaseAction(fd(key))).toEqual({ ok: true });
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/student/[id]", "layout");
});

test("logs pela action", async () => {
  const r = await prof.listLogsAction(fd({ id: aluno.id }));
  expect(r).toEqual({ ok: true, rows: [], total: 0, nextCursor: null });
});

