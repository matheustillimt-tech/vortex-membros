import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { emailOutbox, platformSettings } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { DEFAULT_SETTINGS, getPlatformSettings, resolvePlatformSettings, type PlatformSettings } from "@/lib/settings";
import {
  STRONG_CRITERIA,
  generatePassword,
  getPasswordPolicy,
  PASSWORD_LEVELS,
  validatePassword,
  type PasswordPolicy,
} from "@/lib/auth/password-policy";
import { initialPasswordFor } from "@/lib/auth/initial-password";
import { parseAuthForm, parseEmailAppearanceForm, parseEmailTemplateForm } from "@/lib/admin/settings-forms";
import { emailHealthNotice } from "@/lib/email/health";
import { INVALID_KEY_ERROR } from "@/lib/email/outbox";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import * as authActions from "@/app/dashboard/settings/security/auth/actions";
import * as emailActions from "@/app/dashboard/settings/emails/actions";
import { GET as previewGet, POST as previewPost } from "@/app/dashboard/settings/emails/preview/[template]/route";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  session.user = admin;
  revalidatePath.mockClear();
});
afterEach(() => setDbForTests(null));

function fd(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}

const AUTH_OK = {
  requireStrongPassword: "1",
  level: "padrao",
  minLength: 8,
  special: 1,
  upper: 1,
  lower: 1,
  digits: 1,
  letters: 0,
  initialPasswordFrom: "none",
  defaultPassword: "",
};
const APPEARANCE_OK = {
  colorPage: "#fafafb",
  colorContent: "#ffffff",
  colorText: "#212121",
  colorFooter: "#212121",
  colorLink: "#0c92f0",
  logoUrl: "",
  logoHeight: "35",
  senderName: "Minha Escola",
  replyTo: "contato@escola.com",
  signature: "Equipe Minha Escola",
};

// ---------- Configurações: leitura ----------

test("padrões de autenticação: senha forte desligada, critérios padrão, senha padrão 123456", () => {
  expect(DEFAULT_SETTINGS.auth).toEqual({
    requireStrongPassword: false,
    level: "padrao",
    ...STRONG_CRITERIA,
    initialPasswordFrom: "none",
    defaultPassword: "123456",
  });
  expect(PASSWORD_LEVELS.padrao).toEqual({ minLength: 8, special: 1, upper: 1, lower: 1, digits: 1, letters: 0 });
});

test("defaultPassword antigo (no topo) continua valendo como auth.defaultPassword", async () => {
  expect(resolvePlatformSettings({ defaultPassword: "abc123" }).auth.defaultPassword).toBe("abc123");
  expect(resolvePlatformSettings({ defaultPassword: "abc123", auth: { defaultPassword: "novo99" } }).auth.defaultPassword).toBe("novo99");
  expect(resolvePlatformSettings({ defaultPassword: "abc123", auth: { defaultPassword: null } }).auth.defaultPassword).toBeNull();
  expect(resolvePlatformSettings({}).auth.defaultPassword).toBe("123456");
  await db.insert(platformSettings).values({ id: 1, data: { defaultPassword: "legado1" } });
  expect((await getPlatformSettings(db)).auth.defaultPassword).toBe("legado1");
});

test("resolve recusa critérios fora da faixa e enums desconhecidos", () => {
  const s = resolvePlatformSettings({ auth: { minLength: 2, special: 99, level: "xx", initialPasswordFrom: "cpf", upper: 3 } });
  expect(s.auth.minLength).toBe(8);
  expect(s.auth.special).toBe(1);
  expect(s.auth.level).toBe("padrao");
  expect(s.auth.initialPasswordFrom).toBe("none");
  expect(s.auth.upper).toBe(3);
});

test("getPasswordPolicy lê settings.auth", () => {
  expect(getPasswordPolicy(DEFAULT_SETTINGS)).toEqual({ strong: false, ...STRONG_CRITERIA });
  const s = resolvePlatformSettings({ auth: { requireStrongPassword: true, minLength: 10, digits: 3 } });
  expect(getPasswordPolicy(s)).toEqual({ strong: true, ...STRONG_CRITERIA, minLength: 10, digits: 3 });
});

// ---------- Geração de senha ----------

