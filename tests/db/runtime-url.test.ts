import { expect, test } from "vitest";
import { runtimeDatabaseUrl } from "@/db/url";

const SESSION = "postgresql://postgres.abc:s3nha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";
const TX = { DB_POOL_MODE: "transaction" };

test("padrão: a URL do modo sessão fica como está (o modo transação travou na Vercel)", () => {
  expect(runtimeDatabaseUrl(SESSION, {})).toBe(SESSION);
  expect(runtimeDatabaseUrl(SESSION, { DB_POOL_MODE: "session" })).toBe(SESSION);
});

test("DB_POOL_MODE=transaction: pooler do Supabase passa para 6543", () => {
  expect(runtimeDatabaseUrl(SESSION, TX)).toBe("postgresql://postgres.abc:s3nha@aws-1-sa-east-1.pooler.supabase.com:6543/postgres");
});

test("com DB_POOL_MODE=transaction, conexão direta, PGlite e outros hosts ficam como estão", () => {
  const direct = "postgresql://postgres:x@db.abc.supabase.co:5432/postgres";
  expect(runtimeDatabaseUrl(direct, TX)).toBe(direct);
  expect(runtimeDatabaseUrl("pglite:./.data/dev", TX)).toBe("pglite:./.data/dev");
  expect(runtimeDatabaseUrl("postgresql://u:p@localhost:5432/db", TX)).toBe("postgresql://u:p@localhost:5432/db");
  expect(runtimeDatabaseUrl("não é url", TX)).toBe("não é url");
});

test("senha com caracteres especiais continua intacta", () => {
  const url = "postgresql://postgres.abc:a%40b%23c@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require";
  expect(runtimeDatabaseUrl(url, TX)).toBe("postgresql://postgres.abc:a%40b%23c@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require");
});
