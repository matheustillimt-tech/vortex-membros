import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// Migrações usam a conexão direta (sem pooler) quando vem da integração Supabase da Vercel.
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!url) throw new Error("DATABASE_URL (ou POSTGRES_URL_NON_POOLING) não definida para usar o drizzle-kit");
const isPglite = url.startsWith("pglite:");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(isPglite ? { driver: "pglite" as const, dbCredentials: { url: url.slice("pglite:".length) } } : { dbCredentials: { url } }),
});
