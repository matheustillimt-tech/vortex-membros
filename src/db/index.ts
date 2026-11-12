import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { runtimeDatabaseUrl } from "./url";

// Base comum que aceita postgres.js, PGlite etc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<any, typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Database };
let testDb: Database | null = null;

export function setDbForTests(db: Database | null): void {
  testDb = db;
}

export function getDb(): Database {
  if (testDb) return testDb;
  if (globalForDb.__db) return globalForDb.__db;

  // Na Vercel, a integração do Supabase cria POSTGRES_URL (pooler, porta 6543).
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL (ou POSTGRES_URL) não definida");

  let db: Database;
  if (url.startsWith("pglite:")) {
    // Desenvolvimento local: PGlite em arquivo (ex.: pglite:./.data/dev)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
    db = drizzle(new PGlite(url.slice("pglite:".length)), { schema }) as unknown as Database;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const postgres = require("postgres") as typeof import("postgres");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
    // Uma conexão por instância serverless, fechada após 5 s ociosa, pelo pooler em modo sessão (ver
    // runtimeDatabaseUrl: o modo transação travava páginas na Vercel). O limite de 15 clientes do modo
    // sessão: as imagens saem prontas da publicação, sem conexão por visita.
    db = drizzle(postgres(runtimeDatabaseUrl(url), { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 }), { schema }) as unknown as Database;
  }
  globalForDb.__db = db; // cache (sobrevive ao hot reload em dev)
  return db;
}
