import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { emailOutbox, sessions, users } from "@/db/schema";
import { loginWithPassword, loginWithToken } from "@/lib/auth/login";
import { resetPassword } from "@/lib/auth/password-reset";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_PASSWORD_POLICY, validatePassword } from "@/lib/auth/password-policy";
import { createSession, getSessionUser, type User } from "@/lib/auth/sessions";

const session = vi.hoisted(() => ({ user: null as User | null, token: undefined as string | undefined }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "alunos.exemplo.com", "x-forwarded-proto": "https" }),
  cookies: async () => ({ get: () => (session.token ? { value: session.token } : undefined), set: vi.fn() }),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
const flush = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send-now", () => ({ scheduleOutboxFlush: flush }));

import * as adm from "@/lib/admin/administrators";
import * as a from "@/app/dashboard/settings/administrators/actions";

const APP = { appUrl: "https://alunos.exemplo.com" };
let db: Database;
let root: User;
let student: User;

async function insertUser(email: string, role: "admin" | "student", name = email.split("@")[0]): Promise<User> {
  const [u] = await db
    .insert(users)
    .values({
      email,
      name,
      role,
      adminRole: role === "admin" ? "root" : null,
      passwordHash: await hashPassword("123456"),
      loginToken: `tok-${email}`,
    })
    .returning();
  return u;
}

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  root = await insertUser("root@x.com", "admin", "Zélia Exemplo");
  student = await insertUser("aluno@x.com", "student", "Aluno Antigo");
  session.user = root;
  session.token = undefined;
  revalidatePath.mockClear();
  flush.mockClear();
});
afterEach(() => setDbForTests(null));

function fd(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}
const unescape = (s: string) =>
  s.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
/** Senha que foi no e-mail (célula "Senha:" da tabela de credenciais). */
function passwordIn(html: string): string {
  const m = html.match(/Senha:<\/td><td class="info" style="[^"]*">([^<]*)<\/td>/);
  if (!m) throw new Error("e-mail sem senha");
  return unescape(m[1]);
}
const invites = (email: string) =>
  db.select().from(emailOutbox).where(and(eq(emailOutbox.toEmail, email), eq(emailOutbox.template, "convite-admin")));
const userById = async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0];

