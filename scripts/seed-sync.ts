/**
 * npm run seed:sync -> atualiza o conteúdo demo sem recriar usuários, senhas ou tokens (ver syncDemoContent).
 * Não imprime segredos.
 */
import { syncDemoContent } from "./seed";

async function mainSync() {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
  config();
  const { getDb } = await import("@/db");
  const db = getDb();
  const r = await syncDemoContent(db);
  console.log(`seed:sync ${r.ran ? "executado" : "ignorado"} (${r.reason})`);
  const client = (db as unknown as { $client?: { end?: () => Promise<void>; close?: () => Promise<void> } }).$client;
  await (client?.end ?? client?.close)?.call(client);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/seed-sync.ts")) {
  mainSync().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