test("generatePassword sempre passa em validatePassword", () => {
  const policies: PasswordPolicy[] = [
    { strong: false, ...STRONG_CRITERIA },
    { strong: true, ...PASSWORD_LEVELS.padrao },
    { strong: true, ...PASSWORD_LEVELS.reforcada },
    { strong: true, ...PASSWORD_LEVELS.maxima },
    { strong: true, minLength: 6, special: 0, upper: 0, lower: 0, digits: 6, letters: 0 },
    { strong: true, minLength: 20, special: 5, upper: 4, lower: 0, digits: 0, letters: 12 },
    { strong: true, minLength: 6, special: 64, upper: 64, lower: 64, digits: 64, letters: 64 },
  ];
  for (const p of policies) {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword(p);
      expect(validatePassword(pw, p), `${JSON.stringify(p)} → ${pw}`).toBeNull();
      expect(pw).not.toMatch(/[&<>"'\s]/);
    }
  }
});

// ---------- Senha inicial ----------

test("initialPasswordFor nos 4 casos: e-mail, documento, senha padrão e gerada", () => {
  const base = DEFAULT_SETTINGS;
  const withAuth = (auth: Partial<PlatformSettings["auth"]>) => ({ ...base, auth: { ...base.auth, ...auth } });
  const user = { email: "Ana@Exemplo.com", document: "123.456.789-00" };
  expect(initialPasswordFor(user, withAuth({ initialPasswordFrom: "email" }))).toBe("ana@exemplo.com");
  expect(initialPasswordFor(user, withAuth({ initialPasswordFrom: "doc" }))).toBe("12345678900");
  expect(initialPasswordFor(user, withAuth({ initialPasswordFrom: "none", defaultPassword: "senha1" }))).toBe("senha1");
  const strong = withAuth({ initialPasswordFrom: "none", defaultPassword: null, requireStrongPassword: true });
  const generated = initialPasswordFor(user, strong);
  expect(validatePassword(generated, getPasswordPolicy(strong))).toBeNull();
  expect(initialPasswordFor(user, strong)).not.toBe(generated);
  // Sem documento, "doc" cai na senha padrão.
  expect(initialPasswordFor({ email: "a@b.com", document: null }, withAuth({ initialPasswordFrom: "doc", defaultPassword: "pad123" }))).toBe("pad123");
});

// ---------- Formulário de autenticação ----------

test("parseAuthForm: valores válidos viram o patch de auth", () => {
  expect(parseAuthForm(fd({ ...AUTH_OK, defaultPassword: "  Nova123! " }))).toEqual({
    auth: {
      requireStrongPassword: true,
      level: "padrao",
      minLength: 8,
      special: 1,
      upper: 1,
      lower: 1,
      digits: 1,
      letters: 0,
      initialPasswordFrom: "none",
      defaultPassword: "Nova123!",
    },
  });
  expect(parseAuthForm(fd(AUTH_OK)).auth?.defaultPassword).toBeNull();
});

test("parseAuthForm: critérios 0–64, tamanho mínimo ≥ 6, enums e campos forjados recusados", () => {
  expect(() => parseAuthForm(fd({ ...AUTH_OK, minLength: 5 }))).toThrow("O tamanho mínimo precisa ser de 6 a 64 caracteres.");
  expect(() => parseAuthForm(fd({ ...AUTH_OK, minLength: 65 }))).toThrow("O tamanho mínimo precisa ser de 6 a 64 caracteres.");
  for (const k of ["special", "upper", "lower", "digits", "letters"]) {
    expect(() => parseAuthForm(fd({ ...AUTH_OK, [k]: 65 }))).toThrow("Cada critério precisa ser de 0 a 64.");
    expect(() => parseAuthForm(fd({ ...AUTH_OK, [k]: -1 }))).toThrow("Cada critério precisa ser de 0 a 64.");
    expect(() => parseAuthForm(fd({ ...AUTH_OK, [k]: "1.5" }))).toThrow("Cada critério precisa ser de 0 a 64.");
  }
  expect(() => parseAuthForm(fd({ ...AUTH_OK, level: "xx" }))).toThrow("Requisição inválida.");
  expect(() => parseAuthForm(fd({ ...AUTH_OK, initialPasswordFrom: "cpf" }))).toThrow("Requisição inválida.");
  expect(() => parseAuthForm(fd({ ...AUTH_OK, requireStrongPassword: "sim" }))).toThrow("Requisição inválida.");
  expect(() => parseAuthForm(fd({ ...AUTH_OK, defaultPassword: "x".repeat(129) }))).toThrow("A senha padrão pode ter até 128 caracteres.");
  expect(() => parseAuthForm(fd({ ...AUTH_OK, requireStrongPassword: "0", defaultPassword: "12345" }))).toThrow("A senha padrão precisa ter pelo menos 6 caracteres.");
});

test("senha padrão precisa atender aos critérios quando a senha forte está ligada", () => {
  expect(() => parseAuthForm(fd({ ...AUTH_OK, defaultPassword: "123456" }))).toThrow(/^A senha padrão precisa ter pelo menos/);
  expect(parseAuthForm(fd({ ...AUTH_OK, defaultPassword: "Abcdef1!" })).auth?.defaultPassword).toBe("Abcdef1!");
  expect(parseAuthForm(fd({ ...AUTH_OK, requireStrongPassword: "0", defaultPassword: "123456" })).auth?.defaultPassword).toBe("123456");
});

// ---------- Formulários de e-mail ----------

test("parseEmailAppearanceForm: cores #hex, altura 10–120, e-mail de resposta válido, assinatura ≤ 500", () => {
  expect(parseEmailAppearanceForm(fd(APPEARANCE_OK))).toEqual({
    emails: {
      colors: { page: "#fafafb", content: "#ffffff", text: "#212121", footer: "#212121", link: "#0c92f0" },
      logoUrl: null,
      logoHeight: 35,
      senderName: "Minha Escola",
      replyTo: "contato@escola.com",
      signature: "Equipe Minha Escola",
    },
  });
  expect(parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, logoHeight: "", senderName: "", replyTo: "", signature: "" })).emails).toMatchObject({
    logoHeight: 35,
    senderName: null,
    replyTo: null,
    signature: null,
  });
  expect(() => parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, colorLink: "azul" }))).toThrow("Cor inválida.");
  expect(() => parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, colorText: "" }))).toThrow("Informe uma cor.");
  expect(() => parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, logoHeight: "9" }))).toThrow("Informe uma altura de 10 a 120 px.");
  expect(() => parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, logoHeight: "121" }))).toThrow("Informe uma altura de 10 a 120 px.");
  expect(() => parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, replyTo: "nada" }))).toThrow("Informe um e-mail de resposta válido.");
  expect(() => parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, signature: "x".repeat(501) }))).toThrow("A assinatura pode ter até 500 caracteres.");
  expect(() => parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, logoUrl: "javascript:alert(1)" }))).toThrow("Endereço de imagem inválido.");
  expect(parseEmailAppearanceForm(fd({ ...APPEARANCE_OK, logoUrl: "/media/12" })).emails?.logoUrl).toBe("/media/12");
});

