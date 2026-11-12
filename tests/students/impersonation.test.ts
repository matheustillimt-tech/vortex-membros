import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { sessions, userLogs, users } from "@/db/schema";
import { createSession, getSession, getSessionUser, type User } from "@/lib/auth/sessions";
import { ADMIN_RETURN_COOKIE, endImpersonation, IMPERSONATION_MS, startImpersonation } from "@/lib/students/impersonation";
import { GET as loginAsGet, POST as loginAs } from "@/app/dashboard/student/[id]/login-as/route";
import { GET as backToPanel } from "@/app/auth/voltar-ao-painel/route";
import { proxy } from "@/proxy";

let db: Database;
let root: User;
let other: User;
let aluno: User;
let adminToken: string;

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  [root] = await db.insert(users).values({ email: "root@x.com", name: "Root", role: "admin", adminRole: "root", passwordHash: "x", loginToken: "tr" }).returning();
  [other] = await db.insert(users).values({ email: "o@x.com", name: "Outro", role: "admin", adminRole: "root", passwordHash: "x", loginToken: "to" }).returning();
  [aluno] = await db.insert(users).values({ email: "a@x.com", name: "Aluno", role: "student", passwordHash: "x", loginToken: "ta" }).returning();
  adminToken = (await createSession(db, root.id, { remember: true })).token;
});
afterEach(() => setDbForTests(null));

const now = () => new Date();

test("lib: só admin inicia; alvo precisa ser aluno ativo; sessão de 1 h marcada; log 'impersonated'", async () => {
  await expect(startImpersonation(db, aluno, aluno.id, { ip: "1", userAgent: "UA" })).rejects.toThrow(/administradores/);
  await expect(startImpersonation(db, root, other.id, { ip: "1", userAgent: "UA" })).rejects.toThrow("Aluno não encontrado.");
  const t0 = now();
  const { token, expiresAt } = await startImpersonation(db, root, aluno.id, { ip: "9.9.9.9", userAgent: "UA-adm" }, t0);
  expect(expiresAt.getTime()).toBe(t0.getTime() + IMPERSONATION_MS);
  expect(await getSession(db, token)).toMatchObject({ user: { id: aluno.id }, impersonatedBy: root.id });
  const logs = await db.select().from(userLogs).where(eq(userLogs.userId, aluno.id));
  expect(logs).toMatchObject([{ event: "impersonated", ip: "9.9.9.9", userAgent: "UA-adm" }]);
  await db.update(users).set({ deletedAt: now() }).where(eq(users.id, aluno.id));
  await expect(startImpersonation(db, root, aluno.id, { ip: "1", userAgent: "UA" })).rejects.toThrow("Aluno não encontrado.");
});

test("lib: voltar exige a sessão personificada + o cookie de retorno do MESMO admin, ainda válido", async () => {
  const start = () => startImpersonation(db, root, aluno.id, { ip: "1", userAgent: "UA" });
  const normal = (await createSession(db, aluno.id, { remember: true })).token;
  const otherToken = (await createSession(db, other.id, { remember: true })).token;
  // sessão normal de aluno: nada acontece (e ela continua)
  expect(await endImpersonation(db, { sessionToken: normal, returnToken: adminToken })).toBeNull();
  expect(await getSessionUser(db, normal)).not.toBeNull();
  // sem cookie de retorno / token de outro admin / token de aluno: não volta, e a personificada é encerrada
  for (const returnToken of [undefined, otherToken, normal, "lixo"]) {
    const imp = await start();
    expect(await endImpersonation(db, { sessionToken: imp.token, returnToken })).toBeNull();
    expect(await getSessionUser(db, imp.token)).toBeNull();
  }
  // certo: encerra a personificada e devolve a do admin
  const imp = await start();
  expect(await endImpersonation(db, { sessionToken: imp.token, returnToken: adminToken })).toEqual({ adminToken, studentId: aluno.id });
  expect(await getSessionUser(db, imp.token)).toBeNull();
  // sessão do admin expirada → não volta
  const imp2 = await start();
  await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, root.id));
  expect(await endImpersonation(db, { sessionToken: imp2.token, returnToken: adminToken })).toBeNull();
});

function req(url: string, cookies: Record<string, string>, headers: Record<string, string> = {}, method = "GET") {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  return new NextRequest(url, { method, headers: { cookie, ...headers } });
}
/** "Entrar como o aluno": formulário POST da própria origem. */
const post = (url: string, cookies: Record<string, string>, headers: Record<string, string> = { origin: "http://x" }) => req(url, cookies, headers, "POST");
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

