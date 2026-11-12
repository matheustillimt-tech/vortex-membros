import { and, asc, eq, isNull } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { lessons, modules, products, showcases } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { getHomeCatalog } from "@/lib/catalog/queries";
import * as c from "@/lib/admin/content";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;
const DENIED = "Acesso restrito a administradores.";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
});

async function tree() {
  const s = await c.createShowcase(db, admin, { name: "Vitrine" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "Produto" });
  const m = await c.createModule(db, admin, { productId: p.id, title: "Módulo" });
  const l = await c.createLesson(db, admin, { moduleId: m.id, title: "Aula" });
  return { s: s.id, p: p.id, m: m.id, l: l.id };
}

test("vitrines: criar, renomear, ocultar, lixeira e restaurar", async () => {
  const { id } = await c.createShowcase(db, admin, { name: "  Nova  " });
  expect(id).toBeGreaterThanOrEqual(900000000);
  const [row] = await db.select().from(showcases).where(eq(showcases.id, id));
  expect(row).toMatchObject({ name: "Nova", status: "published", parentId: null, position: 0 });
  const second = await c.createShowcase(db, admin, { name: "Outra" });
  expect((await db.select().from(showcases).where(eq(showcases.id, second.id)))[0].position).toBe(1);

  await c.updateShowcase(db, admin, id, { name: "Renomeada", status: "unlisted" });
  expect((await db.select().from(showcases).where(eq(showcases.id, id)))[0]).toMatchObject({ name: "Renomeada", status: "unlisted" });
  await expect(c.updateShowcase(db, admin, id, { name: "  " })).rejects.toThrow("Informe um nome.");
  await expect(c.updateShowcase(db, admin, id, { status: "x" as never })).rejects.toThrow("Status inválido.");

  await c.trashShowcase(db, admin, id);
  expect((await c.listTrash(db, admin, "showcase")).map((r) => r.id)).toEqual([id]);
  await c.restoreShowcase(db, admin, id);
  expect(await c.listTrash(db, admin, "showcase")).toEqual([]);
});

test("subvitrine usa parentId e posições independentes", async () => {
  const a = await c.createShowcase(db, admin, { name: "A" });
  const b = await c.createShowcase(db, admin, { name: "B", parentId: a.id });
  const [row] = await db.select().from(showcases).where(eq(showcases.id, b.id));
  expect(row).toMatchObject({ parentId: a.id, position: 0 });
  await expect(c.createShowcase(db, admin, { name: "C", parentId: 12345 })).rejects.toThrow("Não encontrado.");
});

test("produtos: criar com padrões, atualizar com settings parciais mescladas", async () => {
  const s = await c.createShowcase(db, admin, { name: "V" });
  const { id } = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  const [p0] = await db.select().from(products).where(eq(products.id, id));
  expect(p0).toMatchObject({ status: "published", termsEnabled: false, termsHtml: null, position: 0 });
  expect((p0.settings as { listing: string }).listing).toBe("streaming");

  await c.updateProduct(db, admin, id, {
    name: "Novo",
    thumbnailUrl: "/media/900000001",
    accentColor: "#e91e63",
    status: "hidden",
    isFree: true,
    offerUrl: "https://loja.com/x",
    defaultAccessDays: 30,
    termsEnabled: true,
    termsHtml: "<p>Termo</p>",
    settings: { listing: "grid", lesson: { theaterMode: true } },
  });
  await c.updateProduct(db, admin, id, { settings: { lesson: { autoMarkSeen: true } } });
  const [p] = await db.select().from(products).where(eq(products.id, id));
  expect(p).toMatchObject({
    name: "Novo",
    thumbnailUrl: "/media/900000001",
    accentColor: "#e91e63",
    status: "hidden",
    isFree: true,
    offerUrl: "https://loja.com/x",
    defaultAccessDays: 30,
    termsEnabled: true,
    termsHtml: "<p>Termo</p>",
  });
  const st = p.settings as { listing: string; showBanner: boolean; lesson: { theaterMode: boolean; autoMarkSeen: boolean; showModuleBar: boolean } };
  expect(st.listing).toBe("grid");
  expect(st.showBanner).toBe(false);
  expect(st.lesson).toMatchObject({ theaterMode: true, autoMarkSeen: true, showModuleBar: true });
});

