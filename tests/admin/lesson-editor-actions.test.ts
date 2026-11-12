import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { lessons } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as c from "@/lib/admin/content";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));

import * as a from "@/app/dashboard/content/product/[id]/lesson/[lessonId]/actions";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;

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
async function row(id: number) {
  return (await db.select().from(lessons).where(eq(lessons.id, id)))[0];
}
async function setup() {
  const s = await c.createShowcase(db, admin, { name: "V" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  const other = await c.createProduct(db, admin, { showcaseId: s.id, name: "O" });
  const m = await c.createModule(db, admin, { productId: p.id, title: "M" });
  const l = await c.createLesson(db, admin, { moduleId: m.id, title: "Aula" });
  return { p: p.id, other: other.id, m: m.id, l: l.id };
}
const base = (p: number, l: number) => ({
  productId: p,
  id: l,
  title: "Aula editada",
  videoUrl: "https://youtu.be/abc",
  format: "standard",
  liveUrl: "",
  summary: "Resumo",
  thumbnailUrl: "/media/900000001",
});

test("salvar: campos + blocos; contentHtml gerado no servidor a partir dos blocos", async () => {
  const { p, l } = await setup();
  const blocks = {
    time: 1,
    blocks: [
      { id: "a", type: "header", data: { text: "Título", level: 2 } },
      { id: "b", type: "paragraph", data: { text: 'Oi <b>x</b><script>alert(1)</script><img src=x onerror="y">' } },
      { id: "c", type: "embed", data: { source: "https://evil.com/x", embed: "https://evil.com/x" } },
    ],
  };
  const res = await a.saveLessonAction(fd({ ...base(p, l), blocks: JSON.stringify(blocks), contentHtml: "<script>cliente</script>" }));
  expect(res).toEqual({ ok: true });
  const r = await row(l);
  expect(r).toMatchObject({
    title: "Aula editada",
    videoUrl: "https://youtu.be/abc",
    format: "standard",
    summary: "Resumo",
    thumbnailUrl: "/media/900000001",
    contentHtml: "<h2>Título</h2>\n<p>Oi <b>x</b></p>",
  });
  expect((r.contentBlocks as { blocks: unknown[] }).blocks).toHaveLength(3);
  expect(revalidatePath).toHaveBeenCalled();
});

test("sem `blocks` o conteúdo não muda; JSON inválido é recusado", async () => {
  const { p, l } = await setup();
  await a.saveLessonAction(fd({ ...base(p, l), blocks: JSON.stringify({ blocks: [{ type: "paragraph", data: { text: "a" } }] }) }));
  expect(await a.saveLessonAction(fd({ ...base(p, l), title: "Só título" }))).toEqual({ ok: true });
  expect(await row(l)).toMatchObject({ title: "Só título", contentHtml: "<p>a</p>" });
  for (const blocks of ["nope", '{"blocks":"x"}', "[]"])
    expect(await a.saveLessonAction(fd({ ...base(p, l), blocks }))).toEqual({ ok: false, error: "Requisição inválida." });
  expect((await row(l)).contentHtml).toBe("<p>a</p>");
});

test("formato live valida o link; título obrigatório; aula de outro produto recusada", async () => {
  const { p, other, l } = await setup();
  expect(await a.saveLessonAction(fd({ ...base(p, l), format: "live", liveUrl: "https://meet.x/1" }))).toEqual({ ok: true });
  expect(await row(l)).toMatchObject({ format: "live", liveUrl: "https://meet.x/1" });
  expect(await a.saveLessonAction(fd({ ...base(p, l), format: "live", liveUrl: "javascript:x" }))).toEqual({
    ok: false,
    error: "Endereço da transmissão inválido.",
  });
  expect(await a.saveLessonAction(fd({ ...base(p, l), format: "prova" }))).toEqual({ ok: false, error: "Formato inválido." });
  expect(await a.saveLessonAction(fd({ ...base(p, l), title: " " }))).toEqual({ ok: false, error: "Informe um título." });
  expect(await a.saveLessonAction(fd({ ...base(other, l) }))).toEqual({ ok: false, error: "Não encontrado." });
  expect(await a.saveLessonAction(fd({ ...base(p, l), id: "1;drop" }))).toEqual({ ok: false, error: "Requisição inválida." });
  expect((await row(l)).title).toBe("Aula editada");
});

test("criar nova aula no mesmo módulo; excluir volta para a aba Aulas", async () => {
  const { p, m, l } = await setup();
  const res = (await a.createSiblingLessonAction(fd({ productId: p, id: l }))) as { ok: true; id: number };
  expect(res.ok).toBe(true);
  expect(await row(res.id)).toMatchObject({ moduleId: m, title: "Nova aula", position: 1 });

  await a.trashLessonAndLeaveAction(fd({ productId: p, id: res.id }));
  expect((await row(res.id)).deletedAt).not.toBeNull();
  expect(redirect).toHaveBeenCalledWith(`/dashboard/content/product/${p}`);
  // aula excluída não abre mais no editor
  await expect(c.getLessonForEdit(db, admin, p, res.id)).rejects.toThrow("Não encontrado.");
});

test("aluno e visitante: recusados, nada gravado", async () => {
  const { p, l } = await setup();
  const before = await db.select().from(lessons).orderBy(asc(lessons.id));
  for (const who of [student, null]) {
    session.user = who;
    expect(await a.saveLessonAction(fd({ ...base(p, l), blocks: '{"blocks":[]}' }))).toEqual({ ok: false, error: "Acesso restrito a administradores." });
    expect(await a.createSiblingLessonAction(fd({ productId: p, id: l }))).toEqual({ ok: false, error: "Acesso restrito a administradores." });
    expect(await a.trashLessonAndLeaveAction(fd({ productId: p, id: l }))).toEqual({ ok: false, error: "Acesso restrito a administradores." });
  }
  expect(redirect).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(await db.select().from(lessons).orderBy(asc(lessons.id))).toEqual(before);
});

test("aula antiga (só HTML): salvar só o título mantém contentHtml byte a byte", async () => {
  const { p, l } = await setup();
  const legacy =
    '<h1>Boas-vindas</h1>\n<p style="color:#ff7500">Texto <span class="x">com estilo</span></p><table><tr><td>a</td></tr></table>' +
    '<iframe src="https://player-vz-1.tv.pandavideo.com.br/embed/?v=abc" width="720"></iframe><a href="#topo">x</a>';
  await db.update(lessons).set({ contentHtml: legacy, contentBlocks: null }).where(eq(lessons.id, l));
  expect(await a.saveLessonAction(fd({ ...base(p, l), title: "Novo título", summary: "" }))).toEqual({ ok: true });
  const r = await row(l);
  expect(r.title).toBe("Novo título");
  expect(r.contentHtml).toBe(legacy);
  expect(r.contentBlocks).toBeNull();
});
