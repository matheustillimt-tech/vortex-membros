import { afterEach, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "../helpers/db";
import { setDbForTests } from "@/db";
import { users } from "@/db/schema";
import { GET } from "@/app/auth/token/route";
import { GET as logout } from "@/app/auth/logout/route";
import { getUserFromRequest } from "@/lib/auth/current-user";

afterEach(() => setDbForTests(null));

async function setup() {
  const db = await createTestDb();
  setDbForTests(db);
  await db.insert(users).values({ email: "a@x.com", name: "A", role: "student", passwordHash: "x", loginToken: "abc==" });
  return db;
}

test("token válido cria sessão e vai para o redirect", async () => {
  await setup();
  const res = await GET(new NextRequest("http://x/auth/token?login_token=abc%3D%3D&redirect=/area/conteudo/aula/1"));
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toMatch(/\/area\/conteudo\/aula\/1$/);
  expect(res.cookies.get("am_session")?.value).toBeTruthy();
});

test("token inválido volta ao login com aviso", async () => {
  await setup();
  const res = await GET(new NextRequest("http://x/auth/token?login_token=nada"));
  expect(res.headers.get("location")).toMatch(/\/auth\/login\?link=invalido$/);
  expect(res.cookies.get("am_session")).toBeUndefined();
});

test("redirect externo é ignorado", async () => {
  await setup();
  const res = await GET(new NextRequest("http://x/auth/token?login_token=abc%3D%3D&redirect=//evil.com"));
  expect(res.headers.get("location")).toBe("http://x/area/vitrine/home");
});

test("sessão criada vale no getUserFromRequest e logout revoga", async () => {
  await setup();
  const res = await GET(new NextRequest("http://x/auth/token?login_token=abc%3D%3D"));
  const tok = res.cookies.get("am_session")!.value;
  const req = () => new NextRequest("http://x/auth/logout", { headers: { cookie: `am_session=${tok}` } });
  expect((await getUserFromRequest(req()))?.email).toBe("a@x.com");
  const out = await logout(req());
  expect(out.headers.get("location")).toMatch(/\/auth\/login$/);
  expect(out.cookies.get("am_session")?.value).toBe("");
  expect(await getUserFromRequest(req())).toBeNull();
});

test("admin nunca entra por link automático (login_token): volta ao login com aviso, sem sessão", async () => {
  const db = await setup();
  await db.insert(users).values({ email: "adm@x.com", name: "Adm", role: "admin", adminRole: "root", passwordHash: "x", loginToken: "tok-admin" });
  const res = await GET(new NextRequest("http://x/auth/token?login_token=tok-admin&redirect=/dashboard"));
  expect(res.headers.get("location")).toMatch(/\/auth\/login\?link=invalido$/);
  expect(res.cookies.get("am_session")).toBeUndefined();
});

test("login por link registra 'login por link de acesso' (e o primeiro acesso)", async () => {
  const db = await setup();
  const { userLogs } = await import("@/db/schema");
  await GET(new NextRequest("http://x/auth/token?login_token=abc%3D%3D", { headers: { "user-agent": "UA-x", "x-real-ip": "3.3.3.3" } }));
  const logs = await db.select().from(userLogs);
  expect(logs.map((l) => l.event).sort()).toEqual(["first_access", "login_link"]);
  expect(logs[0]).toMatchObject({ ip: "3.3.3.3", userAgent: "UA-x" });
});
