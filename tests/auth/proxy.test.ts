import { afterEach, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../helpers/db";
import { setDbForTests } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth/sessions";
import { proxy } from "@/proxy";

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

function req(path: string, cookie?: string) {
  return new NextRequest(`http://x${path}`, cookie ? { headers: { cookie: `am_session=${cookie}` } } : undefined);
}

function expectLoginRedirect(res: Response, path: string) {
  expect(res.status).toBe(307);
  const loc = new URL(res.headers.get("location")!);
  expect(loc.pathname).toBe("/auth/login");
  expect(loc.searchParams.get("redirect")).toBe(path);
}

test("sem cookie vai ao login com redirect", async () => {
  await setup();
  const res = await proxy(req("/area/vitrine/home?x=1"));
  expectLoginRedirect(res, "/area/vitrine/home?x=1");
  expect(res.headers.get("set-cookie")).toBeNull();
});

test("cookie inválido vai ao login com redirect e apaga o cookie", async () => {
  await setup();
  const res = await proxy(req("/area/vitrine/home", "lixo"));
  expectLoginRedirect(res, "/area/vitrine/home");
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toMatch(/am_session=;/);
  expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
});

test("cookie válido segue", async () => {
  const { db, user } = await setup();
  const { token } = await createSession(db, user.id, { remember: true });
  const res = await proxy(req("/area/vitrine/home", token));
  expect(res.status).toBe(200);
  expect(res.headers.get("x-middleware-next")).toBe("1");
  expect(res.headers.get("location")).toBeNull();
});

async function makeUser(db: Awaited<ReturnType<typeof createTestDb>>, role: "student" | "admin", email: string) {
  const [u] = await db.insert(users).values({ email, name: role, role, passwordHash: "x", loginToken: `t-${email}` }).returning();
  return (await createSession(db, u.id, { remember: false })).token;
}

test("/dashboard sem cookie vai ao login com redirect", async () => {
  await setup();
  const res = await proxy(req("/dashboard"));
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("http://x/auth/login?redirect=%2Fdashboard");
});

test("/dashboard/* com cookie inválido vai ao login e apaga o cookie", async () => {
  await setup();
  const res = await proxy(req("/dashboard/content/products", "lixo"));
  expectLoginRedirect(res, "/dashboard/content/products");
  expect(res.headers.get("set-cookie") ?? "").toMatch(/am_session=;/);
});

test("/dashboard com sessão de aluno vai à home do aluno", async () => {
  const { db, user } = await setup();
  const { token } = await createSession(db, user.id, { remember: false });
  const res = await proxy(req("/dashboard/content/products", token));
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get("location")!).pathname).toBe("/area/vitrine/home");
  expect(res.headers.get("set-cookie")).toBeNull();
});

test("/dashboard com sessão de admin segue", async () => {
  const { db } = await setup();
  const token = await makeUser(db, "admin", "adm@x.com");
  const res = await proxy(req("/dashboard/content/products", token));
  expect(res.status).toBe(200);
  expect(res.headers.get("x-middleware-next")).toBe("1");
});

test("matcher cobre /area e /dashboard", async () => {
  const { config } = await import("@/proxy");
  expect(config.matcher).toEqual(["/area/:path*", "/dashboard/:path*"]);
});

test("/dashboard de admin abre o Início (sem redirecionar)", async () => {
  const { db } = await setup();
  const token = await makeUser(db, "admin", "adm2@x.com");
  const res = await proxy(req("/dashboard", token));
  expect(res.status).toBe(200);
  expect(res.headers.get("x-middleware-next")).toBe("1");
});