test("parseEmailTemplateForm: mensagem ≤ 5000; fixo só ativa/desativa; modelo desconhecido recusado", () => {
  expect(parseEmailTemplateForm(fd({ template: "venda", enabled: "1", message: "  Oi!\nTudo bem? ", oneClickButton: "0" }))).toEqual({
    emails: { templates: { venda: { enabled: true, message: "Oi!\nTudo bem?", oneClickButton: false } } },
  });
  expect(parseEmailTemplateForm(fd({ template: "gratis", enabled: "0", message: "   ", oneClickButton: "1" }))).toEqual({
    emails: { templates: { gratis: { enabled: false, message: null, oneClickButton: true } } },
  });
  expect(() => parseEmailTemplateForm(fd({ template: "venda", enabled: "1", message: "x".repeat(5001), oneClickButton: "1" }))).toThrow(
    "A mensagem pode ter até 5000 caracteres.",
  );
  expect(parseEmailTemplateForm(fd({ template: "novoacesso", enabled: "0", oneClickButton: "1", message: "ignorado" }))).toEqual({
    emails: { templates: { novoacesso: { enabled: false, oneClickButton: true } } },
  });
  expect(() => parseEmailTemplateForm(fd({ template: "recuperacao", enabled: "1", oneClickButton: "1" }))).toThrow("Requisição inválida.");
});

// ---------- Actions ----------

test("actions salvam (e só admin)", async () => {
  expect(await authActions.saveAuthSettingsAction(fd({ ...AUTH_OK, defaultPassword: "Abcdef1!" }))).toEqual({ ok: true });
  expect(await emailActions.saveEmailAppearanceAction(fd({ ...APPEARANCE_OK, colorLink: "#FF005C" }))).toEqual({ ok: true });
  expect(await emailActions.saveEmailTemplateAction(fd({ template: "importacao", enabled: "0", message: "Olá", oneClickButton: "1" }))).toEqual({
    ok: true,
  });
  const s = await getPlatformSettings(db);
  expect(s.auth).toMatchObject({ requireStrongPassword: true, defaultPassword: "Abcdef1!" });
  expect(s.emails.colors.link).toBe("#ff005c");
  expect(s.emails.senderName).toBe("Minha Escola");
  expect(s.emails.templates.importacao).toEqual({ enabled: false, message: "Olá", oneClickButton: true });
  expect(s.emails.templates.venda).toEqual(DEFAULT_SETTINGS.emails.templates.venda);
  expect(getPasswordPolicy(s).strong).toBe(true);

  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  for (const user of [student, null]) {
    session.user = user;
    const denied = { ok: false, error: "Acesso restrito a administradores." };
    expect(await authActions.saveAuthSettingsAction(fd(AUTH_OK))).toEqual(denied);
    expect(await emailActions.saveEmailAppearanceAction(fd(APPEARANCE_OK))).toEqual(denied);
    expect(await emailActions.saveEmailTemplateAction(fd({ template: "venda", enabled: "1", message: "", oneClickButton: "1" }))).toEqual(denied);
  }
  const [after] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  expect(after).toEqual(row);
});

