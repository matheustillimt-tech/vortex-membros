import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { emailOutbox, platformSettings, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginWithPassword, loginWithToken } from "@/lib/auth/login";
import { createSession, getSessionUser } from "@/lib/auth/sessions";
import { ensureBootstrapAdmin, mainEnsureAdmin } from "../../scripts/ensure-admin";

afterEach(() => vi.unstubAllEnvs());

const byEmail = async (db: Awaited<ReturnType<typeof createTestDb>>, email: string) =>
  (await db.select().from(users).where(eq(users.email, email)))[0];

test("sem e-mail: skipped e nada muda", async () => {
  const db = await createTestDb();
  expect(await ensureBootstrapAdmin(db, {})).toBe("skipped");
  expect(await ensureBootstrapAdmin(db, { email: "   " })).toBe("skipped");
  expect(await db.select().from(users)).toHaveLength(0);
});

test("novo: cria admin root com senha aleatória (inutilizável sem redefinir), token novo e sem e-mail", async () => {
  const db = await createTestDb();
  expect(await ensureBootstrapAdmin(db, { email: " Admin@X.com ", name: "Admin" })).toBe("created");
  const u = await byEmail(db, "admin@x.com");
  expect(u).toMatchObject({ role: "admin", adminRole: "root", name: "Admin", deletedAt: null });
  expect(u.passwordHash).toMatch(/^\$2[aby]\$10\$/);
  expect(await loginWithPassword(db, "admin@x.com", "123456")).toBeNull();
  expect(u.loginToken).toHaveLength(64);
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
  // Sem nome: usa a parte antes do @.
  expect(await ensureBootstrapAdmin(db, { email: "outra@x.com" })).toBe("created");
  expect((await byEmail(db, "outra@x.com")).name).toBe("outra");
});

test("aluno existente: promovido sem tocar na senha nem nas sessões; token trocado; sem e-mail", async () => {
  const db = await createTestDb();
  const [s] = await db.insert(users).values({ email: "admin@x.com", name: "Aluno Exemplo", role: "student",
    passwordHash: await hashPassword("minhaSenha1"), loginToken: "tok-aluno" }).returning();
  const sess = await createSession(db, s.id, { remember: true });
  expect(await ensureBootstrapAdmin(db, { email: "admin@x.com", name: "Outro Nome" })).toBe("promoted");
  const u = await byEmail(db, "admin@x.com");
  expect(u).toMatchObject({ role: "admin", adminRole: "root", name: "Aluno Exemplo", passwordHash: s.passwordHash });
  expect((await loginWithPassword(db, "admin@x.com", "minhaSenha1"))?.id).toBe(s.id);
  expect((await getSessionUser(db, sess.token))?.id).toBe(s.id);
  expect(u.loginToken).not.toBe("tok-aluno");
  expect(await loginWithToken(db, "tok-aluno")).toBeNull();
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
});

test("já é admin: unchanged (senha, token e papel intactos); admin antigo sem admin_role vira root", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "admin@x.com", name: "R", role: "admin", adminRole: "root",
    passwordHash: "hash-intacto", loginToken: "tok-admin" });
  expect(await ensureBootstrapAdmin(db, { email: "ADMIN@x.com" })).toBe("unchanged");
  expect(await byEmail(db, "admin@x.com")).toMatchObject({ passwordHash: "hash-intacto", loginToken: "tok-admin", role: "admin" });
  const db2 = await createTestDb();
  await db2.insert(users).values({ email: "admin@x.com", name: "R", role: "admin", adminRole: null,
    passwordHash: "hash-intacto", loginToken: "tok-admin" });
  expect(await ensureBootstrapAdmin(db2, { email: "admin@x.com" })).toBe("unchanged");
  expect(await byEmail(db2, "admin@x.com")).toMatchObject({ adminRole: "root", passwordHash: "hash-intacto", loginToken: "tok-admin" });
});

test("cadastro excluído: restaurado como admin mantendo a senha (promoted)", async () => {
  const db = await createTestDb();
  await db.insert(users).values({ email: "admin@x.com", name: "R", role: "student", passwordHash: "hash-x",
    loginToken: "tok-x", deletedAt: new Date() });
  expect(await ensureBootstrapAdmin(db, { email: "admin@x.com" })).toBe("promoted");
  expect(await byEmail(db, "admin@x.com")).toMatchObject({ role: "admin", deletedAt: null, passwordHash: "hash-x" });
});

test("script: lê BOOTSTRAP_ADMIN_EMAIL/NAME e imprime só o resultado", async () => {
  const db = await createTestDb();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "segredo-nao-impresso@x.com");
  vi.stubEnv("BOOTSTRAP_ADMIN_NAME", "Admin");
  expect(await mainEnsureAdmin(db)).toBe("created");
  vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "");
  expect(await mainEnsureAdmin(db)).toBe("skipped");
  const printed = log.mock.calls.map((c) => c.join(" ")).join("\n");
  expect(printed).toBe("admin:ensure created\nadmin:ensure skipped");
  log.mockRestore();
});

test("vercel-build roda admin:ensure depois do seed:sync, só em produção", async () => {
  const pkg = (await import("../../package.json")).default as { scripts: Record<string, string> };
  expect(pkg.scripts["admin:ensure"]).toBe("tsx scripts/ensure-admin.ts");
  const build = pkg.scripts["vercel-build"];
  const prodBlock = build.slice(build.indexOf('if [ "$VERCEL_ENV" = "production" ]; then'), build.lastIndexOf("fi && next build"));
  expect(prodBlock).toMatch(/npm run seed:sync && npm run admin:ensure/);
});

test("uma vez só: depois de aplicado, o mesmo e-mail não re-promove nem restaura", async () => {
  const db = await createTestDb();
  expect(await ensureBootstrapAdmin(db, { email: "admin@x.com" })).toBe("created");
  const [row] = await db.select().from(platformSettings);
  expect(row.data.bootstrapAdmin).toMatchObject({ email: "admin@x.com" });
  expect(typeof (row.data.bootstrapAdmin as { at: unknown }).at).toBe("string");
  // Removido no painel (volta a aluno) e depois excluído: o próximo deploy não mexe.
  await db.update(users).set({ role: "student", adminRole: null, deletedAt: new Date() }).where(eq(users.email, "admin@x.com"));
  const before = await byEmail(db, "admin@x.com");
  expect(await ensureBootstrapAdmin(db, { email: " ADMIN@x.com " })).toBe("unchanged");
  expect(await byEmail(db, "admin@x.com")).toEqual(before);
});

test("marcador preserva as outras configurações; e-mail diferente roda uma vez para o novo", async () => {
  const db = await createTestDb();
  await db.insert(platformSettings).values({ id: 1, data: { siteName: "Minha Escola" } });
  expect(await ensureBootstrapAdmin(db, { email: "a@x.com" })).toBe("created");
  expect(await ensureBootstrapAdmin(db, { email: "b@x.com" })).toBe("created");
  expect(await ensureBootstrapAdmin(db, { email: "b@x.com" })).toBe("unchanged");
  const [row] = await db.select().from(platformSettings);
  expect(row.data).toMatchObject({ siteName: "Minha Escola", bootstrapAdmin: { email: "b@x.com" } });
  // Sem e-mail não grava marcador.
  const db2 = await createTestDb();
  expect(await ensureBootstrapAdmin(db2, {})).toBe("skipped");
  expect(await db2.select().from(platformSettings)).toHaveLength(0);
});