test("gerador de senha: 12 caracteres que passam na senha forte padrão", () => {
  for (let i = 0; i < 200; i++) {
    const pw = adm.generateAdminPassword();
    expect([...pw]).toHaveLength(12);
    expect(validatePassword(pw, { ...DEFAULT_PASSWORD_POLICY, strong: true })).toBeNull();
    expect(pw).not.toMatch(/[&<>"'\s]/);
  }
});

test("criar novo: vira Super Admin, 1 e-mail com a senha, e a senha funciona no login", async () => {
  const { id } = await adm.createAdministrator(db, root, { name: "  Fulana Nova ", email: " Fulana@Exemplo.com " }, APP);
  const u = await userById(id);
  expect(u).toMatchObject({ email: "fulana@exemplo.com", name: "Fulana Nova", role: "admin", adminRole: "root" });
  const mails = await invites("fulana@exemplo.com");
  expect(mails).toHaveLength(1);
  const pw = passwordIn(mails[0].html);
  expect([...pw]).toHaveLength(12);
  expect((await loginWithPassword(db, "fulana@exemplo.com", pw))?.id).toBe(id);
});

test("promover existente: mantém senha e sessões; convite sem senha, com link de redefinição; token trocado", async () => {
  const old = await createSession(db, student.id, { remember: true });
  const { id } = await adm.createAdministrator(db, root, { name: "Outro Nome", email: "ALUNO@x.com" }, APP);
  expect(id).toBe(student.id);
  const u = await userById(id);
  expect(u).toMatchObject({ role: "admin", adminRole: "root", name: "Aluno Antigo", passwordHash: student.passwordHash });
  // A senha e a sessão de aluno continuam valendo.
  expect((await loginWithPassword(db, "aluno@x.com", "123456"))?.id).toBe(id);
  expect((await getSessionUser(db, old.token))?.id).toBe(id);
  // O link automático antigo (login_token de aluno) não abre sessão de admin.
  expect(u.loginToken).not.toBe(student.loginToken);
  expect(await loginWithToken(db, student.loginToken)).toBeNull();
  const mails = await invites("aluno@x.com");
  expect(mails).toHaveLength(1);
  expect(() => passwordIn(mails[0].html)).toThrow("e-mail sem senha");
  const token = mails[0].html.match(/\/auth\/recuperar_senha\/([A-Za-z0-9_-]+)/)?.[1];
  expect(token).toBeTruthy();
  expect(mails[0].html).toContain(`${APP.appUrl}/auth/recuperar_senha/${token}`);
  expect(await resetPassword(db, token!, "NovaSenha1!")).toBe("ok");
  expect((await loginWithPassword(db, "aluno@x.com", "NovaSenha1!"))?.id).toBe(id);
});

test("criar novo e reenviar acesso trocam o login_token", async () => {
  const { id } = await adm.createAdministrator(db, root, { name: "N", email: "n@x.com" }, APP);
  const created = await userById(id);
  const other = await insertUser("b@x.com", "admin");
  await adm.resendAccess(db, root, other.id, APP);
  const after = await userById(other.id);
  expect(after.loginToken).not.toBe(other.loginToken);
  expect(after.loginToken).toHaveLength(64);
  expect(await loginWithToken(db, other.loginToken)).toBeNull();
  expect(created.loginToken).toHaveLength(64);
});

test("criar: e-mail inválido, nome vazio e e-mail que já é admin são recusados sem gravar nada", async () => {
  for (const email of ["", "sem-arroba", "a@b", "a b@x.com", "x@y..com"]) {
    await expect(adm.createAdministrator(db, root, { name: "X", email }, APP)).rejects.toThrow("Informe um e-mail válido.");
  }
  await expect(adm.createAdministrator(db, root, { name: "  ", email: "n@x.com" }, APP)).rejects.toThrow("Informe o nome.");
  await expect(adm.createAdministrator(db, root, { name: "R", email: "root@x.com" }, APP)).rejects.toThrow(
    "Este e-mail já é de um administrador.",
  );
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
  expect(await db.select().from(users)).toHaveLength(2);
});

test("reenviar acesso: troca a senha, manda por e-mail e encerra as sessões dele", async () => {
  const other = await insertUser("b@x.com", "admin");
  const s = await createSession(db, other.id, { remember: false });
  await adm.resendAccess(db, root, other.id, APP);
  const mails = await invites("b@x.com");
  expect(mails).toHaveLength(1);
  const pw = passwordIn(mails[0].html);
  expect(await loginWithPassword(db, "b@x.com", "123456")).toBeNull();
  expect((await loginWithPassword(db, "b@x.com", pw))?.id).toBe(other.id);
  expect(await getSessionUser(db, s.token)).toBeNull();
  // Reenviar de novo: a senha anterior deixa de valer.
  await adm.resendAccess(db, root, other.id, APP);
  const again = await invites("b@x.com");
  expect(again).toHaveLength(2);
  expect(await loginWithPassword(db, "b@x.com", pw)).toBeNull();
});

test("alterar senha: segue a política; encerra as sessões dele, menos a do próprio ator", async () => {
  const other = await insertUser("b@x.com", "admin");
  const s = await createSession(db, other.id, { remember: false });
  await expect(adm.setAdministratorPassword(db, root, other.id, "123")).rejects.toThrow("A senha precisa ter pelo menos 6 caracteres.");
  await adm.setAdministratorPassword(db, root, other.id, "nova-senha");
  expect((await loginWithPassword(db, "b@x.com", "nova-senha"))?.id).toBe(other.id);
  expect(await getSessionUser(db, s.token)).toBeNull();

  const mine = await createSession(db, root.id, { remember: false });
  const elsewhere = await createSession(db, root.id, { remember: false });
  await adm.setAdministratorPassword(db, root, root.id, "minha-nova", { keepSessionToken: mine.token });
  expect((await getSessionUser(db, mine.token))?.id).toBe(root.id);
  expect(await getSessionUser(db, elsewhere.token)).toBeNull();
});

test("editar perfil: nome, e-mail, CPF e celular; e-mail inválido ou já usado recusado", async () => {
  const other = await insertUser("b@x.com", "admin");
  await adm.updateAdministrator(db, root, other.id, { name: " Beta ", email: "BETA@x.com", document: " 123 ", phone: "" });
  expect(await userById(other.id)).toMatchObject({ name: "Beta", email: "beta@x.com", document: "123", phone: null });
  await expect(adm.updateAdministrator(db, root, other.id, { name: "B", email: "nada" })).rejects.toThrow("Informe um e-mail válido.");
  await expect(adm.updateAdministrator(db, root, other.id, { name: "B", email: "aluno@x.com" })).rejects.toThrow(
    "Este e-mail já está em uso.",
  );
  await expect(adm.updateAdministrator(db, root, student.id, { name: "B", email: "z@x.com" })).rejects.toThrow("Administrador não encontrado.");
});

test("editar perfil: trocar o e-mail de outro admin encerra as sessões dele; só nome não", async () => {
  const other = await insertUser("b@x.com", "admin");
  const s1 = await createSession(db, other.id, { remember: true });
  await adm.updateAdministrator(db, root, other.id, { name: "Só nome", email: "b@x.com" });
  expect(await getSessionUser(db, s1.token)).not.toBeNull();
  await adm.updateAdministrator(db, root, other.id, { name: "Só nome", email: "novo-b@x.com" });
  expect(await getSessionUser(db, s1.token)).toBeNull();
  // O próprio ator trocando o e-mail não se desconecta.
  const mine = await createSession(db, root.id, { remember: true });
  await adm.updateAdministrator(db, root, root.id, { name: "Admin", email: "admin@x.com" });
  expect(await getSessionUser(db, mine.token)).not.toBeNull();
});

test("excluir: ator rebaixado enquanto isso é recusado dentro da transação", async () => {
  const b = await insertUser("b@x.com", "admin");
  await insertUser("c@x.com", "admin");
  // `root` (objeto da sessão) ainda diz admin, mas no banco já virou aluno.
  await db.update(users).set({ role: "student", adminRole: null }).where(eq(users.id, root.id));
  await expect(adm.removeAdministrator(db, root, b.id)).rejects.toThrow("Acesso restrito a administradores.");
  expect((await userById(b.id)).role).toBe("admin");
});

test("excluir: recusa a si mesmo e o último Super Admin; os demais voltam a aluno e perdem as sessões", async () => {
  await expect(adm.removeAdministrator(db, root, root.id)).rejects.toThrow("Você não pode excluir a si mesmo.");
  const other = await insertUser("b@x.com", "admin");
  await adm.removeAdministrator(db, root, other.id);
  expect(await userById(other.id)).toMatchObject({ role: "student", adminRole: null, deletedAt: null });
  // Agora root é o único: excluir a si mesmo continua recusado (a regra de si mesmo vem antes).
  await expect(adm.removeAdministrator(db, root, root.id)).rejects.toThrow("Você não pode excluir a si mesmo.");
});

test("lixeira: excluído aparece até ser restaurado; restaurar volta a Super Admin", async () => {
  const other = await insertUser("b@x.com", "admin", "Bia");
  expect(await adm.listRemovedAdministrators(db, root)).toEqual([]);
  await adm.removeAdministrator(db, root, other.id);
  const trash = await adm.listRemovedAdministrators(db, root);
  expect(trash).toMatchObject([{ id: other.id, name: "Bia", email: "b@x.com" }]);
  expect(trash[0].removedAt).toBeInstanceOf(Date);
  await expect(adm.listRemovedAdministrators(db, student)).rejects.toThrow("Acesso restrito a administradores.");
  await expect(adm.restoreAdministrator(db, student, other.id)).rejects.toThrow("Acesso restrito a administradores.");
  // Aluno comum (nunca foi admin) não é restaurável.
  await expect(adm.restoreAdministrator(db, root, student.id)).rejects.toThrow("Administrador não encontrado.");
  await adm.restoreAdministrator(db, root, other.id);
  expect(await userById(other.id)).toMatchObject({ role: "admin", adminRole: "root", adminRemovedAt: null });
  expect(await adm.listRemovedAdministrators(db, root)).toEqual([]);
  await expect(adm.restoreAdministrator(db, root, other.id)).rejects.toThrow("Administrador não encontrado.");
});

test("lixeira: cadastro excluído não aparece; promover de novo tira da lixeira", async () => {
  const a = await insertUser("a1@x.com", "admin");
  const b = await insertUser("b1@x.com", "admin");
  await adm.removeAdministrator(db, root, a.id);
  await adm.removeAdministrator(db, root, b.id);
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, a.id));
  expect((await adm.listRemovedAdministrators(db, root)).map((r) => r.id)).toEqual([b.id]);
  await adm.createAdministrator(db, root, { name: "B", email: "b1@x.com" }, { appUrl: "https://x.test" });
  expect(await adm.listRemovedAdministrators(db, root)).toEqual([]);
});

