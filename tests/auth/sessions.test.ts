import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import { sessions, users } from "@/db/schema";
import { createSession, getSessionUser, revokeSession } from "@/lib/auth/sessions";

async function setup() {
  const db = await createTestDb();
  const [u] = await db.insert(users).values({ email: "s@x.com", name: "S", role: "student",
    passwordHash: "x", loginToken: "ts" }).returning();
  return { db, u };
}
const DIA = 24 * 60 * 60 * 1000;

test("sessão criada devolve o usuário", async () => {
  const { db, u } = await setup();
  const { token } = await createSession(db, u.id, { remember: false });
  expect((await getSessionUser(db, token))?.id).toBe(u.id);
  expect(await getSessionUser(db, "outro")).toBeNull();
});

test("sessão expirada devolve null", async () => {
  const { db, u } = await setup();
  const { token } = await createSession(db, u.id, { remember: true });
  await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
  expect(await getSessionUser(db, token)).toBeNull();
});

test("revokeSession invalida a sessão", async () => {
  const { db, u } = await setup();
  const { token } = await createSession(db, u.id, { remember: false });
  await revokeSession(db, token);
  expect(await getSessionUser(db, token)).toBeNull();
});

test("usuário excluído perde a sessão", async () => {
  const { db, u } = await setup();
  const { token } = await createSession(db, u.id, { remember: false });
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, u.id));
  expect(await getSessionUser(db, token)).toBeNull();
});

test("o banco não guarda o token puro", async () => {
  const { db, u } = await setup();
  const { token } = await createSession(db, u.id, { remember: false });
  const rows = await db.select().from(sessions);
  expect(rows).toHaveLength(1);
  expect(rows[0].tokenHash).not.toBe(token);
  expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
});

test("validade: 1 dia sem remember, 30 dias com remember", async () => {
  const { db, u } = await setup();
  const a = await createSession(db, u.id, { remember: false });
  const b = await createSession(db, u.id, { remember: true });
  expect(Math.abs(a.expiresAt.getTime() - Date.now() - DIA)).toBeLessThan(5000);
  expect(Math.abs(b.expiresAt.getTime() - Date.now() - 30 * DIA)).toBeLessThan(5000);
});
