import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import {
  fullAccess, lessonProgress, lessonReactions, lessonViews, lessons, modules, productAccess, products, showcases, users,
} from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import {
  clearReportCache, getProductLessonsReport, getProductsReport, getStudentsReport, reportCached,
} from "@/lib/dashboard/reports";
import { listStudents } from "@/lib/students/queries";

const H = 3600_000;
const D = 24 * H;
// 16/10/2026 09:00 em São Paulo (12:00 UTC)
const now = new Date("2026-10-16T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

let db: Database;
let admin: User;
const student = { id: 999, email: "s@x.com", name: "s", role: "student" } as User;
const ids = {} as Record<string, number>;

async function mkUser(key: string, v: { createdAt?: Date; lastAccessAt?: Date | null; deletedAt?: Date | null; role?: "student" | "admin" } = {}) {
  const [u] = await db
    .insert(users)
    .values({ email: `${key}@x.com`, name: key, role: v.role ?? "student", passwordHash: "x", loginToken: `t-${key}`, createdAt: v.createdAt ?? now, lastAccessAt: v.lastAccessAt ?? null, deletedAt: v.deletedAt ?? null })
    .returning();
  ids[key] = u.id;
  return u;
}

beforeAll(async () => {
  db = await createTestDb();
  admin = await mkUser("adm", { role: "admin", lastAccessAt: ago(1 * H), createdAt: new Date("2026-10-01T12:00:00Z") });

  // Faixas de acesso (fronteiras exatas: 7 e 15 dias)
  await mkUser("a1", { lastAccessAt: ago(1 * H), createdAt: new Date("2026-10-01T03:00:00Z") }); // 1º/10 00:00 em SP → outubro
  await mkUser("a2", { lastAccessAt: ago(7 * D), createdAt: new Date("2026-10-01T02:59:00Z") }); // 30/09 23:59 em SP → setembro
  await mkUser("r1", { lastAccessAt: ago(7 * D + 1), createdAt: new Date("2026-09-10T12:00:00Z") });
  await mkUser("r2", { lastAccessAt: ago(15 * D), createdAt: new Date("2025-11-01T03:00:00Z") }); // primeiro mês da janela
  await mkUser("i1", { lastAccessAt: ago(15 * D + 1), createdAt: new Date("2025-11-01T02:59:00Z") }); // fora da janela (31/10/2025)
  await mkUser("i2", { lastAccessAt: ago(90 * D), createdAt: new Date("2026-05-05T12:00:00Z") });
  await mkUser("i3", { lastAccessAt: ago(400 * D), createdAt: new Date("2026-05-06T12:00:00Z") });
  await mkUser("n1", { createdAt: new Date("2026-07-07T12:00:00Z") });
  await mkUser("del", { lastAccessAt: ago(1 * H), deletedAt: ago(1 * D), createdAt: new Date("2026-10-02T12:00:00Z") });

  // Conteúdo: vitrine V (produtos P e Free) e vitrine apagada (produto Gone)
  const [v] = await db.insert(showcases).values({ name: "Vitrine A", status: "published", position: 0 }).returning();
  const [v2] = await db.insert(showcases).values({ name: "Vitrine B", status: "published", position: 1 }).returning();
  const [vGone] = await db.insert(showcases).values({ name: "Apagada", status: "published", deletedAt: now }).returning();
  const [p] = await db.insert(products).values({ showcaseId: v.id, name: "Produto P", status: "published", position: 1 }).returning();
  const [free] = await db.insert(products).values({ showcaseId: v2.id, name: "Grátis", status: "published", isFree: true, position: 0 }).returning();
  const [empty] = await db.insert(products).values({ showcaseId: v.id, name: "Vazio", status: "hidden", position: 0 }).returning();
  await db.insert(products).values({ showcaseId: v.id, name: "Excluído", status: "published", deletedAt: now });
  await db.insert(products).values({ showcaseId: vGone.id, name: "Gone", status: "published" });
  ids.P = p.id;
  ids.Free = free.id;
  ids.Empty = empty.id;

  const [m1] = await db.insert(modules).values({ productId: p.id, title: "Comece aqui", status: "published", position: 0 }).returning();
  const [m2] = await db.insert(modules).values({ productId: p.id, title: "Bônus", status: "published", position: 1 }).returning();
  const [mHidden] = await db.insert(modules).values({ productId: p.id, title: "Oculto", status: "hidden", position: 2 }).returning();
  const [l1] = await db.insert(lessons).values({ moduleId: m1.id, title: "Bem vindo", status: "published", position: 0, thumbnailUrl: "https://x/t.jpg" }).returning();
  const [l2] = await db.insert(lessons).values({ moduleId: m1.id, title: "Segunda", status: "published", position: 1 }).returning();
  const [l3] = await db.insert(lessons).values({ moduleId: m2.id, title: "Extra", status: "published", position: 0 }).returning();
  const [l4] = await db.insert(lessons).values({ moduleId: m2.id, title: "Rascunho", status: "hidden", position: 1 }).returning();
  const [l5] = await db.insert(lessons).values({ moduleId: mHidden.id, title: "Escondida", status: "published", position: 0 }).returning();
  const [fl] = await db.insert(modules).values({ productId: free.id, title: "M", status: "published" }).returning();
  const [fl1] = await db.insert(lessons).values({ moduleId: fl.id, title: "F1", status: "published" }).returning();
  Object.assign(ids, { l1: l1.id, l2: l2.id, l3: l3.id, l4: l4.id, l5: l5.id, fl1: fl1.id });

  // Acessos a P: a1 (venda ativa), a2 (manual vencido), r1 (revogado), i2 (full_access ativo), i3 (acesso futuro),
  // del (excluído), adm (admin). Com acesso = a1, i2 (e r2 via full_access + produto, sem contar duas vezes).
  await db.insert(productAccess).values([
    { userId: ids.a1, productId: p.id, source: "sale", saleRef: "o1", startsAt: ago(30 * D) },
    { userId: ids.a2, productId: p.id, source: "manual", startsAt: ago(30 * D), expiresAt: ago(1 * D) },
    { userId: ids.r1, productId: p.id, source: "sale", saleRef: "o2", startsAt: ago(30 * D), revokedAt: ago(1 * D) },
    { userId: ids.i3, productId: p.id, source: "sale", saleRef: "o3", startsAt: new Date(now.getTime() + D) },
    { userId: ids.r2, productId: p.id, source: "sale", saleRef: "o4", startsAt: ago(30 * D) },
    { userId: ids.del, productId: p.id, source: "sale", saleRef: "o5", startsAt: ago(30 * D) },
    { userId: ids.adm, productId: p.id, source: "manual", startsAt: ago(30 * D) },
  ]);
  await db.insert(fullAccess).values([
    { userId: ids.i2, source: "manual", startsAt: ago(30 * D) },
    { userId: ids.r2, source: "manual", startsAt: ago(30 * D) },
    { userId: ids.n1, source: "manual", startsAt: ago(30 * D), revokedAt: ago(D) },
  ]);

  // Progresso em P: a1 fez l1,l2,l3 (3/3); i2 fez l1 (1/3); a2 fez l1 e a aula oculta l4 (não conta).
  // del e adm não contam. r1 fez l5 (módulo oculto: não conta).
  await db.insert(lessonProgress).values([
    { userId: ids.a1, lessonId: l1.id }, { userId: ids.a1, lessonId: l2.id }, { userId: ids.a1, lessonId: l3.id },
    { userId: ids.i2, lessonId: l1.id },
    { userId: ids.a2, lessonId: l1.id }, { userId: ids.a2, lessonId: l4.id },
    { userId: ids.del, lessonId: l1.id }, { userId: ids.adm, lessonId: l1.id },
    { userId: ids.r1, lessonId: l5.id },
    { userId: ids.n1, lessonId: fl1.id },
  ]);
  // Visualizações (lesson_views): n1 só abriu (sem concluir); del, adm e a aula oculta não contam.
  await db.insert(lessonViews).values([
    { userId: ids.a1, lessonId: l1.id, views: 4 }, { userId: ids.a1, lessonId: l2.id, views: 2 },
    { userId: ids.i2, lessonId: l1.id, views: 1 }, { userId: ids.n1, lessonId: l2.id, views: 3 },
    { userId: ids.del, lessonId: l1.id, views: 10 }, { userId: ids.adm, lessonId: l1.id, views: 5 },
    { userId: ids.a2, lessonId: l4.id, views: 7 },
  ]);
  await db.insert(lessonReactions).values([
    { userId: ids.a1, lessonId: l1.id, value: 1 }, { userId: ids.i2, lessonId: l1.id, value: 1 },
    { userId: ids.a2, lessonId: l1.id, value: -1 }, { userId: ids.a1, lessonId: l3.id, value: 1 },
    { userId: ids.del, lessonId: l1.id, value: -1 }, { userId: ids.adm, lessonId: l3.id, value: -1 },
  ]);
});

beforeEach(() => clearReportCache());

test("alunos: faixas de acesso com fronteiras de 7 e 15 dias, sem excluídos e admins", async () => {
  const r = await getStudentsReport(db, admin, now);
  expect(r.total).toBe(8);
  expect(r.buckets).toEqual([
    { key: "active-7d", count: 2 },
    { key: "inactive-7-15d", count: 2 },
    { key: "inactive-15d", count: 3 },
    { key: "never-accessed", count: 1 },
  ]);
});

test("alunos: cada faixa bate com o filtro `access` da lista de alunos", async () => {
  const r = await getStudentsReport(db, admin, now);
  for (const b of r.buckets) {
    const page = await listStudents(db, admin, { access: b.key, sort: "latest", trashed: false, now });
    expect(page.total, b.key).toBe(b.count);
  }
});

test("alunos: novos cadastros dos últimos 12 meses por mês em São Paulo", async () => {
  const r = await getStudentsReport(db, admin, now);
  expect(r.signups.map((m) => m.label)).toEqual(["nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out"]);
  expect(r.signups.map((m) => m.month)).toEqual([
    "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
  ]);
  expect(Object.fromEntries(r.signups.filter((m) => m.count).map((m) => [m.month, m.count]))).toEqual({
    "2025-11": 1, // r2 (i1 caiu em 31/10/2025, fora)
    "2026-05": 2,
    "2026-07": 1,
    "2026-09": 2, // r1 e a2 (30/09 23:59 em SP)
    "2026-10": 1, // a1 (adm e del não contam)
  });
  expect(r.signupsTotal).toBe(7);
});

test("produtos: com progresso / acesso, progresso médio, aulas; vitrines e grátis", async () => {
  const r = await getProductsReport(db, admin, now);
  expect(r.showcases).toEqual([
    { id: expect.any(Number), name: "Vitrine A" },
    { id: expect.any(Number), name: "Vitrine B" },
  ]);
  expect(r.rows.map((x) => x.name)).toEqual(["Vazio", "Produto P", "Grátis"]);
  const p = r.rows.find((x) => x.id === ids.P)!;
  // com progresso: a1, i2, a2 (a2 sem acesso conta: tem progresso). Com acesso: a1, r2, i2.
  // concluídas: a1 3 + i2 1 + a2 1 = 5 de 3 alunos × 3 aulas = 55,6% → 56
  expect(p).toMatchObject({ showcaseName: "Vitrine A", withProgress: 3, withAccess: 3, progress: 56, lessons: 3 });
  // grátis: todos os 8 alunos têm acesso; n1 fez a única aula
  expect(r.rows.find((x) => x.id === ids.Free)).toMatchObject({ showcaseName: "Vitrine B", withProgress: 1, withAccess: 8, progress: 100, lessons: 1 });
  expect(r.rows.find((x) => x.id === ids.Empty)).toMatchObject({ withProgress: 0, withAccess: 2, progress: 0, lessons: 0 });
});

test("aulas do produto: KPIs, módulos e aulas com visualizações e reações", async () => {
  const r = (await getProductLessonsReport(db, admin, ids.P, now))!;
  expect(r.product).toEqual({ id: ids.P, name: "Produto P" });
  expect(r).toMatchObject({ withProgress: 3, withAccess: 3, views: 10, completed: 5, likes: 3, dislikes: 1 });
  expect(r.avgProgress).toBeCloseTo(55.56, 1);
  expect(r.modules).toEqual([
    {
      id: expect.any(Number),
      title: "Comece aqui",
      lessons: [
        { id: ids.l1, title: "Bem vindo", thumbnailUrl: "https://x/t.jpg", views: 5, likes: 2, dislikes: 1 },
        { id: ids.l2, title: "Segunda", thumbnailUrl: null, views: 5, likes: 0, dislikes: 0 },
      ],
    },
    { id: expect.any(Number), title: "Bônus", lessons: [{ id: ids.l3, title: "Extra", thumbnailUrl: null, views: 0, likes: 1, dislikes: 0 }] },
  ]);
  expect(await getProductLessonsReport(db, admin, 123456789, now)).toBeNull();
});

test("só admin", async () => {
  await expect(getStudentsReport(db, student, now)).rejects.toThrow();
  await expect(getProductsReport(db, null, now)).rejects.toThrow();
  await expect(getProductLessonsReport(db, student, ids.P, now)).rejects.toThrow();
  await expect(reportCached(student, "x", async () => 1)).rejects.toThrow();
});

test("cache de 5 minutos por chave, sempre exigindo admin", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(now);
    const loader = vi.fn(async () => ({ n: loader.mock.calls.length }));
    expect(await reportCached(admin, "k", loader)).toEqual({ n: 1 });
    vi.setSystemTime(new Date(now.getTime() + 4 * 60_000));
    expect(await reportCached(admin, "k", loader)).toEqual({ n: 1 });
    expect(await reportCached(admin, "outra", loader)).toEqual({ n: 2 });
    vi.setSystemTime(new Date(now.getTime() + 5 * 60_000 + 1));
    expect(await reportCached(admin, "k", loader)).toEqual({ n: 3 });
    // erro não fica em cache
    const failing = vi.fn(async () => {
      throw new Error("x");
    });
    await expect(reportCached(admin, "f", failing)).rejects.toThrow();
    await expect(reportCached(admin, "f", failing)).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
