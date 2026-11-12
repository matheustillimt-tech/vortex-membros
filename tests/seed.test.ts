import { expect, test, vi } from "vitest";
import { createTestDb } from "./helpers/db";
import { DEMO_CONTENT_VERSION, cleanDemo, seed, syncDemoContent } from "../scripts/seed";
import { eq, sql } from "drizzle-orm";
import {
  platformSettings,
  banners,
  lessonProgress,
  lessons,
  modules,
  productAccess,
  productFirstVisits,
  products,
  scheduleProducts,
  scheduleRules,
  schedules,
  showcases,
  termsAcceptance,
  users,
} from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as content from "@/lib/admin/content";
import * as sch from "@/lib/admin/schedules";
import { loginWithPassword, loginWithToken } from "@/lib/auth/login";
import { getHomeCatalog } from "@/lib/catalog/queries";
import { getPlatformSettings } from "@/lib/settings";

test("seed cria dados navegáveis e é idempotente", async () => {
  const db = await createTestDb();
  const r = await seed(db);
  const r2 = await seed(db);
  const aluno = await loginWithPassword(db, r.studentEmail, "123456");
  expect(aluno).not.toBeNull();
  const home = await getHomeCatalog(db, aluno!);
  expect(home).toHaveLength(2);
  expect(home.every((v) => v.products.length === 3)).toBe(true);
  expect(home.flatMap((v) => v.products).some((p) => p.locked && p.offerUrl)).toBe(true);
  expect(home.flatMap((v) => v.products).some((p) => !p.locked)).toBe(true);
  // A aluna demo já viu as 3 aulas do 1º módulo do 1º produto liberado: 3 de 6 → 50%.
  expect(home.flatMap((v) => v.products).filter((p) => p.progress === 50)).toHaveLength(1);
  // Esse produto é o "Curso de Exemplo", com capa placeholder.
  const manual = home.flatMap((v) => v.products).find((p) => p.name === "Curso de Exemplo");
  expect(manual).toMatchObject({
    thumbnailUrl: expect.stringContaining("placehold.co"),
    locked: false,
    progress: 50,
    lessonsDone: 3,
    lessonsTotal: 6,
  });
  expect(home.flatMap((v) => v.products).some((p) => p.name === "Produto Inexistente")).toBe(false);
  expect(await db.select().from(lessonProgress)).toHaveLength(3);
  expect(await loginWithToken(db, r2.studentToken)).not.toBeNull();
  expect(await loginWithPassword(db, r.adminEmail, "123456")).toMatchObject({ role: "admin" });

  // Rodar duas vezes não duplica
  expect(await db.select().from(users)).toHaveLength(2);
  expect(await db.select().from(showcases)).toHaveLength(2);
  expect(await db.select().from(products)).toHaveLength(6);
  expect(await db.select().from(modules)).toHaveLength(12);
  const ls = await db.select().from(lessons);
  expect(ls).toHaveLength(36);
  expect(ls.every((l) => l.videoUrl?.includes("youtube") && l.contentHtml.includes("Exercício"))).toBe(true);
  const bs = await db.select().from(banners);
  expect(bs).toHaveLength(1);
  expect(bs[0].status).toBe("published");
  // Banner é só a arte; nenhuma imagem de exemplo traz texto renderizado.
  const cfg = bs[0].config;
  expect([cfg.title, cfg.text, cfg.buttonText, cfg.logoUrl, cfg.textShadow].every((v) => v == null)).toBe(true);
  const urls = JSON.stringify({ ls, bs, p: await db.select().from(products), m: await db.select().from(modules) })
    .match(/https:\/\/placehold\.co[^"]*/g) ?? [];
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((u) => !u.includes("text=") && !u.includes("font="))).toBe(true);
  // Tela de login do demo: painel liso, sem imagem de exemplo.
  expect((await getPlatformSettings(db)).loginScreen.imageUrl).toBeNull();
});

test("seed bloqueia banco com alunos reais e não mexe no conteúdo", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "real@x.com", name: "Real", role: "student", passwordHash: "x", loginToken: "t1" });
  await db.insert(showcases).values({ name: "Vitrine real", status: "published" });
  await expect(seed(db)).rejects.toThrow(/Seed bloqueado/);
  expect((await db.select().from(showcases)).map((s) => s.name)).toEqual(["Vitrine real"]);
  expect(await db.select().from(users)).toHaveLength(1);
});

