/**
 * Dados de demonstração (conteúdo genérico, só placeholders).
 *
 *   npm run seed     -> usa getDb() com DATABASE_URL do .env.local
 *   npm run db:dev   -> cria/migra o PGlite em ./.data/dev e roda este seed
 *
 * Idempotente: apaga o conteúdo DEMO (ver demoContentIds) e os dois usuários demo antes de recriar.
 * Conteúdo criado no painel nunca é apagado. Mesmo assim se recusa a rodar se o banco tiver qualquer
 * usuário além dos dois demo (ex.: produção com alunos reais), a menos que SEED_ALLOW_DESTRUCTIVE=1.
 */
import { randomInt } from "node:crypto";
import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "@/db";
import {
  banners,
  lessonProgress,
  lessonReactions,
  lessons,
  modules,
  platformSettings,
  productAccess,
  productFirstVisits,
  products,
  scheduleProducts,
  scheduleRules,
  schedules,
  sessions,
  showcases,
  termsAcceptance,
  users,
  type BannerConfig,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { generateLoginToken } from "@/lib/auth/tokens";

export const DEMO_PASSWORD = "123456";
export const ADMIN_EMAIL = "admin@demo.local";
export const STUDENT_EMAIL = "aluno@demo.local";
const BANNER_NAME = "Boas-vindas";

export type SeedOptions = { randomPasswords?: boolean };
export type SeedResult = {
  adminEmail: string;
  studentEmail: string;
  studentToken: string;
  adminPassword: string;
  studentPassword: string;
};

// Sem caracteres ambíguos (I, l, O, 0, 1).
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ" + "abcdefghijkmnopqrstuvwxyz" + "23456789";
function randomPassword(length = 16): string {
  return Array.from({ length }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("");
}

/**
 * Capa gerada (placehold.co), nunca imagem real: bloco de cor liso, sem texto
 * (cor do texto = cor do fundo e sem ?text=), para nenhuma fonte de terceiros aparecer na área.
 */
function cover(w: number, h: number, bg: string): string {
  return `https://placehold.co/${w}x${h}/${bg}/${bg}/png`;
}

// Vídeos públicos do YouTube só para exemplo.
const SAMPLE_VIDEOS = [
  "https://www.youtube.com/watch?v=aircAruvnKk",
  "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
];

/** Produto de exemplo ao qual o aluno demo já tem acesso (com progresso preenchido). */
export const SAMPLE_PRODUCT_NAME = "Curso de Exemplo";

type ProductSeed = { name: string; kind: "free" | "access" | "locked"; color: string; thumbnailUrl?: string };
export const SHOWCASES: { name: string; products: ProductSeed[] }[] = [
  {
    name: "Comece por aqui",
    products: [
      { name: "Boas-vindas", kind: "free", color: "1b1b2f" },
      { name: SAMPLE_PRODUCT_NAME, kind: "access", color: "2a0f3d" },
      { name: "Curso Avançado", kind: "locked", color: "3d0f1f" },
    ],
  },
  {
    name: "Continue aprendendo",
    products: [
      { name: "Aula Bônus", kind: "free", color: "0f2a3d" },
      { name: "Curso Prático", kind: "access", color: "0f3d2a" },
      { name: "Mentoria", kind: "locked", color: "3d2a0f" },
    ],
  },
];

const LESSON_TITLES = ["Primeiros passos", "Na prática", "Próximos passos"].map((t, i) => `Aula ${i + 1}: ${t}`);
const MODULE_TITLES = ["Módulo 1", "Módulo 2"];

function lessonHtml(product: string, lesson: string): string {
  return [
    `<p>Nesta aula de <strong>${product}</strong> você vai colocar em prática: ${lesson.toLowerCase()}.</p>`,
    `<p>Assista ao vídeo e depois faça o exercício abaixo.</p>`,
    `<h3>Exercício</h3>`,
    `<pre><code>Escreva em poucas linhas o que você aprendeu em "${lesson}" e como vai aplicar em ${product}.</code></pre>`,
  ].join("\n");
}

async function clear(db: Database): Promise<void> {
  const demo = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, [ADMIN_EMAIL, STUDENT_EMAIL]));
  const ids = demo.map((u) => u.id);
  if (ids.length) {
    await db.delete(sessions).where(inArray(sessions.userId, ids));
    await db.delete(productAccess).where(inArray(productAccess.userId, ids));
    await db.delete(lessonProgress).where(inArray(lessonProgress.userId, ids));
    await db.delete(lessonReactions).where(inArray(lessonReactions.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await deleteDemoContent(db, await demoContentIds(db));
}

/** Ids do conteúdo criado pelo seed (gravados em platform_settings.data.demoContent). */
export type DemoContentIds = { showcases: number[]; products: number[]; modules: number[]; lessons: number[]; banners: number[] };
const DEMO_KEYS = ["showcases", "products", "modules", "lessons", "banners"] as const;

function parseDemoIds(raw: unknown): DemoContentIds | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const out = {} as DemoContentIds;
  for (const k of DEMO_KEYS) {
    const v = r[k];
    if (!Array.isArray(v) || !v.every((x) => Number.isSafeInteger(x))) return null;
    out[k] = v as number[];
  }
  return out;
}

/**
 * O que é conteúdo demo: os ids que o seed gravou ao criar (`demoContent`). Bancos semeados antes
 * dessa marca: só o que tem a assinatura exata do seed (vitrine com nome do seed › produto com nome do
 * seed › "Módulo N" › aula com título do seed; banner "Boas-vindas"). O resto é do painel e fica.
 */
export async function demoContentIds(db: Database): Promise<DemoContentIds> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  const stored = parseDemoIds(row?.data?.demoContent);
  if (stored) return stored;
  const sc = (
    await db.select({ id: showcases.id }).from(showcases).where(inArray(showcases.name, SHOWCASES.map((x) => x.name)))
  ).map((r) => r.id);
  const pr = sc.length
    ? (
        await db
          .select({ id: products.id })
          .from(products)
          .where(and(inArray(products.showcaseId, sc), inArray(products.name, SHOWCASES.flatMap((x) => x.products.map((p) => p.name)))))
      ).map((r) => r.id)
    : [];
  const mo = pr.length
    ? (await db.select({ id: modules.id }).from(modules).where(and(inArray(modules.productId, pr), inArray(modules.title, MODULE_TITLES)))).map((r) => r.id)
    : [];
  const le = mo.length
    ? (await db.select({ id: lessons.id }).from(lessons).where(and(inArray(lessons.moduleId, mo), inArray(lessons.title, LESSON_TITLES)))).map((r) => r.id)
    : [];
  const bn = (await db.select({ id: banners.id }).from(banners).where(eq(banners.name, BANNER_NAME))).map((r) => r.id);
  return { showcases: sc, products: pr, modules: mo, lessons: le, banners: bn };
}

/**
 * Apaga só o conteúdo demo (`ids`) e as linhas que dependem dele: progresso, reações, acessos, aceites
 * de termo, primeiras visitas, regras e vínculos de programação (e a programação que ficar sem
 * produto). Um módulo/produto/vitrine demo que tenha algo do painel dentro (aula, módulo, produto ou
 * subvitrine) fica, com o que é do painel. Mídia não é tocada: o demo não usa /media (capas são
 * placehold.co), e um upload pode estar em uso em conteúdo do painel.
 * Devolve os ids demo que ficaram (por terem algo do painel dentro).
 */
export async function deleteDemoContent(db: Database, ids: DemoContentIds): Promise<DemoContentIds> {
  const without = (all: number[], keep: Set<number>) => all.filter((id) => !keep.has(id));
  const lessonIds = ids.lessons;
  if (lessonIds.length) {
    await db.delete(lessonProgress).where(inArray(lessonProgress.lessonId, lessonIds));
    await db.delete(lessonReactions).where(inArray(lessonReactions.lessonId, lessonIds));
    await db.delete(scheduleRules).where(and(eq(scheduleRules.targetType, "lesson"), inArray(scheduleRules.targetId, lessonIds)));
    await db.delete(lessons).where(inArray(lessons.id, lessonIds));
  }

  const busyModules = ids.modules.length
    ? new Set((await db.select({ id: lessons.moduleId }).from(lessons).where(inArray(lessons.moduleId, ids.modules))).map((r) => r.id))
    : new Set<number>();
  const moduleIds = without(ids.modules, busyModules);
  if (moduleIds.length) {
    await db.delete(scheduleRules).where(and(eq(scheduleRules.targetType, "module"), inArray(scheduleRules.targetId, moduleIds)));
    await db.delete(modules).where(inArray(modules.id, moduleIds));
  }

  const busyProducts = ids.products.length
    ? new Set((await db.select({ id: modules.productId }).from(modules).where(inArray(modules.productId, ids.products))).map((r) => r.id))
    : new Set<number>();
  const productIds = without(ids.products, busyProducts);
  if (productIds.length) {
    await db.delete(productAccess).where(inArray(productAccess.productId, productIds));
    await db.delete(termsAcceptance).where(inArray(termsAcceptance.productId, productIds));
    await db.delete(productFirstVisits).where(inArray(productFirstVisits.productId, productIds));
    const linked = (
      await db.select({ id: scheduleProducts.scheduleId }).from(scheduleProducts).where(inArray(scheduleProducts.productId, productIds))
    ).map((r) => r.id);
    await db.delete(scheduleProducts).where(inArray(scheduleProducts.productId, productIds));
    if (linked.length) {
      const stillUsed = new Set(
        (await db.select({ id: scheduleProducts.scheduleId }).from(scheduleProducts).where(inArray(scheduleProducts.scheduleId, linked))).map((r) => r.id),
      );
      const orphan = without([...new Set(linked)], stillUsed);
      if (orphan.length) {
        await db.delete(scheduleRules).where(inArray(scheduleRules.scheduleId, orphan));
        await db.delete(schedules).where(inArray(schedules.id, orphan));
      }
    }
    await db.delete(products).where(inArray(products.id, productIds));
  }

  const busyShowcases = new Set<number>();
  if (ids.showcases.length) {
    for (const r of await db.select({ id: products.showcaseId }).from(products).where(inArray(products.showcaseId, ids.showcases))) busyShowcases.add(r.id);
    for (const r of await db.select({ id: showcases.parentId }).from(showcases).where(inArray(showcases.parentId, ids.showcases))) {
      if (r.id !== null) busyShowcases.add(r.id);
    }
  }
  const showcaseIds = without(ids.showcases, busyShowcases);
  if (showcaseIds.length) await db.delete(showcases).where(inArray(showcases.id, showcaseIds));
  if (ids.banners.length) await db.delete(banners).where(inArray(banners.id, ids.banners));

  return {
    showcases: ids.showcases.filter((id) => busyShowcases.has(id)),
    products: ids.products.filter((id) => busyProducts.has(id)),
    modules: ids.modules.filter((id) => busyModules.has(id)),
    lessons: [],
    banners: [],
  };
}

/** Banco com usuários reais: apagar o conteúdo deixaria acessos e progresso apontando para nada. */
async function assertSafeToSeed(db: Database): Promise<void> {
  if (process.env.SEED_ALLOW_DESTRUCTIVE === "1") return;
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(notInArray(users.email, [ADMIN_EMAIL, STUDENT_EMAIL]));
  if (n > 0) {
    throw new Error(
      `Seed bloqueado: o banco já tem ${n} usuário(s) real(is) e o seed apaga todo o conteúdo ` +
        "(vitrines, produtos, módulos, aulas e banners). Use SEED_ALLOW_DESTRUCTIVE=1 se tiver certeza.",
    );
  }
}

export const DEMO_CONTENT_VERSION = 2;

/**
 * Cria vitrines, produtos, módulos, aulas, acessos, progresso demo e banner (usado por seed e
 * syncDemoContent) e grava os ids criados em platform_settings.data.demoContent (com `kept`: ids demo
 * que ficaram por terem conteúdo do painel dentro; vitrines que ficaram são reaproveitadas pelo nome).
 */
async function createDemoContent(db: Database, studentId: number, kept?: DemoContentIds): Promise<void> {
  const created: DemoContentIds = { showcases: [], products: [], modules: [], lessons: [], banners: [] };
  const keptShowcases = new Map<string, number>();
  if (kept?.showcases.length) {
    for (const r of await db.select({ id: showcases.id, name: showcases.name }).from(showcases).where(inArray(showcases.id, kept.showcases))) {
      keptShowcases.set(r.name, r.id);
    }
  }
  let firstAccessProductId: number | null = null;
  for (const [si, sc] of SHOWCASES.entries()) {
    const reuse = keptShowcases.get(sc.name);
    const [showcase] =
      reuse !== undefined
        ? [{ id: reuse }]
        : await db.insert(showcases).values({ name: sc.name, position: si, status: "published" }).returning();
    created.showcases.push(showcase.id);
    for (const [pi, ps] of sc.products.entries()) {
      const slug = ps.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-");
      const [product] = await db
        .insert(products)
        .values({
          showcaseId: showcase.id,
          name: ps.name,
          thumbnailUrl: ps.thumbnailUrl ?? cover(400, 700, ps.color),
          status: "published",
          isFree: ps.kind === "free",
          offerUrl: ps.kind === "locked" ? `https://example.com/checkout/${slug}` : null,
          position: pi,
        })
        .returning();
      created.products.push(product.id);
      if (ps.kind === "access") {
        firstAccessProductId ??= product.id;
        await db.insert(productAccess).values({ userId: studentId, productId: product.id, source: "manual" });
      }
      for (let mi = 0; mi < MODULE_TITLES.length; mi++) {
        const [mod] = await db
          .insert(modules)
          .values({
            productId: product.id,
            title: MODULE_TITLES[mi],
            coverUrl: cover(400, 700, ps.color),
            position: mi,
            status: "published",
          })
          .returning();
        created.modules.push(mod.id);
        const inserted = await db.insert(lessons).values(
          LESSON_TITLES.map((title, li) => {
            return {
              moduleId: mod.id,
              title,
              videoUrl: SAMPLE_VIDEOS[li],
              contentHtml: lessonHtml(ps.name, title),
              thumbnailUrl: cover(640, 360, ps.color),
              position: li,
              status: "published" as const,
            };
          }),
        ).returning({ id: lessons.id });
        created.lessons.push(...inserted.map((l) => l.id));
        // Demo: a aluna já viu as aulas do 1º módulo do 1º produto liberado (trilhos de progresso preenchidos).
        if (product.id === firstAccessProductId && mi === 0) {
          await db.insert(lessonProgress).values(inserted.map((l) => ({ userId: studentId, lessonId: l.id })));
        }
      }
    }
  }

  // O banner é só a arte (o texto já vem na imagem): sem título, texto, botão ou logo.
  const config: BannerConfig = {
    action: firstAccessProductId ? { type: "product", productId: firstAccessProductId } : { type: "none" },
    desktopImageUrl: cover(1920, 1080, "16121f"),
    mobileImageUrl: cover(600, 1050, "16121f"),
  };
  const [banner] = await db.insert(banners).values({ name: BANNER_NAME, position: 0, status: "published", config }).returning({ id: banners.id });
  created.banners.push(banner.id);
  const all = Object.fromEntries(DEMO_KEYS.map((k) => [k, [...new Set([...created[k], ...(kept?.[k] ?? [])])]])) as DemoContentIds;
  await mergeSettings(db, { demoContent: all });
}

/** Mescla chaves em platformSettings.data (cria a linha 1 se faltar), sem sobrescrever as outras. */
async function mergeSettings(db: Database, patch: Record<string, unknown>): Promise<void> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  if (!row) {
    await db.insert(platformSettings).values({ id: 1, data: patch });
    return;
  }
  await db.update(platformSettings).set({ data: { ...row.data, ...patch } }).where(eq(platformSettings.id, 1));
}

