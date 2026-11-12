/**
 * Banco local para desenvolvimento, sem Docker/Supabase:
 * cria (ou reaproveita) o PGlite em ./.data/dev, aplica as migrações e roda o seed.
 * Depois use DATABASE_URL=pglite:./.data/dev (veja .env.example).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Database } from "@/db";
import { printSeedResult, seed } from "./seed";

async function main() {
  const dir = path.resolve(".data/dev");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve("drizzle") });
  printSeedResult(await seed(db as unknown as Database));
  await client.close();
  console.log(`Banco local pronto em ${dir} (DATABASE_URL=pglite:./.data/dev)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
