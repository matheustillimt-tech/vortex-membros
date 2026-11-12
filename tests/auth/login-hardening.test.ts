import { expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { loginAttempts, sessions, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginWithPassword } from "@/lib/auth/login";
import {
  MAX_LOGIN_FAILURES, checkLoginAllowed, clearLoginFailures, loginAttemptKey, purgeExpiredLoginAttempts, recordLoginAttempt,
} from "@/lib/auth/rate-limit";
import { purgeExpiredSessions } from "@/lib/auth/sessions";

vi.mock("@/lib/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const MIN = 60 * 1000;

test("chave é sha256 de e-mail normalizado + ip", () => {
  const a = loginAttemptKey("  Admin@X.com ", "1.2.3.4");
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(a).toBe(loginAttemptKey("admin@x.com", "1.2.3.4"));
  expect(a).not.toBe(loginAttemptKey("admin@x.com", "1.2.3.5"));
});

test("tentativa é reservada antes da senha: 10 passam, a 11ª bloqueia; 15 min depois libera", async () => {
  const db = await createTestDb();
  const key = loginAttemptKey("a@x.com", "1.1.1.1");
  const t0 = new Date("2026-10-16T12:00:00Z");
  const at = (min: number) => new Date(t0.getTime() + min * MIN);
  for (let i = 0; i < 10; i++) expect(await recordLoginAttempt(db, key, at(i))).toBeLessThanOrEqual(MAX_LOGIN_FAILURES);
  expect(await checkLoginAllowed(db, key, at(10))).toBe(false);
  expect(await recordLoginAttempt(db, key, at(10))).toBe(11);
  // Outra chave não é afetada.
  expect(await checkLoginAllowed(db, loginAttemptKey("a@x.com", "2.2.2.2"), t0)).toBe(true);
  // Bloqueio conta da 10ª tentativa (min 9) e não é estendido pelas bloqueadas.
  expect(await recordLoginAttempt(db, key, at(23))).toBeGreaterThan(MAX_LOGIN_FAILURES);
  expect(await checkLoginAllowed(db, key, at(25))).toBe(true);
  expect(await recordLoginAttempt(db, key, at(25))).toBe(1);
});

test("tentativas em paralelo: exatamente 10 liberadas", async () => {
  const db = await createTestDb();
  const key = loginAttemptKey("p@x.com", "1.1.1.1");
  const counts = await Promise.all(Array.from({ length: 25 }, () => recordLoginAttempt(db, key)));
  expect([...counts].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  expect(counts.filter((n) => n <= MAX_LOGIN_FAILURES)).toHaveLength(10);
});

test("tentativas espalhadas além de 15 min não acumulam", async () => {
  const db = await createTestDb();
  const key = loginAttemptKey("b@x.com", "1.1.1.1");
  const t0 = new Date("2026-10-16T12:00:00Z");
  for (let i = 0; i < 9; i++) await recordLoginAttempt(db, key, new Date(t0.getTime() + i * MIN));
  const late = new Date(t0.getTime() + 16 * MIN);
  expect(await recordLoginAttempt(db, key, late)).toBe(1);
  expect(await checkLoginAllowed(db, key, late)).toBe(true);
});

test("sucesso limpa as tentativas", async () => {
  const db = await createTestDb();
  const key = loginAttemptKey("c@x.com", "1.1.1.1");
  for (let i = 0; i < 10; i++) await recordLoginAttempt(db, key);
  expect(await checkLoginAllowed(db, key)).toBe(false);
  await clearLoginFailures(db, key);
  expect(await checkLoginAllowed(db, key)).toBe(true);
  expect(await db.select().from(loginAttempts)).toHaveLength(0);
});

test("purgeExpiredLoginAttempts apaga só o que nenhuma janela (até 1 h) ainda conta", async () => {
  const db = await createTestDb();
  const now = new Date("2026-10-16T12:00:00Z");
  await recordLoginAttempt(db, "velha", new Date(now.getTime() - 61 * MIN));
  // 16 min: já vencida para o login, mas ainda dentro da janela de 1 h da recuperação.
  await recordLoginAttempt(db, "nova", new Date(now.getTime() - 16 * MIN));
  expect(await purgeExpiredLoginAttempts(db, now)).toBe(1);
  expect((await db.select().from(loginAttempts)).map((r) => r.key)).toEqual(["nova"]);
});

test("e-mail inexistente também compara senha (mesmo custo)", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "d@x.com", name: "D", role: "student",
    passwordHash: await hashPassword("123456"), loginToken: "td" });
  const spy = vi.mocked(verifyPassword);
  spy.mockClear();
  expect(await loginWithPassword(db, "ninguem@x.com", "123456")).toBeNull();
  expect(spy).toHaveBeenCalledTimes(1);
  const [, hash] = spy.mock.calls[0];
  expect(hash).toMatch(/^\$2[aby]\$10\$/);
  spy.mockClear();
  expect(await loginWithPassword(db, "d@x.com", "errada")).toBeNull();
  expect(spy).toHaveBeenCalledTimes(1);
});

test("purgeExpiredSessions apaga só as vencidas", async () => {
  const db = await createTestDb();
  const [u] = await db.insert(users).values({ email: "e@x.com", name: "E", role: "student",
    passwordHash: "x", loginToken: "te" }).returning();
  const now = new Date("2026-10-16T12:00:00Z");
  await db.insert(sessions).values([
    { userId: u.id, tokenHash: "a", expiresAt: new Date(now.getTime() - 1000) },
    { userId: u.id, tokenHash: "b", expiresAt: new Date(now.getTime() - 86400000) },
    { userId: u.id, tokenHash: "c", expiresAt: new Date(now.getTime() + 1000) },
  ]);
  expect(await purgeExpiredSessions(db, now)).toBe(2);
  const rest = await db.select().from(sessions);
  expect(rest.map((s) => s.tokenHash)).toEqual(["c"]);
});