// ---------- Prévia ----------

const previewUrl = (template: string, query = "") => `http://localhost/dashboard/settings/emails/preview/${template}${query}`;
const ctx = (template: string) => ({ params: Promise.resolve({ template }) });

test("rota de prévia exige admin", async () => {
  for (const user of [student, null]) {
    session.user = user;
    const res = await previewGet(new NextRequest(previewUrl("venda")), ctx("venda"));
    expect(res.status).toBe(404);
    const post = await previewPost(new NextRequest(previewUrl("venda"), { method: "POST", body: "{}" }), ctx("venda"));
    expect(post.status).toBe(404);
  }
});

test("prévia renderiza com dados de exemplo e o rascunho passa por resolvePlatformSettings", async () => {
  const res = await previewGet(new NextRequest(previewUrl("importacao")), ctx("importacao"));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain("Olá, Fulano");
  expect(html).toContain("Obrigado pela sua compra, seja muito bem vindo(a)!");

  const draft = {
    emails: {
      colors: { link: "#123abc", text: "javascript:evil" },
      signature: "Equipe Rascunho",
      templates: { importacao: { enabled: false, message: "Mensagem <b>do rascunho</b>", oneClickButton: false } },
    },
  };
  const post = await previewPost(new NextRequest(previewUrl("importacao"), { method: "POST", body: JSON.stringify(draft) }), ctx("importacao"));
  expect(post.status).toBe(200);
  const p = await post.text();
  expect(p).toContain("Mensagem &lt;b&gt;do rascunho&lt;/b&gt;");
  expect(p).toContain("#123abc");
  expect(p).not.toContain("javascript:evil");
  expect(p).toContain("Equipe Rascunho");
  expect(p).not.toContain("clicando aqui");
  // Desativado no rascunho: a prévia mostra o e-mail mesmo assim (a gaveta avisa que está desligado).
  const q = await previewGet(new NextRequest(previewUrl("venda", `?draft=${encodeURIComponent(JSON.stringify({ emails: { signature: "Pela query" } }))}`)), ctx("venda"));
  expect(await q.text()).toContain("Pela query");
  // Nada foi gravado.
  expect(await db.select().from(platformSettings)).toHaveLength(0);
  expect(await db.select().from(emailOutbox)).toHaveLength(0);

  expect((await previewGet(new NextRequest(previewUrl("recuperacao")), ctx("recuperacao"))).status).toBe(404);
  expect((await previewGet(new NextRequest(previewUrl("novoacesso")), ctx("novoacesso"))).status).toBe(404);
  const bad = await previewPost(new NextRequest(previewUrl("venda"), { method: "POST", body: "{nada" }), ctx("venda"));
  expect(bad.status).toBe(400);
});

// ---------- Aviso da fila ----------

test("aviso da tela de e-mails: sem chave, chave recusada, e-mails perdidos, tudo certo", () => {
  const ok = { queued: 0, failed: 0, dead: 0, lastError: null, keyConfigured: true };
  expect(emailHealthNotice(ok)).toBeNull();
  expect(emailHealthNotice({ ...ok, queued: 3 })).toBeNull();
  expect(emailHealthNotice({ ...ok, keyConfigured: false, queued: 2 })).toEqual({
    tone: "warning",
    text: "O envio de e-mails não está configurado. 2 e-mails aguardam na fila e saem assim que a chave do Brevo for definida.",
  });
  expect(emailHealthNotice({ ...ok, keyConfigured: false })).toEqual({
    tone: "warning",
    text: "O envio de e-mails não está configurado. Os e-mails ficam na fila até a chave do Brevo ser definida.",
  });
  expect(emailHealthNotice({ ...ok, failed: 4, lastError: INVALID_KEY_ERROR })).toEqual({
    tone: "danger",
    text: "A chave do Brevo foi recusada. 4 e-mails aguardam na fila até ela ser corrigida.",
  });
  expect(emailHealthNotice({ ...ok, dead: 1 })).toEqual({ tone: "danger", text: "1 e-mail não foi enviado depois de 5 tentativas." });
  expect(emailHealthNotice({ ...ok, dead: 3 })).toEqual({ tone: "danger", text: "3 e-mails não foram enviados depois de 5 tentativas." });
});