test("excluir encerra as sessões do removido", async () => {
  const other = await insertUser("b@x.com", "admin");
  const s = await createSession(db, other.id, { remember: true });
  await adm.removeAdministrator(db, root, other.id);
  expect(await db.select().from(sessions).where(eq(sessions.userId, other.id))).toHaveLength(0);
  expect(await getSessionUser(db, s.token)).toBeNull();
});

test("excluir o último Super Admin é recusado (mesmo por outro admin que não é Super Admin no futuro)", async () => {
  // Único admin ativo: o próprio ator. Excluir um admin já removido / um aluno → não encontrado.
  await expect(adm.removeAdministrator(db, root, student.id)).rejects.toThrow("Administrador não encontrado.");
  const other = await insertUser("b@x.com", "admin");
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, root.id));
  // `other` é agora o único admin ativo; o ator (root) não conta.
  await expect(adm.removeAdministrator(db, root, other.id)).rejects.toThrow("Não é possível excluir o último Super Admin.");
  expect((await userById(other.id)).role).toBe("admin");
});

test("lista e detalhe: só admins, busca por nome ou e-mail", async () => {
  await insertUser("beta@x.com", "admin", "Beta");
  const all = await adm.listAdministrators(db, root);
  expect(all.map((r) => r.email)).toEqual(["beta@x.com", "root@x.com"]);
  expect(all[0]).toMatchObject({ name: "Beta", adminRole: "root" });
  expect((await adm.listAdministrators(db, root, { search: "zél" })).map((r) => r.email)).toEqual(["root@x.com"]);
  expect((await adm.listAdministrators(db, root, { search: "BETA@" })).map((r) => r.email)).toEqual(["beta@x.com"]);
  expect((await adm.listAdministrators(db, root, { search: "100%_" }))).toEqual([]);
  expect(await adm.getAdministrator(db, root, root.id)).toMatchObject({ email: "root@x.com", adminRole: "root" });
  await expect(adm.getAdministrator(db, root, student.id)).rejects.toThrow("Administrador não encontrado.");
});

