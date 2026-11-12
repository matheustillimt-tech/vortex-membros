import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test } from "vitest";
import * as schema from "@/db/schema";
import { setDbForTests, type Database } from "@/db";
import { lessons, modules, productAccess, products, showcases, users } from "@/db/schema";
import { createSession, type User } from "@/lib/auth/sessions";
import { getLessonPage } from "@/lib/catalog/queries";
import { getLessonReaction } from "@/lib/progress";
import { getCachedPlatformSettings } from "@/lib/settings";
import { proxy } from "@/proxy";

// Custo de uma aula na área do aluno sem programação e sem termos: não pode passar do orçamento de consultas
// (proxy 1 + layout 2 + página 7 = 10 consultas, todas em sequência).
const counter = { n: 0 };
let db: Database;
let aluno: User;
let token: string;
let lessonId: number;

beforeEach(async () => {
  const d = drizzle(new PGlite(), { schema, logger: { logQuery: () => void counter.n++ } });
  await migrate(d, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  db = d as unknown as Database;
  setDbForTests(db);
  [aluno] = (await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t" }).returning()) as User[];
  token = (await createSession(db, aluno.id, { remember: false })).token;
  const [sc] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  const [p] = await db.insert(products).values({ showcaseId: sc.id, name: "Pago", status: "published" }).returning();
  await db.insert(productAccess).values({ userId: aluno.id, productId: p.id, source: "manual" });
  const [m] = await db.insert(modules).values({ productId: p.id, title: "M", status: "published" }).returning();
  [{ id: lessonId }] = await db.insert(lessons).values({ moduleId: m.id, title: "L", status: "published" }).returning();
});
afterEach(() => setDbForTests(null));

async function count(fn: () => Promise<unknown>): Promise<number> {
  counter.n = 0;
  await fn();
  return counter.n;
}

test("aula paga, sem programação e sem termos: proxy 1 consulta, página 7", async () => {
  await getCachedPlatformSettings(db); // cache quente (o caso comum: TTL de 30 s por instância)
  const req = new NextRequest(`http://x/area/conteudo/aula/${lessonId}`, { headers: { cookie: `am_session=${token}` } });
  expect(await count(() => proxy(req))).toBe(1); // sessão
  expect(await count(() => getCachedPlatformSettings(db))).toBe(0); // layout: só a sessão
  expect(
    await count(async () => {
      const page = await getLessonPage(db, aluno, lessonId);
      expect(page.status).toBe("ok");
      await getLessonReaction(db, aluno.id, lessonId);
    }),
  ).toBe(7); // aula+produto+programação, acesso, módulos, aulas, progresso, reação, próximo módulo (em paralelo)
});