export async function seed(db: Database, options: SeedOptions = {}): Promise<SeedResult> {
  await assertSafeToSeed(db);
  await clear(db);

  const adminPassword = options.randomPasswords ? randomPassword() : DEMO_PASSWORD;
  const studentPassword = options.randomPasswords ? randomPassword() : DEMO_PASSWORD;
  const [adminHash, studentHash] = await Promise.all([hashPassword(adminPassword), hashPassword(studentPassword)]);
  const studentToken = generateLoginToken();
  const [student] = await db
    .insert(users)
    .values([
      { email: ADMIN_EMAIL, name: "Admin Demo", passwordHash: adminHash, loginToken: generateLoginToken(), role: "admin" as const, adminRole: "root" as const },
      { email: STUDENT_EMAIL, name: "Aluna Demo", passwordHash: studentHash, loginToken: studentToken, role: "student" as const },
    ])
    .returning()
    .then((rows) => rows.filter((u) => u.role === "student"));

  // Só cria configurações se ainda não existirem (não sobrescreve as reais).
  // Tela de login sem imagem de exemplo: o demo mostra o painel liso (#180f0c), sem arte com texto.
  await db
    .insert(platformSettings)
    .values({ id: 1, data: { siteName: "Escola Demo", loginScreen: { imageUrl: null } } })
    .onConflictDoNothing();

  await createDemoContent(db, student.id);
  await mergeSettings(db, { demoContentVersion: DEMO_CONTENT_VERSION });

  return { adminEmail: ADMIN_EMAIL, studentEmail: STUDENT_EMAIL, studentToken, adminPassword, studentPassword };
}