test("rota login-as (POST da mesma origem): admin vira o aluno (cookie trocado + cookie de retorno) e vai para a área", async () => {
  const res = await loginAs(post(`http://x/dashboard/student/${aluno.id}/login-as`, { am_session: adminToken }), params(aluno.id));
  expect(res.status).toBe(303); // POST → GET da área
  expect(new URL(res.headers.get("location")!).pathname).toBe("/area/vitrine/home");
  const newToken = res.cookies.get("am_session")!.value;
  expect(newToken).not.toBe(adminToken);
  expect((await getSession(db, newToken))?.impersonatedBy).toBe(root.id);
  const ret = res.cookies.get(ADMIN_RETURN_COOKIE)!;
  expect(ret.value).toBe(adminToken);
  expect(ret.httpOnly).toBe(true);
  // a sessão do admin continua válida (para voltar)
  expect((await getSessionUser(db, adminToken))?.id).toBe(root.id);
});

test("rota login-as recusa aluno, outra origem, POST sem Origin, GET e id inválido", async () => {
  const studentToken = (await createSession(db, aluno.id, { remember: true })).token;
  const r1 = await loginAs(post(`http://x/dashboard/student/${aluno.id}/login-as`, { am_session: studentToken }), params(aluno.id));
  expect(r1.cookies.get(ADMIN_RETURN_COOKIE)).toBeUndefined();
  expect(new URL(r1.headers.get("location")!).pathname).not.toBe("/area/vitrine/home");
  // outra origem, sem Origin e GET: recusados, nada é criado
  for (const headers of [{ origin: "https://evil.com" }, { origin: "http://x.evil.com" }, {} as Record<string, string>, { origin: "null" }]) {
    const r2 = await loginAs(post(`http://x/dashboard/student/${aluno.id}/login-as`, { am_session: adminToken }, headers), params(aluno.id));
    expect(r2.status).toBe(403);
    expect(r2.cookies.get(ADMIN_RETURN_COOKIE)).toBeUndefined();
  }
  const g = await loginAsGet();
  expect(g.status).toBe(405);
  expect(g.headers.get("allow")).toBe("POST");
  const r3 = await loginAs(post(`http://x/dashboard/student/abc/login-as`, { am_session: adminToken }), params("abc"));
  expect(r3.status).toBe(404);
  expect(await db.select().from(sessions).where(eq(sessions.userId, aluno.id))).toHaveLength(1);
});

test("sessão personificada não abre /dashboard (proxy) e 'Voltar ao painel' restaura o admin sem senha", async () => {
  const res = await loginAs(post(`http://x/dashboard/student/${aluno.id}/login-as`, { am_session: adminToken }), params(aluno.id));
  const impToken = res.cookies.get("am_session")!.value;
  const blocked = await proxy(req("http://x/dashboard/content/products", { am_session: impToken }));
  expect(new URL(blocked.headers.get("location")!).pathname).toBe("/area/vitrine/home");

  const back = await backToPanel(req("http://x/auth/voltar-ao-painel", { am_session: impToken, [ADMIN_RETURN_COOKIE]: adminToken }));
  expect(new URL(back.headers.get("location")!).pathname).toBe(`/dashboard/student/${aluno.id}`);
  expect(back.cookies.get("am_session")!.value).toBe(adminToken);
  expect(back.cookies.get(ADMIN_RETURN_COOKIE)!.value).toBe("");
  expect(await getSessionUser(db, impToken)).toBeNull();

  // sem cookie de retorno válido: encerra a sessão e vai ao login
  const res2 = await loginAs(post(`http://x/dashboard/student/${aluno.id}/login-as`, { am_session: adminToken }), params(aluno.id));
  const imp2 = res2.cookies.get("am_session")!.value;
  const bad = await backToPanel(req("http://x/auth/voltar-ao-painel", { am_session: imp2, [ADMIN_RETURN_COOKIE]: "lixo" }));
  expect(new URL(bad.headers.get("location")!).pathname).toBe("/auth/login");
  expect(bad.cookies.get("am_session")!.value).toBe("");
  expect(await getSessionUser(db, imp2)).toBeNull();
});

test("sair durante a personificação encerra também a sessão do admin guardada", async () => {
  const { GET: logout } = await import("@/app/auth/logout/route");
  const res = await loginAs(post(`http://x/dashboard/student/${aluno.id}/login-as`, { am_session: adminToken }), params(aluno.id));
  const imp = res.cookies.get("am_session")!.value;
  await logout(req("http://x/auth/logout", { am_session: imp, [ADMIN_RETURN_COOKIE]: adminToken }));
  expect(await getSessionUser(db, imp)).toBeNull();
  expect(await getSessionUser(db, adminToken)).toBeNull();
});
