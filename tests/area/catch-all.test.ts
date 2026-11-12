import { afterEach, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../helpers/db";
import { setDbForTests } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth/sessions";
import * as route from "@/app/[...rest]/route";

afterEach(() => setDbForTests(null));

async function setup() {
  const db = await createTestDb();
  setDbForTests(db);
  const [u] = await db
    .insert(users)
    .values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "abc" })
    .returning();
  return { db, user: u };
}

const req = (cookie?: string, method = "GET") =>
  new NextRequest("http://x/qualquer/coisa", { method, headers: cookie ? { cookie: `am_session=${cookie}` } : {} });

test("logado vai para a home", async () => {
  const { db, user } = await setup();
  const { token } = await createSession(db, user.id, { remember: true });
  const res = await route.GET(req(token));
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("http://x/area/vitrine/home");
});

test("cookie inválido vai ao login e apaga o cookie", async () => {
  await setup();
  const res = await route.GET(req("lixo"));
  expect(res.headers.get("location")).toBe("http://x/auth/login");
  expect(res.headers.get("set-cookie") ?? "").toMatch(/am_session=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
});

test("sem cookie vai ao login sem mexer em cookie", async () => {
  await setup();
  const res = await route.GET(req());
  expect(res.headers.get("location")).toBe("http://x/auth/login");
  expect(res.headers.get("set-cookie")).toBeNull();
});

test("todos os métodos respondem com redirect (nunca 405)", async () => {
  await setup();
  for (const m of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const) {
    const handler = route[m];
    expect(handler, m).toBeTypeOf("function");
    expect((await handler(req(undefined, m))).status, m).toBe(307);
  }
});
