import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { loginAttempts, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

const req = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => req.headers,
  cookies: async () => ({ set: vi.fn() }),
}));
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import { loginAction } from "@/app/auth/login/actions";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  req.headers = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
  redirect.mockClear();
  await db.insert(users).values({ email: "r@x.com", name: "R", role: "student",
    passwordHash: await hashPassword("123456"), loginToken: "tr" });
});
afterEach(() => setDbForTests(null));

function fd(email: string, password: string) {
  const f = new FormData();
  f.set("email", email); f.set("password", password);
  return f;
}
const BLOQUEIO = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";

test("rajada paralela de senhas erradas: só 10 chegam a comparar a senha", async () => {
  const results = await Promise.all(Array.from({ length: 15 }, () => loginAction({}, fd("r@x.com", "errada"))));
  expect(results.filter((r) => r.error === BLOQUEIO)).toHaveLength(5);
  expect(results.filter((r) => r.error?.startsWith("E-mail ou senha incorretos"))).toHaveLength(10);
  // Bloqueado, nem a senha certa entra.
  expect((await loginAction({}, fd("r@x.com", "123456"))).error).toBe(BLOQUEIO);
  expect(redirect).not.toHaveBeenCalled();
});

test("sucesso limpa a contagem e redireciona", async () => {
  for (let i = 0; i < 3; i++) await loginAction({}, fd("r@x.com", "errada"));
  expect(await db.select().from(loginAttempts)).toHaveLength(1);
  await loginAction({}, fd("r@x.com", "123456"));
  expect(redirect).toHaveBeenCalledOnce();
  expect(await db.select().from(loginAttempts)).toHaveLength(0);
});

test("x-real-ip tem prioridade sobre x-forwarded-for", async () => {
  for (let i = 0; i < 10; i++) await loginAction({}, fd("r@x.com", "errada"));
  // Mesmo XFF, outro x-real-ip: chave diferente, não bloqueado.
  req.headers = new Headers({ "x-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8" });
  expect((await loginAction({}, fd("r@x.com", "errada"))).error).not.toBe(BLOQUEIO);
  // Trocar só o XFF com o mesmo x-real-ip não escapa do limite.
  for (let i = 0; i < 9; i++) await loginAction({}, fd("r@x.com", "errada"));
  req.headers = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "8.8.8.8" });
  expect((await loginAction({}, fd("r@x.com", "errada"))).error).toBe(BLOQUEIO);
});

test("login por senha registra o evento com ip e dispositivo; senha errada não registra", async () => {
  const { userLogs } = await import("@/db/schema");
  req.headers = new Headers({ "x-real-ip": "7.7.7.7", "user-agent": "UA-teste" });
  await loginAction({}, fd("r@x.com", "errada"));
  expect(await db.select().from(userLogs)).toHaveLength(0);
  await loginAction({}, fd("r@x.com", "123456"));
  const logs = await db.select().from(userLogs);
  expect(logs.map((l) => l.event).sort()).toEqual(["first_access", "login"]);
  expect(logs.every((l) => l.ip === "7.7.7.7" && l.userAgent === "UA-teste")).toBe(true);
});