test("updateProduct valida endereços, cor e ignora chaves de protótipo", async () => {
  const t = await tree();
  await expect(c.updateProduct(db, admin, t.p, { thumbnailUrl: "javascript:alert(1)" })).rejects.toThrow("Endereço de imagem inválido.");
  await expect(c.updateProduct(db, admin, t.p, { offerUrl: "javascript:alert(1)" })).rejects.toThrow("Endereço da oferta inválido.");
  await expect(c.updateProduct(db, admin, t.p, { accentColor: "red;}" })).rejects.toThrow("Cor inválida.");
  await c.updateProduct(db, admin, t.p, JSON.parse('{"settings":{"__proto__":{"polluted":true},"constructor":{"x":1}}}'));
  const [p] = await db.select().from(products).where(eq(products.id, t.p));
  expect(Object.keys(p.settings)).not.toContain("constructor");
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test("módulos e aulas: criar, atualizar, lixeira", async () => {
  const t = await tree();
  await c.updateModule(db, admin, t.m, { title: "M2", coverUrl: "/media/900000002", status: "hidden" });
  expect((await db.select().from(modules).where(eq(modules.id, t.m)))[0]).toMatchObject({ title: "M2", coverUrl: "/media/900000002", status: "hidden" });

  await c.updateLesson(db, admin, t.l, {
    title: "A2",
    videoUrl: "https://vimeo.com/1",
    contentBlocks: { blocks: [{ type: "paragraph", data: { text: "oi" } }] },
    summary: "resumo",
    thumbnailUrl: "/media/900000003",
    format: "live",
    liveUrl: "https://meet.com/x",
    status: "hidden",
  });
  expect((await db.select().from(lessons).where(eq(lessons.id, t.l)))[0]).toMatchObject({
    title: "A2",
    videoUrl: "https://vimeo.com/1",
    contentBlocks: { blocks: [{ type: "paragraph", data: { text: "oi" } }] },
    contentHtml: "<p>oi</p>",
    summary: "resumo",
    thumbnailUrl: "/media/900000003",
    format: "live",
    liveUrl: "https://meet.com/x",
    status: "hidden",
  });
  await expect(c.updateLesson(db, admin, t.l, { format: "x" as never })).rejects.toThrow("Formato inválido.");
  await expect(c.createLesson(db, admin, { moduleId: 777, title: "x" })).rejects.toThrow("Não encontrado.");

  await c.trashLesson(db, admin, t.l);
  await c.trashModule(db, admin, t.m);
  expect((await c.listTrash(db, admin, "lesson")).map((r) => r.id)).toEqual([t.l]);
  expect((await c.listTrash(db, admin, "module")).map((r) => r.id)).toEqual([t.m]);
  await c.restoreModule(db, admin, t.m);
  await c.restoreLesson(db, admin, t.l);
  expect(await c.listTrash(db, admin, "lesson")).toEqual([]);
});

test("reorder: grava posições 0..n-1 numa ordem válida", async () => {
  const s = await c.createShowcase(db, admin, { name: "V" });
  const ids = [];
  for (const n of ["a", "b", "c"]) ids.push((await c.createProduct(db, admin, { showcaseId: s.id, name: n })).id);
  await c.reorder(db, admin, "product", s.id, [ids[2], ids[0], ids[1]]);
  const rows = await db.select().from(products).where(eq(products.showcaseId, s.id)).orderBy(asc(products.position));
  expect(rows.map((r) => r.name)).toEqual(["c", "a", "b"]);
  expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
});

test("reorder recusa ids de outro pai, faltando, repetidos ou inexistentes, sem alterar nada", async () => {
  const s1 = await c.createShowcase(db, admin, { name: "V1" });
  const s2 = await c.createShowcase(db, admin, { name: "V2" });
  const a = (await c.createProduct(db, admin, { showcaseId: s1.id, name: "a" })).id;
  const b = (await c.createProduct(db, admin, { showcaseId: s1.id, name: "b" })).id;
  const x = (await c.createProduct(db, admin, { showcaseId: s2.id, name: "x" })).id;
  const before = await db.select().from(products).orderBy(asc(products.id));

  for (const order of [[b, x], [x, a, b], [b], [b, b, a], [b, a, 1]]) {
    await expect(c.reorder(db, admin, "product", s1.id, order)).rejects.toThrow("Ordem inválida.");
  }
  expect(await db.select().from(products).orderBy(asc(products.id))).toEqual(before);
});

test("reorder: módulos de outro produto e aulas de outro módulo são recusados; excluídos não contam", async () => {
  const t1 = await tree();
  const t2 = await tree();
  await expect(c.reorder(db, admin, "module", t1.p, [t2.m])).rejects.toThrow("Ordem inválida.");
  await expect(c.reorder(db, admin, "lesson", t1.m, [t2.l])).rejects.toThrow("Ordem inválida.");
  const l2 = await c.createLesson(db, admin, { moduleId: t1.m, title: "Aula 2" });
  await c.trashLesson(db, admin, l2.id);
  await expect(c.reorder(db, admin, "lesson", t1.m, [t1.l, l2.id])).rejects.toThrow("Ordem inválida.");
  await c.reorder(db, admin, "lesson", t1.m, [t1.l]);
  // vitrines de topo (parentId null)
  const tops = (await db.select().from(showcases).where(isNull(showcases.parentId))).map((r) => r.id).reverse();
  await c.reorder(db, admin, "showcase", null, tops);
});

test("moveProduct entre vitrines renumera origem e destino", async () => {
  const s1 = await c.createShowcase(db, admin, { name: "V1" });
  const s2 = await c.createShowcase(db, admin, { name: "V2" });
  const a = (await c.createProduct(db, admin, { showcaseId: s1.id, name: "a" })).id;
  const b = (await c.createProduct(db, admin, { showcaseId: s1.id, name: "b" })).id;
  const x = (await c.createProduct(db, admin, { showcaseId: s2.id, name: "x" })).id;
  await c.moveProduct(db, admin, a, s2.id, 0);
  const pos = async (sid: number) =>
    (await db.select().from(products).where(eq(products.showcaseId, sid)).orderBy(asc(products.position))).map((r) => [r.id, r.position]);
  expect(await pos(s1.id)).toEqual([[b, 0]]);
  expect(await pos(s2.id)).toEqual([[a, 0], [x, 1]]);
  await expect(c.moveProduct(db, admin, a, 424242, 0)).rejects.toThrow("Não encontrado.");
});

test("duplicateProduct copia módulos e aulas com novos ids", async () => {
  const t = await tree();
  await c.updateLesson(db, admin, t.l, { contentBlocks: { blocks: [{ type: "paragraph", data: { text: "x" } }] }, videoUrl: "https://v.com/1" });
  const other = await c.createShowcase(db, admin, { name: "Outra" });
  const copy = await c.duplicateProduct(db, admin, t.p, other.id);
  expect(copy.id).not.toBe(t.p);
  const [p] = await db.select().from(products).where(eq(products.id, copy.id));
  expect(p).toMatchObject({ showcaseId: other.id, name: "Produto (cópia)" });
  const ms = await db.select().from(modules).where(eq(modules.productId, copy.id));
  expect(ms).toHaveLength(1);
  expect(ms[0].id).not.toBe(t.m);
  const ls = await db.select().from(lessons).where(eq(lessons.moduleId, ms[0].id));
  expect(ls).toHaveLength(1);
  expect(ls[0]).toMatchObject({ title: "Aula", contentHtml: "<p>x</p>", videoUrl: "https://v.com/1" });
  expect(ls[0].id).not.toBe(t.l);
  // original intacto
  expect(await db.select().from(lessons).where(eq(lessons.moduleId, t.m))).toHaveLength(1);
  // sem destino: fica na mesma vitrine
  const same = await c.duplicateProduct(db, admin, t.p);
  expect((await db.select().from(products).where(eq(products.id, same.id)))[0].showcaseId).toBe(t.s);
});

test("duplicateProduct ignora módulos e aulas excluídos", async () => {
  const t = await tree();
  const l2 = await c.createLesson(db, admin, { moduleId: t.m, title: "Morta" });
  await c.trashLesson(db, admin, l2.id);
  const copy = await c.duplicateProduct(db, admin, t.p);
  const [m] = await db.select().from(modules).where(eq(modules.productId, copy.id));
  expect(await db.select().from(lessons).where(eq(lessons.moduleId, m.id))).toHaveLength(1);
});

test("duplicateShowcase copia produtos, módulos e aulas", async () => {
  const t = await tree();
  const copy = await c.duplicateShowcase(db, admin, t.s);
  const [s] = await db.select().from(showcases).where(eq(showcases.id, copy.id));
  expect(s.name).toBe("Vitrine (cópia)");
  const ps = await db.select().from(products).where(eq(products.showcaseId, copy.id));
  expect(ps).toHaveLength(1);
  expect(ps[0].id).not.toBe(t.p);
  const ms = await db.select().from(modules).where(eq(modules.productId, ps[0].id));
  const ls = await db.select().from(lessons).where(eq(lessons.moduleId, ms[0].id));
  expect(ls).toHaveLength(1);
  expect(ls[0].id).not.toBe(t.l);
});

test("soft delete some da área do aluno e volta ao restaurar", async () => {
  const t = await tree();
  const names = async () => (await getHomeCatalog(db, student)).map((s) => s.name);
  const prods = async () => (await getHomeCatalog(db, admin)).flatMap((s) => s.products.map((p) => p.name));
  expect(await names()).toContain("Vitrine");
  await c.trashShowcase(db, admin, t.s);
  expect(await names()).not.toContain("Vitrine");
  await c.restoreShowcase(db, admin, t.s);
  expect(await names()).toContain("Vitrine");

  await c.trashProduct(db, admin, t.p);
  expect(await prods()).not.toContain("Produto");
  expect((await c.listTrash(db, admin, "product")).map((r) => r.id)).toEqual([t.p]);
  await c.restoreProduct(db, admin, t.p);
  expect(await prods()).toContain("Produto");
  // nada foi apagado de verdade
  expect(await db.select().from(lessons).where(and(eq(lessons.id, t.l), isNull(lessons.deletedAt)))).toHaveLength(1);
});

test("não-admin (aluno ou sem usuário) é recusado em toda função e nada é gravado", async () => {
  const t = await tree();
  const snapshot = async () => [
    await db.select().from(showcases),
    await db.select().from(products),
    await db.select().from(modules),
    await db.select().from(lessons),
  ];
  const before = await snapshot();
  for (const actor of [student, null as unknown as User]) {
    const calls: Promise<unknown>[] = [
      c.createShowcase(db, actor, { name: "x" }),
      c.updateShowcase(db, actor, t.s, { name: "x" }),
      c.trashShowcase(db, actor, t.s),
      c.restoreShowcase(db, actor, t.s),
      c.duplicateShowcase(db, actor, t.s),
      c.createProduct(db, actor, { showcaseId: t.s, name: "x" }),
      c.updateProduct(db, actor, t.p, { name: "x" }),
      c.trashProduct(db, actor, t.p),
      c.restoreProduct(db, actor, t.p),
      c.duplicateProduct(db, actor, t.p),
      c.moveProduct(db, actor, t.p, t.s, 0),
      c.createModule(db, actor, { productId: t.p, title: "x" }),
      c.updateModule(db, actor, t.m, { title: "x" }),
      c.trashModule(db, actor, t.m),
      c.restoreModule(db, actor, t.m),
      c.createLesson(db, actor, { moduleId: t.m, title: "x" }),
      c.updateLesson(db, actor, t.l, { title: "x" }),
      c.trashLesson(db, actor, t.l),
      c.restoreLesson(db, actor, t.l),
      c.reorder(db, actor, "lesson", t.m, [t.l]),
      c.listTrash(db, actor, "product"),
    ];
    for (const call of calls) await expect(call).rejects.toThrow(DENIED);
  }
  expect(await snapshot()).toEqual(before);
});

test("updateLesson: contentHtml sempre gerado dos blocos; blocos inválidos recusados", async () => {
  const t = await tree();
  await c.updateLesson(db, admin, t.l, {
    contentBlocks: { blocks: [{ type: "paragraph", data: { text: '<b>a</b><script>alert(1)</script><img src=x onerror="y">' } }] },
  });
  const [row] = await db.select().from(lessons).where(eq(lessons.id, t.l));
  expect(row.contentHtml).toBe("<p><b>a</b></p>");
  // HTML do cliente não é aceito: o campo nem existe no patch
  await c.updateLesson(db, admin, t.l, { contentHtml: "<script>x</script>" } as never);
  expect((await db.select().from(lessons).where(eq(lessons.id, t.l)))[0].contentHtml).toBe("<p><b>a</b></p>");
  for (const bad of [null, "x", { blocks: "x" }, []])
    await expect(c.updateLesson(db, admin, t.l, { contentBlocks: bad })).rejects.toThrow("Conteúdo inválido.");
});
