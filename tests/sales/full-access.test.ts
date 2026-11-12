import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, expect, test } from "vitest";
import * as schema from "@/db/schema";
import type { Database } from "@/db";
import { fullAccess, productAccess, products, showcases, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { getActiveAccessProductIds, hasActiveAccess } from "@/lib/catalog/access";

const counter = { n: 0 };
let db: Database;
let aluno: User;
let showcaseId: number;
const now = new Date("2026-10-16T12:00:00Z");

beforeEach(async () => {
  const d = drizzle(new PGlite(), { schema, logger: { logQuery: () => void counter.n++ } });
  await migrate(d, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  db = d as unknown as Database;
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t" }).returning();
  [{ id: showcaseId }] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
});

async function count(fn: () => Promise<unknown>): Promise<number> {
  counter.n = 0;
  await fn();
  return counter.n;
}

test("acesso completo libera todos os produtos, inclusive os criados depois", async () => {
  const [p1] = await db.insert(products).values({ showcaseId, name: "P1", status: "published" }).returning();
  await db.insert(fullAccess).values({ userId: aluno.id, source: "sale", saleRef: "o1", startsAt: new Date("2026-01-01Z") });
  const [p2] = await db.insert(products).values({ showcaseId, name: "Novo", status: "hidden" }).returning();
  const [gone] = await db.insert(products).values({ showcaseId, name: "Excluído", status: "published", deletedAt: now }).returning();
  const ids = await getActiveAccessProductIds(db, aluno.id, now);
  expect(ids.has(p1.id)).toBe(true);
  expect(ids.has(p2.id)).toBe(true);
  expect(ids.has(gone.id)).toBe(false);
  expect(await hasActiveAccess(db, aluno, p2.id, now)).toBe(true);
});

test("acesso completo revogado, expirado ou futuro não libera nada", async () => {
  const [p1] = await db.insert(products).values({ showcaseId, name: "P1", status: "published" }).returning();
  const base = { userId: aluno.id, source: "sale" as const };
  await db.insert(fullAccess).values([
    { ...base, saleRef: "a", revokedAt: new Date("2026-10-01Z") },
    { ...base, saleRef: "b", expiresAt: new Date("2026-10-01Z") },
    { ...base, saleRef: "c", startsAt: new Date("2026-11-01Z") },
  ]);
  expect((await getActiveAccessProductIds(db, aluno.id, now)).has(p1.id)).toBe(false);
});

test("custo: uma consulta sem acesso completo, duas com", async () => {
  const [p1] = await db.insert(products).values({ showcaseId, name: "P1", status: "published" }).returning();
  await db.insert(productAccess).values({ userId: aluno.id, productId: p1.id, source: "manual" });
  expect(await count(() => getActiveAccessProductIds(db, aluno.id, now))).toBe(1);
  await db.insert(fullAccess).values({ userId: aluno.id, source: "manual", startsAt: new Date("2026-01-01Z") });
  expect(await count(() => getActiveAccessProductIds(db, aluno.id, now))).toBe(2);
  expect((await getActiveAccessProductIds(db, aluno.id, now)).has(p1.id)).toBe(true);
});
