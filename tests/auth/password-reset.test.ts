import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { emailOutbox, passwordResets, sessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginWithPassword } from "@/lib/auth/login";
import { createSession, getSessionUser } from "@/lib/auth/sessions";
import { requestNewLoginLink, requestPasswordReset, resetPassword } from "@/lib/auth/password-reset";

const req = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => req.headers, cookies: async () => ({ get: () => undefined, set: vi.fn() }) }));
const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); }));
const permanentRedirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT 308 ${url}`); }));
vi.mock("next/navigation", () => ({ redirect, permanentRedirect }));
const flush = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send-now", () => ({ scheduleOutboxFlush: flush }));
// after(): guarda os callbacks; o teste decide quando "a resposta já saiu".
const afterCbs = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => { afterCbs.push(cb); },
}));
async function runAfter() {
  while (afterCbs.length) await afterCbs.shift()!();
}
const revoke = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/auth/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/sessions")>();
  return {
    ...actual,
    revokeUserSessions: async (...args: Parameters<typeof actual.revokeUserSessions>) => {
      if (revoke.fail) throw new Error("falha simulada");
      return actual.revokeUserSessions(...args);
    },
  };
});

import { forgotPasswordAction } from "@/app/auth/esqueci_minha_senha/actions";
import { resetPasswordAction } from "@/app/auth/recuperar_senha/[token]/actions";
import { newLoginLinkAction } from "@/app/auth/login/actions";
import OldForgotPage from "@/app/auth/esqueci-senha/page";

const APP = "https://alunos.exemplo.com";
const HOUR = 3_600_000;
let db: Database;
let userId: number;

beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  flush.mockClear();
  redirect.mockClear();
  afterCbs.length = 0;
  revoke.fail = false;
  req.headers = new Headers({ host: "alunos.exemplo.com", "x-forwarded-proto": "https", "x-forwarded-for": "7.7.7.7" });
  const [u] = await db.insert(users).values({ email: "r@x.com", name: "Admin Exemplo", role: "student",
    passwordHash: await hashPassword("123456"), loginToken: "tok+leg/a==" }).returning();
  userId = u.id;
});
afterEach(() => setDbForTests(null));

async function lastResetToken(): Promise<string> {
  const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "recuperacao"));
  const html = rows.at(-1)!.html;
  const m = html.match(/\/auth\/recuperar_senha\/([A-Za-z0-9_-]+)/);
  return m![1];
}

test("pedido grava só o hash, enfileira o e-mail com o link e o token funciona uma vez", async () => {
  await requestPasswordReset(db, " R@X.com ", { appUrl: APP });
  const [row] = await db.select().from(passwordResets);
  const token = await lastResetToken();
  expect(token).toHaveLength(43);
  expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(row.tokenHash).not.toBe(token);
  const [mail] = await db.select().from(emailOutbox);
  expect(mail.toEmail).toBe("r@x.com");
  expect(mail.html).toContain(`${APP}/auth/recuperar_senha/${token}`);

  expect(await resetPassword(db, token, "novaSenha1")).toBe("ok");
  expect(await loginWithPassword(db, "r@x.com", "novaSenha1")).not.toBeNull();
  expect(await resetPassword(db, token, "outraSenha1")).toBe("invalid");
  expect(await loginWithPassword(db, "r@x.com", "outraSenha1")).toBeNull();
});

test("link vence depois de 1 h", async () => {
  const t0 = new Date();
  await requestPasswordReset(db, "r@x.com", { appUrl: APP, now: t0 });
  const token = await lastResetToken();
  expect(await resetPassword(db, token, "novaSenha1", new Date(t0.getTime() + HOUR + 1000))).toBe("invalid");
  expect(await resetPassword(db, token, "novaSenha1", new Date(t0.getTime() + HOUR - 1000))).toBe("ok");
});

test("pedido novo invalida o anterior", async () => {
  await requestPasswordReset(db, "r@x.com", { appUrl: APP });
  const first = await lastResetToken();
  await requestPasswordReset(db, "r@x.com", { appUrl: APP });
  const second = await lastResetToken();
  expect(second).not.toBe(first);
  expect(await resetPassword(db, first, "novaSenha1")).toBe("invalid");
  expect(await resetPassword(db, second, "novaSenha1")).toBe("ok");
});

test("e-mail inexistente ou excluído não grava nem enfileira", async () => {
  await requestPasswordReset(db, "ninguem@x.com", { appUrl: APP });
  await db.insert(users).values({ email: "del@x.com", name: "D", role: "student", passwordHash: "x", loginToken: "td", deletedAt: new Date() });
  await requestPasswordReset(db, "del@x.com", { appUrl: APP });
  await requestNewLoginLink(db, "ninguem@x.com", { appUrl: APP });
  expect(await db.select().from(passwordResets)).toHaveLength(0);
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
});

test("4º pedido na mesma hora é ignorado em silêncio", async () => {
  const t0 = new Date();
  for (let i = 0; i < 4; i++) await requestPasswordReset(db, "r@x.com", { appUrl: APP, now: new Date(t0.getTime() + i * 1000) });
  expect(await db.select().from(passwordResets)).toHaveLength(3);
  expect(await db.select().from(emailOutbox)).toHaveLength(3);
  // Uma hora depois volta a aceitar.
  await requestPasswordReset(db, "r@x.com", { appUrl: APP, now: new Date(t0.getTime() + HOUR + 5000) });
  expect(await db.select().from(passwordResets)).toHaveLength(4);
});

test("redefinição apaga todas as sessões do usuário", async () => {
  const a = await createSession(db, userId, { remember: true });
  const b = await createSession(db, userId, { remember: false });
  await requestPasswordReset(db, "r@x.com", { appUrl: APP });
  expect(await resetPassword(db, await lastResetToken(), "novaSenha1")).toBe("ok");
  expect(await getSessionUser(db, a.token)).toBeNull();
  expect(await getSessionUser(db, b.token)).toBeNull();
  expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
});

test("senha fraca não consome o link", async () => {
  await requestPasswordReset(db, "r@x.com", { appUrl: APP });
  const token = await lastResetToken();
  expect(await resetPassword(db, token, "123")).toBe("weak");
  expect(await resetPassword(db, token, "123456")).toBe("ok");
});

test("novo link de acesso: e-mail novo-link com login_token codificado; 3 por hora", async () => {
  for (let i = 0; i < 4; i++) await requestNewLoginLink(db, "r@x.com", { appUrl: APP });
  const rows = await db.select().from(emailOutbox).where(and(eq(emailOutbox.template, "novo-link"), eq(emailOutbox.toEmail, "r@x.com")));
  expect(rows).toHaveLength(3);
  expect(rows[0].html).toContain(`${APP}/auth/login?login_token=${encodeURIComponent("tok+leg/a==")}`);
});

// ---- actions ----

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

test("esqueci a senha: mesma resposta para e-mail existente e inexistente", async () => {
  const a = await forgotPasswordAction({}, fd({ email: "r@x.com" }));
  const b = await forgotPasswordAction({}, fd({ email: "ninguem@x.com" }));
  expect(a).toEqual(b);
  expect(a).toEqual({ sent: true });
  // Nada é feito antes da resposta: o trabalho roda no after().
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
  await runAfter();
  expect(await db.select().from(emailOutbox)).toHaveLength(1);
  expect((await db.select().from(emailOutbox))[0].html).toContain(`${APP}/auth/recuperar_senha/`);
});

test("novo link: mesma resposta para e-mail existente e inexistente", async () => {
  const a = await newLoginLinkAction({}, fd({ email: "r@x.com" }));
  const b = await newLoginLinkAction({}, fd({ email: "ninguem@x.com" }));
  expect(a.notice).toBeTruthy();
  expect({ ...a, email: undefined }).toEqual({ ...b, email: undefined });
  await runAfter();
  expect(await db.select().from(emailOutbox)).toHaveLength(1);
});

test("redefinir: senhas diferentes, link inválido, fraca e sucesso", async () => {
  await requestPasswordReset(db, "r@x.com", { appUrl: APP });
  const token = await lastResetToken();
  expect(await resetPasswordAction({}, fd({ token, senha: "novaSenha1", senha_2: "outra" }))).toEqual({ error: "As senhas não conferem." });
  expect(await resetPasswordAction({}, fd({ token: "x", senha: "novaSenha1", senha_2: "novaSenha1" }))).toEqual({ expired: true });
  expect((await resetPasswordAction({}, fd({ token, senha: "1", senha_2: "1" }))).error).toBe("A senha precisa ter pelo menos 6 caracteres.");
  await expect(resetPasswordAction({}, fd({ token, senha: "novaSenha1", senha_2: "novaSenha1" }))).rejects.toThrow(
    "NEXT_REDIRECT /auth/login?senha=redefinida",
  );
});

test("/auth/esqueci-senha redireciona (308) para /auth/esqueci_minha_senha", () => {
  expect(() => OldForgotPage()).toThrow("NEXT_REDIRECT 308 /auth/esqueci_minha_senha");
});

// ---- correções do review ----

/** Conta as chamadas ao banco (select/insert/update/delete/transaction/execute) feitas antes da resposta. */
function countingDb(target: Database) {
  const calls: string[] = [];
  const proxy = new Proxy(target, {
    get(t, prop, recv) {
      const v = Reflect.get(t, prop, recv);
      if (typeof v === "function" && ["select", "insert", "update", "delete", "transaction", "execute"].includes(String(prop))) {
        return (...args: unknown[]) => { calls.push(String(prop)); return v.apply(t, args); };
      }
      return v;
    },
  });
  return { proxy, calls };
}

test("esqueci e novo link: o trabalho aguardado é idêntico para e-mail existente e desconhecido", async () => {
  for (const action of [forgotPasswordAction, newLoginLinkAction]) {
    const traces: string[][] = [];
    for (const email of ["r@x.com", "ninguem@x.com"]) {
      const { proxy, calls } = countingDb(db);
      setDbForTests(proxy);
      req.headers = new Headers({ host: "alunos.exemplo.com", "x-forwarded-for": `1.1.1.${traces.length}` });
      await action({}, fd({ email }));
      traces.push(calls);
      setDbForTests(db);
    }
    expect(traces[0]).toEqual(traces[1]);
    expect(afterCbs).toHaveLength(2);
    await runAfter();
  }
  expect(await db.select().from(emailOutbox)).toHaveLength(2);
});

test("limite por IP: 10 pedidos/hora somando esqueci e novo link; resposta igual; outro IP segue", async () => {
  for (let i = 0; i < 6; i++) expect(await forgotPasswordAction({}, fd({ email: `x${i}@x.com` }))).toEqual({ sent: true });
  for (let i = 0; i < 4; i++) await newLoginLinkAction({}, fd({ email: `y${i}@x.com` }));
  await runAfter();
  expect(await forgotPasswordAction({}, fd({ email: "r@x.com" }))).toEqual({ sent: true });
  await runAfter();
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
  req.headers = new Headers({ host: "alunos.exemplo.com", "x-forwarded-for": "8.8.8.8" });
  await forgotPasswordAction({}, fd({ email: "r@x.com" }));
  await runAfter();
  expect(await db.select().from(emailOutbox)).toHaveLength(1);
});

test("pedidos em paralelo: no máximo 3 por hora e só um link não usado", async () => {
  await Promise.all(Array.from({ length: 8 }, () => requestPasswordReset(db, "r@x.com", { appUrl: APP })));
  const rows = await db.select().from(passwordResets);
  expect(rows).toHaveLength(3);
  expect(rows.filter((r) => r.usedAt === null)).toHaveLength(1);
  expect(await db.select().from(emailOutbox)).toHaveLength(3);
  await Promise.all(Array.from({ length: 5 }, () => requestNewLoginLink(db, "r@x.com", { appUrl: APP })));
  expect(await db.select().from(emailOutbox).where(eq(emailOutbox.template, "novo-link"))).toHaveLength(3);
});

test("redefinição é uma transação: falha ao encerrar sessões não queima o link nem troca a senha", async () => {
  const s = await createSession(db, userId, { remember: true });
  await requestPasswordReset(db, "r@x.com", { appUrl: APP });
  const token = await lastResetToken();
  revoke.fail = true;
  await expect(resetPassword(db, token, "novaSenha1")).rejects.toThrow("falha simulada");
  revoke.fail = false;
  expect(await loginWithPassword(db, "r@x.com", "123456")).not.toBeNull();
  expect(await getSessionUser(db, s.token)).not.toBeNull();
  expect(await resetPassword(db, token, "novaSenha1")).toBe("ok");
});

// ---- revisão final: admins sem link automático ----

test("novo link: e-mail de admin não enfileira nada (mesma resposta)", async () => {
  await db.insert(users).values({ email: "adm@x.com", name: "Adm", role: "admin", adminRole: "root", passwordHash: "x", loginToken: "tok-adm" });
  await requestNewLoginLink(db, "adm@x.com", { appUrl: APP });
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
  const a = await newLoginLinkAction({}, fd({ email: "adm@x.com" }));
  const b = await newLoginLinkAction({}, fd({ email: "r@x.com" }));
  expect({ ...a, email: undefined }).toEqual({ ...b, email: undefined });
  await runAfter();
  const rows = await db.select().from(emailOutbox);
  expect(rows.map((r) => r.toEmail)).toEqual(["r@x.com"]);
});

test("redefinição: token do aluno não muda (e-mails antigos seguem valendo); o do admin é trocado", async () => {
  await requestPasswordReset(db, "r@x.com", { appUrl: APP });
  expect(await resetPassword(db, await lastResetToken(), "novaSenha1")).toBe("ok");
  const [aluno] = await db.select().from(users).where(eq(users.id, userId));
  expect(aluno.loginToken).toBe("tok+leg/a==");

  const [adm] = await db.insert(users).values({ email: "adm@x.com", name: "Adm", role: "admin", adminRole: "root",
    passwordHash: "x", loginToken: "tok-adm" }).returning();
  await requestPasswordReset(db, "adm@x.com", { appUrl: APP });
  expect(await resetPassword(db, await lastResetToken(), "novaSenha1")).toBe("ok");
  const [after] = await db.select().from(users).where(eq(users.id, adm.id));
  expect(after.loginToken).not.toBe("tok-adm");
  expect(after.loginToken).toHaveLength(64);
});
