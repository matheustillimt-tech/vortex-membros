import { DrizzleQueryError } from "drizzle-orm/errors";
import { expect, test } from "vitest";
import { safeErrorSummary } from "@/lib/log";

test("safeErrorSummary: nome e código/constraint do banco, nunca a mensagem", () => {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), {
    name: "PostgresError",
    code: "23505",
    constraint_name: "users_email_unique",
  });
  const err = new DrizzleQueryError('insert into "users" values ($1, $2)', ["fulano@x.com", "token-secreto"], cause);
  const s = safeErrorSummary(err);
  expect(s).toBe("DrizzleQueryError cause=PostgresError code=23505 constraint=users_email_unique");
  expect(safeErrorSummary(Object.assign(new Error("x fulano@x.com"), { code: "ECONNRESET" }))).toBe("Error code=ECONNRESET");
  expect(safeErrorSummary(new TypeError("senha 123"))).toBe("TypeError");
  expect(safeErrorSummary("texto")).toBe("erro desconhecido");
  expect(safeErrorSummary(Object.assign(new Error("m"), { cause: { code: "57P01", constraint: "c'; drop" } }))).toBe("Error cause=object code=57P01");
});