test("não-admin (aluno ou sem sessão) é recusado em todas as funções e actions", async () => {
  const other = await insertUser("b@x.com", "admin");
  const snapshot = await db.select().from(users);
  const denied = "Acesso restrito a administradores.";
  for (const actor of [student, null]) {
    await expect(adm.listAdministrators(db, actor)).rejects.toThrow(denied);
    await expect(adm.getAdministrator(db, actor, other.id)).rejects.toThrow(denied);
    await expect(adm.createAdministrator(db, actor, { name: "N", email: "n@x.com" }, APP)).rejects.toThrow(denied);
    await expect(adm.resendAccess(db, actor, other.id, APP)).rejects.toThrow(denied);
    await expect(adm.setAdministratorPassword(db, actor, other.id, "abcdefgh")).rejects.toThrow(denied);
    await expect(adm.updateAdministrator(db, actor, other.id, { name: "N", email: "n@x.com" })).rejects.toThrow(denied);
    await expect(adm.removeAdministrator(db, actor, other.id)).rejects.toThrow(denied);

    session.user = actor;
    const res = { ok: false, error: denied };
    expect(await a.createAdministratorAction(fd({ name: "N", email: "n@x.com" }))).toEqual(res);
    expect(await a.resendAccessAction(fd({ id: other.id }))).toEqual(res);
    expect(await a.setAdministratorPasswordAction(fd({ id: other.id, password: "abcdefgh", password2: "abcdefgh" }))).toEqual(res);
    expect(await a.updateAdministratorAction(fd({ id: other.id, name: "N", email: "n@x.com" }))).toEqual(res);
    expect(await a.removeAdministratorAction(fd({ id: other.id }))).toEqual(res);
  }
  expect(await db.select().from(users)).toEqual(snapshot);
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
});

