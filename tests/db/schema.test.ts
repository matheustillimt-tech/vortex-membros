import { expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import { showcases, users } from "@/db/schema";

test("aceita ID explícito (importação) e gera IDs novos a partir de 900000000", async () => {
  const db = await createTestDb();
  await db.insert(showcases).values({ id: 141859, name: "Formação Renda com IA", status: "published" });
  const [novo] = await db.insert(showcases).values({ name: "Nova", status: "published" }).returning();
  expect(novo.id).toBeGreaterThanOrEqual(900000000);
  const todas = await db.select().from(showcases);
  expect(todas.map((s) => Number(s.id))).toContain(141859);
});

test("e-mail de usuário é único", async () => {
  const db = await createTestDb();
  const base = { name: "A", passwordHash: "x", role: "student" as const };
  await db.insert(users).values({ ...base, email: "a@x.com", loginToken: "t1" });
  await expect(db.insert(users).values({ ...base, email: "a@x.com", loginToken: "t2" })).rejects.toThrow();
});