test("SEED_ALLOW_DESTRUCTIVE=1 libera o seed com alunos reais", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "real@x.com", name: "Real", role: "student", passwordHash: "x", loginToken: "t1" });
  vi.stubEnv("SEED_ALLOW_DESTRUCTIVE", "1");
  try {
    await seed(db);
  } finally {
    vi.unstubAllEnvs();
  }
  expect(await db.select().from(showcases)).toHaveLength(2);
  expect(await db.select().from(users)).toHaveLength(3);
});

test("banco vazio continua aceitando o seed", async () => {
  const db = await createTestDb();
  await expect(seed(db)).resolves.toMatchObject({ studentEmail: "aluno@demo.local" });
});

test("randomPasswords gera senhas fortes que funcionam no login", async () => {
  const db = await createTestDb();
  const r = await seed(db, { randomPasswords: true });
  expect(r.adminPassword).not.toBe("123456");
  expect(r.studentPassword).not.toBe("123456");
  expect(r.adminPassword).not.toBe(r.studentPassword);
  expect(r.adminPassword).toHaveLength(16);
  expect(await loginWithPassword(db, r.adminEmail, "123456")).toBeNull();
  expect(await loginWithPassword(db, r.adminEmail, r.adminPassword)).toMatchObject({ role: "admin" });
  expect(await loginWithPassword(db, r.studentEmail, r.studentPassword)).not.toBeNull();
});

test("sem opções o seed mantém 123456 e devolve as senhas", async () => {
  const db = await createTestDb();
  const r = await seed(db);
  expect([r.adminPassword, r.studentPassword]).toEqual(["123456", "123456"]);
});

test("cleanDemo remove só os dados demo e preserva usuários e conteúdo reais", async () => {
  const db = await createTestDb();
  await seed(db);
  const [real] = await db.insert(users).values({ email: "real@x.com", name: "Real", role: "student", passwordHash: "x", loginToken: "t1" }).returning();
  await db.insert(showcases).values({ name: "Vitrine real", status: "published" });
  await cleanDemo(db);
  expect((await db.select().from(users)).map((u) => u.email)).toEqual(["real@x.com"]);
  expect(real.id).toBeDefined();
  expect((await db.select().from(showcases)).map((s) => s.name)).toEqual(["Vitrine real"]);
  expect(await db.select().from(products)).toHaveLength(0);
  expect(await db.select().from(modules)).toHaveLength(0);
  expect(await db.select().from(lessons)).toHaveLength(0);
  expect(await db.select().from(banners)).toHaveLength(0);
});

/** Volta a versão do conteúdo demo (como se o código tivesse subido DEMO_CONTENT_VERSION). */
async function bumpBack(db: Awaited<ReturnType<typeof createTestDb>>, extra: Record<string, unknown> = {}) {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  await db.update(platformSettings).set({ data: { ...row.data, demoContentVersion: 1, ...extra } }).where(eq(platformSettings.id, 1));
}

test("syncDemoContent troca o conteúdo e preserva usuários demo, senhas e tokens", async () => {
  const db = await createTestDb();
  await seed(db, { randomPasswords: true });
  const before = await db.select().from(users);
  // Simula produção com seed antigo: versão velha e conteúdo antigo (os ids demo continuam marcados).
  await bumpBack(db);
  await db.update(products).set({ name: "Antigo", thumbnailUrl: "https://placehold.co/1x1/png" });

  expect(await syncDemoContent(db)).toEqual({ ran: true, reason: "synced" });
  const after = await db.select().from(users);
  expect(after.map((u) => [u.id, u.email, u.passwordHash, u.loginToken]).sort()).toEqual(
    before.map((u) => [u.id, u.email, u.passwordHash, u.loginToken]).sort(),
  );
  const aluno = after.find((u) => u.role === "student")!;
  const home = await getHomeCatalog(db, aluno);
  const manual = home.flatMap((v) => v.products).find((p) => p.name === "Curso de Exemplo");
  expect(manual).toMatchObject({ thumbnailUrl: expect.stringContaining("placehold.co"), locked: false, lessonsDone: 3 });
  expect(await db.select().from(products)).toHaveLength(6);
  const [row] = await db.select().from(platformSettings);
  expect(row.data).toMatchObject({ demoContentVersion: DEMO_CONTENT_VERSION });

  expect(await syncDemoContent(db)).toEqual({ ran: false, reason: "up-to-date" });
});

