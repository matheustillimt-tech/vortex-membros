/**
 * npm run seed:clean -> remove apenas os dados de demonstração (ver cleanDemo em ./seed).
 * Rode antes de importar alunos reais.
 */
import { cleanDemo } from "./seed";

async function mainClean() {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
  config();
  const { getDb } = await import("@/db");
  const db = getDb();
  await cleanDemo(db);
  console.log("Dados de demonstração removidos (usuários demo, vitrines/produtos/módulos/aulas e banner do seed).");
  const client = (db as unknown as { $client?: { end?: () => Promise<void>; close?: () => Promise<void> } }).$client;
  await (client?.end ?? client?.close)?.call(client);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/seed-clean.ts")) {
  mainClean().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