export function printSeedResult(r: SeedResult): void {
  console.log("Seed concluído.");
  console.log(`  admin: ${r.adminEmail} / ${r.adminPassword}`);
  console.log(`  aluno: ${r.studentEmail} / ${r.studentPassword}`);
  if (r.adminPassword !== DEMO_PASSWORD) console.log("  (senhas aleatórias: anote agora, elas não serão exibidas de novo)");
  console.log(`  link do aluno: http://localhost:3000/auth/login?login_token=${r.studentToken}`);
}

async function main() {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
  config();
  const { getDb } = await import("@/db");
  const db = getDb();
  const randomPasswords = !(process.env.DATABASE_URL ?? "").startsWith("pglite:");
  printSeedResult(await seed(db, { randomPasswords }));
  const client = (db as unknown as { $client?: { end?: () => Promise<void>; close?: () => Promise<void> } }).$client;
  await (client?.end ?? client?.close)?.call(client);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/seed.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

/**
 * Remove SÓ os dados de demonstração: os dois usuários demo (com sessões, acessos e progresso) e o
 * conteúdo demo (ver demoContentIds/deleteDemoContent). Nunca toca em usuários ou conteúdo do painel.
 */
export async function cleanDemo(db: Database): Promise<void> {
  const demoUsers = await db.select({ id: users.id }).from(users).where(inArray(users.email, [ADMIN_EMAIL, STUDENT_EMAIL]));
  const userIds = demoUsers.map((u) => u.id);
  if (userIds.length) {
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(productAccess).where(inArray(productAccess.userId, userIds));
    await db.delete(lessonProgress).where(inArray(lessonProgress.userId, userIds));
    await db.delete(lessonReactions).where(inArray(lessonReactions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }

  await deleteDemoContent(db, await demoContentIds(db));
}

/**
 * Atualiza só o CONTEÚDO demo (vitrines, produtos, módulos, aulas, banners, acessos e progresso)
 * preservando usuários demo, senhas, tokens de login, sessões e todo conteúdo criado no painel. Roda uma vez por DEMO_CONTENT_VERSION.
 * Não faz nada se houver qualquer usuário que não seja um dos dois demo.
 */
export async function syncDemoContent(db: Database): Promise<{ ran: boolean; reason: string }> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(notInArray(users.email, [ADMIN_EMAIL, STUDENT_EMAIL]));
  if (n > 0) return { ran: false, reason: "real-users" };

  const [settings] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  if (settings?.data?.demoContentVersion === DEMO_CONTENT_VERSION) return { ran: false, reason: "up-to-date" };

  const demo = await db.select().from(users).where(inArray(users.email, [ADMIN_EMAIL, STUDENT_EMAIL]));
  const student = demo.find((u) => u.email === STUDENT_EMAIL);
  if (!student || demo.length < 2) {
    await seed(db, { randomPasswords: true });
    return { ran: true, reason: "seeded" };
  }

  await db.transaction(async (tx) => {
    const t = tx as unknown as Database;
    // Só o conteúdo demo (e o que depende dele); o criado no painel fica intacto.
    const kept = await deleteDemoContent(t, await demoContentIds(t));
    await createDemoContent(t, student.id, kept);
    await mergeSettings(t, { demoContentVersion: DEMO_CONTENT_VERSION });
  });
  return { ran: true, reason: "synced" };
}