test("syncDemoContent não faz nada com usuários reais", async () => {
  const db = await createTestDb();
  await seed(db);
  await db.insert(users).values({ email: "real@x.com", name: "Real", role: "student", passwordHash: "x", loginToken: "t1" });
  await db.update(platformSettings).set({ data: { demoContentVersion: 1 } }).where(eq(platformSettings.id, 1));
  await db.update(products).set({ name: "Antigo" });
  expect(await syncDemoContent(db)).toEqual({ ran: false, reason: "real-users" });
  expect((await db.select().from(products)).every((p) => p.name === "Antigo")).toBe(true);
});

/** Conteúdo criado pelo admin demo no painel: vitrine própria e produto/módulo/aula dentro do demo. */
async function panelContent(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [admin] = (await db.select().from(users).where(eq(users.role, "admin"))) as User[];
  const [demoShowcase] = await db.select().from(showcases).where(eq(showcases.name, "Comece por aqui"));
  const [demoProduct] = await db.select().from(products).where(eq(products.name, "Boas-vindas"));
  const [demoModule] = await db.select().from(modules).where(eq(modules.productId, demoProduct.id)).limit(1);
  const own = await content.createShowcase(db, admin, { name: "Minha vitrine" });
  const ownProduct = await content.createProduct(db, admin, { showcaseId: own.id, name: "Meu curso" });
  const ownModule = await content.createModule(db, admin, { productId: ownProduct.id, title: "Meu módulo" });
  const ownLesson = await content.createLesson(db, admin, { moduleId: ownModule.id, title: "Minha aula" });
  // Produto do painel dentro de uma vitrine demo e aula do painel dentro de um módulo demo.
  const inDemoShowcase = await content.createProduct(db, admin, { showcaseId: demoShowcase.id, name: "Curso novo" });
  const inDemoModule = await content.createLesson(db, admin, { moduleId: demoModule.id, title: "Aula extra" });
  const s = await sch.createSchedule(db, admin, { name: "Minha programação", productId: ownProduct.id });
  await sch.setRule(db, admin, { scheduleId: s.id, targetType: "lesson", targetId: ownLesson.id, rule: { mode: "days_after_access", days: 2 } });
  return { admin, demoShowcase, demoProduct, demoModule, own, ownProduct, ownModule, ownLesson, inDemoShowcase, inDemoModule, scheduleId: s.id };
}

