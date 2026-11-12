import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { generateLoginToken, normalizeLoginToken } from "@/lib/auth/tokens";
import { loginWithPassword, loginWithToken } from "@/lib/auth/login";

test("entra com e-mail em maiúsculas e espaços", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "admin@x.com", name: "R", role: "student",
    passwordHash: await hashPassword("123456"), loginToken: "tok" });
  expect(await loginWithPassword(db, "  Admin@X.com ", "123456")).not.toBeNull();
  expect(await loginWithPassword(db, "admin@x.com", "errada")).toBeNull();
});

test("token legado com + e == funciona mesmo decodificado com espaço", async () => {
  const db = await createTestDb();
  const legado = "MS06OTab+cd/ef==";
  await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: legado });
  expect(await loginWithToken(db, "MS06OTab cd/ef==")).not.toBeNull();
  expect(await loginWithToken(db, legado)).not.toBeNull();
  expect(await loginWithToken(db, "inexistente")).toBeNull();
});

test("aluno excluído não entra", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "b@x.com", name: "B", role: "student",
    passwordHash: await hashPassword("123456"), loginToken: "tb", deletedAt: new Date() });
  expect(await loginWithPassword(db, "b@x.com", "123456")).toBeNull();
  expect(await loginWithToken(db, "tb")).toBeNull();
});

test("login atualiza último acesso", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "c@x.com", name: "C", role: "student",
    passwordHash: await hashPassword("123456"), loginToken: "tc" });
  const antes = await db.select().from(users).where(eq(users.email, "c@x.com"));
  expect(antes[0].lastAccessAt).toBeNull();

  const viaSenha = await loginWithPassword(db, "c@x.com", "123456");
  expect(viaSenha?.lastAccessAt).toBeInstanceOf(Date);
  const depoisSenha = await db.select().from(users).where(eq(users.email, "c@x.com"));
  expect(depoisSenha[0].lastAccessAt).toBeInstanceOf(Date);

  await db.update(users).set({ lastAccessAt: null }).where(eq(users.email, "c@x.com"));
  const viaToken = await loginWithToken(db, "tc");
  expect(viaToken?.lastAccessAt).toBeInstanceOf(Date);
  const depoisToken = await db.select().from(users).where(eq(users.email, "c@x.com"));
  expect(depoisToken[0].lastAccessAt).toBeInstanceOf(Date);
});

test("generateLoginToken gera tokens únicos de 64 caracteres", () => {
  const a = generateLoginToken(), b = generateLoginToken();
  expect(a).toHaveLength(64); expect(a).not.toBe(b);
  expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
});

test("token legado começando ou terminando com + sobrevive à decodificação", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "d@x.com", name: "D", role: "student", passwordHash: "x", loginToken: "+abc/def==" });
  await db.insert(users).values({ email: "e@x.com", name: "E", role: "student", passwordHash: "x", loginToken: "abc/def+" });
  expect((await loginWithToken(db, " abc/def=="))?.email).toBe("d@x.com");
  expect((await loginWithToken(db, "abc/def "))?.email).toBe("e@x.com");
});

test("normalizeLoginToken converte espaços em + e só remove controles das pontas", () => {
  expect(normalizeLoginToken(" abc/def==")).toBe("+abc/def==");
  expect(normalizeLoginToken("abc/def ")).toBe("abc/def+");
  expect(normalizeLoginToken("a b")).toBe("a+b");
  expect(normalizeLoginToken("\r\nabc\t\n")).toBe("abc");
});
