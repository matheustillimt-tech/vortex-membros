import { beforeAll, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import { lessonProgress, lessons, modules, productAccess, products, showcases, users } from "@/db/schema";
import type { Database } from "@/db";
import type { User } from "@/lib/auth/sessions";
import { getFirstLessonIdOfModule, getHomeCatalog, getLessonPage, getProductPage } from "@/lib/catalog/queries";

let db: Database;
let aluno: User;
let admin: User;
const ids: Record<string, number> = {};

beforeAll(async () => {
  db = await createTestDb();
  [aluno] = await db.insert(users).values({ email: "a+b@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t1" }).returning();
  [admin] = await db.insert(users).values({ email: "ad@x.com", name: "Ad", role: "admin", passwordHash: "x", loginToken: "t2" }).returning();
  const sc = async (name: string, position: number, status: "published" | "unlisted", deletedAt?: Date) =>
    (await db.insert(showcases).values({ name, position, status, deletedAt }).returning())[0].id;
  ids.sc2 = await sc("Segunda", 2, "published");
  ids.sc1 = await sc("Primeira", 1, "published");
  ids.scUnl = await sc("Oculta", 3, "unlisted");
  ids.scDel = await sc("Excluída", 4, "published", new Date());

  const pr = async (v: Partial<typeof products.$inferInsert> & { name: string }) =>
    (await db.insert(products).values({ showcaseId: ids.sc1, status: "published", ...v }).returning())[0].id;
  ids.pOk = await pr({ name: "Liberado", position: 2 });
  ids.pLocked = await pr({ name: "Bloqueado", position: 1, offerUrl: "https://pay.x/abc" });
  ids.pHidden = await pr({ name: "Hidden", status: "hidden" });
  ids.pDel = await pr({ name: "Del", deletedAt: new Date() });
  ids.pExpired = await pr({ name: "Expirado", position: 3, showcaseId: ids.sc2, offerUrl: "https://pay.x/exp" });
  await db.update(products).set({ settings: { lesson: { nextProductId: ids.pLocked } } }).where(
    (await import("drizzle-orm")).eq(products.id, ids.pOk));

  await db.insert(productAccess).values([
    { userId: aluno.id, productId: ids.pOk, source: "manual" },
    { userId: aluno.id, productId: ids.pExpired, source: "manual", startsAt: new Date("2020-01-01Z"), expiresAt: new Date("2021-01-01Z") },
  ]);

  const mod = async (productId: number, title: string, position: number, status: "published" | "hidden" = "published") =>
    (await db.insert(modules).values({ productId, title, position, status }).returning())[0].id;
  ids.m1 = await mod(ids.pOk, "M1", 1);
  ids.m2 = await mod(ids.pOk, "M2", 2);
  ids.mHid = await mod(ids.pOk, "MH", 3, "hidden");
  ids.mExp = await mod(ids.pExpired, "ME", 1);
  ids.mHidProd = await mod(ids.pHidden, "MP", 1);

  const les = async (moduleId: number, title: string, position: number, status: "published" | "hidden" = "published") =>
    (await db.insert(lessons).values({ moduleId, title, position, status, contentHtml: "<p>segredo</p>" }).returning())[0].id;
  ids.l2 = await les(ids.m1, "L2", 2);
  ids.l1 = await les(ids.m1, "L1", 1);
  ids.lHidInM1 = await les(ids.m1, "L0 oculta", 0, "hidden");
  ids.l3 = await les(ids.m2, "L3", 1);
  ids.lHid = await les(ids.mHid, "LH", 1);
  ids.lExp = await les(ids.mExp, "LE", 1);
  ids.lHidProd = await les(ids.mHidProd, "LP", 1);
  ids.lHiddenOwn = await les(ids.m2, "LO", 2, "hidden");

  await db.insert(lessonProgress).values({ userId: aluno.id, lessonId: ids.l1 });
});

test("home: só publicados, em ordem, com bloqueio", async () => {
  const home = await getHomeCatalog(db, aluno);
  expect(home.map((s) => s.name)).toEqual(["Primeira", "Segunda"]);
  expect(home[0].products.map((p) => p.name)).toEqual(["Bloqueado", "Liberado"]);
  expect(home[0].products[0]).toMatchObject({ locked: true, offerUrl: "https://pay.x/abc?email=a%2Bb%40x.com" });
  expect(home[0].products[1]).toMatchObject({ locked: false });
  expect(home[1].products[0]).toMatchObject({ name: "Expirado", locked: true });
});

test("home: progresso por produto (aulas visíveis vistas / total), null se bloqueado ou sem aulas", async () => {
  const home = await getHomeCatalog(db, aluno);
  const byName = new Map(home.flatMap((s) => s.products).map((p) => [p.name, p.progress]));
  // Aluno vê L1, L2, L3 (ocultas e módulo oculto ficam de fora) e viu L1 → 33%.
  expect(byName.get("Liberado")).toBe(33);
  expect(byName.get("Bloqueado")).toBeNull();
  expect(byName.get("Expirado")).toBeNull();
  const adm = await getHomeCatalog(db, admin);
  const admByName = new Map(adm.flatMap((s) => s.products).map((p) => [p.name, p.progress]));
  expect(admByName.get("Liberado")).toBe(0); // admin enxerga as 6 aulas e não viu nenhuma
  expect(admByName.get("Bloqueado")).toBeNull(); // liberado para admin, mas sem aulas
});

test("home: contagem de aulas vistas/total para o título do trilho; zero quando bloqueado", async () => {
  const home = await getHomeCatalog(db, aluno);
  const byName = new Map(home.flatMap((s) => s.products).map((p) => [p.name, p]));
  expect(byName.get("Liberado")).toMatchObject({ lessonsDone: 1, lessonsTotal: 3 });
  expect(byName.get("Bloqueado")).toMatchObject({ lessonsDone: 0, lessonsTotal: 0 });
  expect(byName.get("Expirado")).toMatchObject({ lessonsDone: 0, lessonsTotal: 0, progress: null });
  const adm = await getHomeCatalog(db, admin);
  expect(adm.flatMap((s) => s.products).find((p) => p.name === "Liberado")).toMatchObject({ lessonsDone: 0, lessonsTotal: 6 });
});


test("getProductPage: módulos/aulas ocultos só para admin, completed e locked", async () => {
  const page = await getProductPage(db, aluno, ids.pOk);
  expect(page?.locked).toBe(false);
  expect(page?.modules.map((m) => m.title)).toEqual(["M1", "M2"]);
  expect(page?.modules[0].lessons).toEqual([
    { id: ids.l1, title: "L1", thumbnailUrl: null, completed: true, lockedUntil: null },
    { id: ids.l2, title: "L2", thumbnailUrl: null, completed: false, lockedUntil: null },
  ]);
  const adm = await getProductPage(db, admin, ids.pOk);
  expect(adm?.modules.map((m) => m.title)).toEqual(["M1", "M2", "MH"]);
  expect(adm?.modules[0].lessons).toHaveLength(3);
  expect((await getProductPage(db, aluno, ids.pExpired))?.locked).toBe(true);
  expect(await getProductPage(db, aluno, ids.pHidden)).toBeNull();
  expect(await getProductPage(db, admin, ids.pHidden)).not.toBeNull();
  expect(await getProductPage(db, aluno, ids.pDel)).toBeNull();
  expect(await getProductPage(db, admin, ids.pDel)).toBeNull();
});

test("aula de produto expirado pelo link direto → locked, sem conteúdo", async () => {
  const r = await getLessonPage(db, aluno, ids.lExp);
  expect(r).toEqual({ status: "locked", productId: ids.pExpired, offerUrl: "https://pay.x/exp?email=a%2Bb%40x.com" });
  expect(JSON.stringify(r)).not.toContain("segredo");
});

test("aula despublicada ou de produto oculto → not_found para aluno, ok para admin", async () => {
  for (const id of [ids.lHid, ids.lHidProd, ids.lHiddenOwn, 99999]) {
    expect((await getLessonPage(db, aluno, id)).status).toBe("not_found");
  }
  expect((await getLessonPage(db, admin, ids.lHid)).status).toBe("ok");
  expect((await getLessonPage(db, admin, ids.lHidProd)).status).toBe("ok");
});

test("anterior/próximo atravessam módulos; nextProduct", async () => {
  const first = await getLessonPage(db, aluno, ids.l1);
  expect(first).toMatchObject({ status: "ok", prevLessonId: null, nextLessonId: ids.l2 });
  const last1 = await getLessonPage(db, aluno, ids.l2);
  expect(last1).toMatchObject({ prevLessonId: ids.l1, nextLessonId: ids.l3 });
  const end = await getLessonPage(db, aluno, ids.l3);
  expect(end).toMatchObject({ prevLessonId: ids.l2, nextLessonId: null, nextProduct: { id: ids.pLocked, name: "Bloqueado" } });
  expect(await getLessonPage(db, admin, ids.lExp)).toMatchObject({ status: "ok", nextProduct: null });
});

test("getFirstLessonIdOfModule ignora aulas ocultas", async () => {
  expect(await getFirstLessonIdOfModule(db, aluno, ids.m1)).toBe(ids.l1);
  expect(await getFirstLessonIdOfModule(db, admin, ids.m1)).toBe(ids.lHidInM1);
  expect(await getFirstLessonIdOfModule(db, aluno, ids.mHid)).toBeNull();
  expect(await getFirstLessonIdOfModule(db, aluno, ids.mExp)).toBeNull();
});
