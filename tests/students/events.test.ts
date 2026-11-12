import { asc, desc, eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { userLogs, users } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { EVENT_LABELS, lastAccessIsFresh, recordLogin, touchLastAccess } from "@/lib/students/events";

let db: Database;
let aluno: User;
const UA1 = "Mozilla/5.0 (Macintosh) Chrome/141.0.0.0";
const UA2 = "Mozilla/5.0 (iPhone) Safari/605.1.15";
const t0 = new Date("2026-10-16T12:00:00Z");
const D = 24 * 3600_000;

beforeEach(async () => {
  db = await createTestDb();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "t" }).returning();
});

async function events(): Promise<string[]> {
  const rows = await db.select().from(userLogs).where(eq(userLogs.userId, aluno.id)).orderBy(desc(userLogs.createdAt), desc(userLogs.id));
  return rows.map((r) => r.event);
}

async function reload(): Promise<User> {
  const [u] = await db.select().from(users).where(eq(users.id, aluno.id));
  return u;
}

test("rótulos dos eventos", () => {
  expect(EVENT_LABELS).toEqual({
    login: "Realizou login",
    login_link: "Realizou login por link de acesso",
    first_access: "Primeiro acesso à plataforma",
    new_device: "Novo dispositivo registrado",
    password_changed: "Senha alterada",
    impersonated: "Acessado por um administrador",
  });
});

test("primeiro login: primeiro acesso + login (sem 'novo dispositivo'), grava first_access_at", async () => {
  await recordLogin(db, aluno, { via: "link", ip: "1.2.3.4", userAgent: UA1 }, t0);
  expect(await events()).toEqual(["login_link", "first_access"]);
  expect((await reload()).firstAccessAt).toEqual(t0);
  const [log] = await db.select().from(userLogs).orderBy(asc(userLogs.id)).limit(1);
  expect(log).toMatchObject({ ip: "1.2.3.4", userAgent: UA1, createdAt: t0 });
});

test("mesmo dispositivo não gera evento; outro dispositivo gera 'novo dispositivo'", async () => {
  await recordLogin(db, aluno, { via: "link", ip: "1.2.3.4", userAgent: UA1 }, t0);
  const u = await reload();
  await recordLogin(db, u, { via: "password", ip: "1.2.3.4", userAgent: UA1 }, new Date(t0.getTime() + D));
  expect(await events()).toEqual(["login", "login_link", "first_access"]);
  await recordLogin(db, u, { via: "password", ip: "5.6.7.8", userAgent: UA2 }, new Date(t0.getTime() + 2 * D));
  expect(await events()).toEqual(["login", "new_device", "login", "login_link", "first_access"]);
  expect((await reload()).firstAccessAt).toEqual(t0); // não muda
});

test("dispositivo visto há mais de 90 dias volta a ser novo", async () => {
  await recordLogin(db, aluno, { via: "password", ip: "1", userAgent: UA1 }, t0);
  const u = await reload();
  await recordLogin(db, u, { via: "password", ip: "1", userAgent: UA1 }, new Date(t0.getTime() + 91 * D));
  expect(await events()).toEqual(["login", "new_device", "login", "first_access"]);
});

test("primeiro acesso vale uma vez mesmo com o objeto do usuário desatualizado", async () => {
  await recordLogin(db, aluno, { via: "password", ip: "1", userAgent: UA1 }, t0);
  await recordLogin(db, aluno, { via: "password", ip: "1", userAgent: UA1 }, new Date(t0.getTime() + 1000));
  expect((await events()).filter((e) => e === "first_access")).toHaveLength(1);
});

test("user-agent vazio não registra dispositivo; ip e user-agent longos são cortados", async () => {
  await recordLogin(db, aluno, { via: "password", ip: "", userAgent: "" }, t0);
  const u = await reload();
  await recordLogin(db, u, { via: "password", ip: "x".repeat(200), userAgent: "y".repeat(2000) }, new Date(t0.getTime() + 1000));
  expect(await events()).toEqual(["login", "new_device", "login", "first_access"]);
  const rows = await db.select().from(userLogs).orderBy(asc(userLogs.id));
  expect(rows[0].userAgent).toBeNull();
  expect(rows[0].ip).toBeNull();
  expect(rows.at(-1)!.ip!.length).toBeLessThanOrEqual(64);
  expect(rows.at(-1)!.userAgent!.length).toBeLessThanOrEqual(512);
});

test("touchLastAccess atualiza no máximo 1 vez por hora", async () => {
  expect(await touchLastAccess(db, aluno.id, t0)).toBe(true);
  expect((await reload()).lastAccessAt).toEqual(t0);
  const t1 = new Date(t0.getTime() + 59 * 60_000);
  expect(await touchLastAccess(db, aluno.id, t1)).toBe(false);
  expect((await reload()).lastAccessAt).toEqual(t0);
  const t2 = new Date(t0.getTime() + 61 * 60_000);
  expect(await touchLastAccess(db, aluno.id, t2)).toBe(true);
  expect((await reload()).lastAccessAt).toEqual(t2);
});

test("aluno com sessão longa que volta todo dia fica 'ativo nos últimos 7 dias'", async () => {
  let t = t0;
  for (let day = 0; day < 10; day++) {
    t = new Date(t0.getTime() + day * D);
    await touchLastAccess(db, aluno.id, t);
  }
  expect((await reload()).lastAccessAt).toEqual(t);
});

test("lastAccessIsFresh: o layout nem faz o UPDATE quando o último acesso é da última hora", () => {
  expect(lastAccessIsFresh(null, t0)).toBe(false);
  expect(lastAccessIsFresh(new Date(t0.getTime() - 59 * 60_000), t0)).toBe(true);
  expect(lastAccessIsFresh(new Date(t0.getTime() - 61 * 60_000), t0)).toBe(false);
});

test("'novo dispositivo' só olha logins (um evento de personificação com o navegador do admin não conta)", async () => {
  await recordLogin(db, aluno, { via: "password", ip: "1", userAgent: UA1 }, t0);
  await db.insert(userLogs).values({ userId: aluno.id, event: "impersonated", userAgent: UA2, createdAt: new Date(t0.getTime() + 1000) });
  const u = await reload();
  await recordLogin(db, u, { via: "password", ip: "1", userAgent: UA2 }, new Date(t0.getTime() + D));
  expect(await events()).toEqual(["login", "new_device", "impersonated", "login", "first_access"]);
});
