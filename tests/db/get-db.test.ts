import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { migrate } from "drizzle-orm/pglite/migrator";
import { getDb, setDbForTests } from "@/db";
import { showcases } from "@/db/schema";

afterEach(() => {
  setDbForTests(null);
  delete (globalThis as { __db?: unknown }).__db;
});

test("getDb abre PGlite em arquivo quando DATABASE_URL começa com pglite:", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pglite-"));
  process.env.DATABASE_URL = `pglite:${dir}`;
  const db = getDb();
  expect(getDb()).toBe(db); // cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  await db.insert(showcases).values({ name: "X", status: "published" });
  expect(await db.select().from(showcases)).toHaveLength(1);
});