test("actions: criar envia já (flush) e revalida; senhas diferentes recusadas; mantém a sessão atual do ator", async () => {
  const created = await a.createAdministratorAction(fd({ name: "Nova", email: "nova@x.com" }));
  expect(created).toMatchObject({ ok: true });
  expect(flush).toHaveBeenCalled();
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard/settings/administrators");
  expect(await invites("nova@x.com")).toHaveLength(1);

  expect(await a.setAdministratorPasswordAction(fd({ id: root.id, password: "abcdefgh", password2: "abcdefgx" }))).toEqual({
    ok: false,
    error: "As senhas não conferem.",
  });
  const mine = await createSession(db, root.id, { remember: false });
  const other = await createSession(db, root.id, { remember: false });
  session.token = mine.token;
  expect(await a.setAdministratorPasswordAction(fd({ id: root.id, password: "abcdefgh", password2: "abcdefgh" }))).toEqual({ ok: true });
  expect(await getSessionUser(db, mine.token)).not.toBeNull();
  expect(await getSessionUser(db, other.token)).toBeNull();

  expect(await a.removeAdministratorAction(fd({ id: root.id }))).toEqual({ ok: false, error: "Você não pode excluir a si mesmo." });
});

test("datas do perfil no formato esperado", () => {
  const now = new Date("2026-10-16T15:00:00Z");
  const last = new Date("2026-09-18T19:01:00Z"); // 16:01 em São Paulo
  expect(adm.formatLongDate(last)).toBe("Sexta-feira, 18 set 2026");
  expect(adm.formatDateTime(last)).toBe("18/09/2026 16:01");
  expect(adm.formatRelative(last, now)).toBe("há 3 semanas");
  expect(adm.formatLongDate(new Date("2026-05-11T14:46:00Z"))).toBe("Segunda-feira, 11 mai 2026");
  expect(adm.formatRelative(new Date("2026-05-11T14:46:00Z"), now)).toBe("há 5 meses");
  expect(adm.formatRelative(new Date(now.getTime() - 30_000), now)).toBe("agora");
  expect(adm.formatRelative(new Date(now.getTime() - 2 * 3_600_000), now)).toBe("há 2 horas");
});

test("alterar senha de admin troca o login_token", async () => {
  const other = await insertUser("b@x.com", "admin");
  await adm.setAdministratorPassword(db, root, other.id, "NovaSenha1!");
  const u = await userById(other.id);
  expect(u.loginToken).not.toBe(other.loginToken);
  expect(u.loginToken).toHaveLength(64);
});
