import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "vitest";
import * as schema from "@/db/schema";

test("migração 0014: alunos que já acessaram ganham first_access_at = last_access_at", async () => {
  const full = path.resolve(__dirname, "../../drizzle");
  // Cópia das migrações só até a 0013 (o estado de produção antes da 0014).
  const partial = mkdtempSync(path.join(tmpdir(), "mig-"));
  cpSync(full, partial, { recursive: true });
  const journalPath = path.join(partial, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e: { tag: string }) => e.tag < "0014");
  writeFileSync(journalPath, JSON.stringify(journal));

  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: partial });
  const last = new Date("2026-10-10T10:00:00Z");
  // SQL cru: o esquema atual tem colunas que só nascem em migrações posteriores.
  await db.execute(sql`
    insert into users (email, name, role, password_hash, login_token, last_access_at) values
      ('a@x.com', 'A', 'student', 'x', 'a', ${last.toISOString()}),
      ('b@x.com', 'B', 'student', 'x', 'b', null)
  `);
  await migrate(db, { migrationsFolder: full });
  const rows = await db.select().from(schema.users).orderBy(asc(schema.users.email));
  expect(rows.map((r) => r.firstAccessAt)).toEqual([last, null]);
});