test("syncDemoContent preserva o conteúdo criado no painel (e o que está dentro do demo)", async () => {
  const db = await createTestDb();
  await seed(db);
  const p = await panelContent(db);
  // Dependentes do demo nas tabelas novas: programação só de um produto demo, aceite e primeira visita.
  const [aluno] = await db.select().from(users).where(eq(users.role, "student"));
  const [demoPaid] = await db.select().from(products).where(eq(products.name, "Curso Prático"));
  const demoSchedule = await sch.createSchedule(db, p.admin, { name: "Demo", productId: demoPaid.id });
  const [demoPaidModule] = await db.select().from(modules).where(eq(modules.productId, demoPaid.id)).limit(1);
  await sch.setRule(db, p.admin, { scheduleId: demoSchedule.id, targetType: "module", targetId: demoPaidModule.id, rule: { mode: "days_after_access", days: 1 } });
  await db.insert(termsAcceptance).values({ userId: aluno.id, productId: demoPaid.id });
  await db.insert(productFirstVisits).values({ userId: aluno.id, productId: demoPaid.id });
  await db.insert(productAccess).values({ userId: aluno.id, productId: p.ownProduct.id, source: "manual" });

  await bumpBack(db);
  expect(await syncDemoContent(db)).toEqual({ ran: true, reason: "synced" });

  // Painel intacto.
  const names = (await db.select().from(products)).map((x) => x.name);
  expect(names).toEqual(expect.arrayContaining(["Meu curso", "Curso novo"]));
  expect(await db.select().from(showcases).where(eq(showcases.id, p.own.id))).toHaveLength(1);
  expect(await db.select().from(modules).where(eq(modules.id, p.ownModule.id))).toHaveLength(1);
  expect(await db.select().from(lessons).where(eq(lessons.id, p.ownLesson.id))).toHaveLength(1);
  expect(await db.select().from(lessons).where(eq(lessons.id, p.inDemoModule.id))).toHaveLength(1);
  expect(await db.select().from(scheduleRules).where(eq(scheduleRules.scheduleId, p.scheduleId))).toHaveLength(1);
  expect(await db.select().from(productAccess).where(eq(productAccess.productId, p.ownProduct.id))).toHaveLength(1);
  // A vitrine e o módulo demo com algo do painel dentro ficam (a vitrine é reaproveitada, sem duplicar).
  expect(await db.select().from(showcases).where(eq(showcases.name, "Comece por aqui"))).toHaveLength(1);
  expect(await db.select().from(modules).where(eq(modules.id, p.demoModule.id))).toHaveLength(1);
  // O demo foi recriado: 6 produtos novos + "Curso novo" + "Meu curso" + o produto demo que segura a aula do painel.
  expect(names.filter((n) => n === "Curso Prático")).toHaveLength(1);
  expect(await db.select().from(products)).toHaveLength(9);
  // Dependentes do demo apagado não ficam órfãos.
  expect(await db.select().from(schedules).where(eq(schedules.id, demoSchedule.id))).toHaveLength(0);
  expect(await db.select().from(scheduleRules).where(eq(scheduleRules.scheduleId, demoSchedule.id))).toHaveLength(0);
  expect(await db.select().from(scheduleProducts).where(eq(scheduleProducts.productId, demoPaid.id))).toHaveLength(0);
  expect(await db.select().from(termsAcceptance).where(eq(termsAcceptance.productId, demoPaid.id))).toHaveLength(0);
  expect(await db.select().from(productFirstVisits).where(eq(productFirstVisits.productId, demoPaid.id))).toHaveLength(0);

  // Uma segunda troca de versão continua sem tocar no painel.
  await bumpBack(db);
  expect(await syncDemoContent(db)).toEqual({ ran: true, reason: "synced" });
  expect((await db.select().from(products)).map((x) => x.name)).toEqual(expect.arrayContaining(["Meu curso", "Curso novo"]));
  expect(await db.select().from(products)).toHaveLength(9);
});

test("syncDemoContent sem a marca de ids (seed antigo): só apaga o que tem a assinatura do seed", async () => {
  const db = await createTestDb();
  await seed(db);
  const p = await panelContent(db);
  // Banco semeado antes da marca: sem demoContent.
  await db.update(platformSettings).set({ data: sql`${platformSettings.data} - 'demoContent'` }).where(eq(platformSettings.id, 1));
  await bumpBack(db);
  expect(await syncDemoContent(db)).toEqual({ ran: true, reason: "synced" });
  const names = (await db.select().from(products)).map((x) => x.name);
  expect(names).toEqual(expect.arrayContaining(["Meu curso", "Curso novo"]));
  expect(await db.select().from(lessons).where(eq(lessons.id, p.ownLesson.id))).toHaveLength(1);
  expect(await db.select().from(lessons).where(eq(lessons.id, p.inDemoModule.id))).toHaveLength(1);
  expect(await db.select().from(products)).toHaveLength(9);
  expect(await db.select().from(showcases).where(eq(showcases.name, "Comece por aqui"))).toHaveLength(1);
});

test("seed (SEED_DEMO) e cleanDemo também não apagam conteúdo do painel", async () => {
  const db = await createTestDb();
  await seed(db);
  const p = await panelContent(db);
  await seed(db);
  expect(await db.select().from(lessons).where(eq(lessons.id, p.ownLesson.id))).toHaveLength(1);
  await cleanDemo(db);
  expect((await db.select().from(products)).map((x) => x.name).sort()).toEqual(expect.arrayContaining(["Curso novo", "Meu curso"]));
  expect(await db.select().from(lessons).where(eq(lessons.id, p.ownLesson.id))).toHaveLength(1);
});
