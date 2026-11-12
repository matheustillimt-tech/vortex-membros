import { expect, test } from "vitest";
import { renderEmail, formatSentAt } from "@/lib/email/templates";
import { DEFAULT_MESSAGES, MIGRATION_MESSAGE } from "@/lib/email/defaults";
import { DEFAULT_SETTINGS, resolvePlatformSettings, type PlatformSettings } from "@/lib/settings";

const now = new Date("2026-10-16T15:25:00Z");
const appUrl = "https://areadoaluno.exemplo.com";
const vars = { nome: "Fulano de Tal", email: "fulano@exemplo.com", senha: "123456", linkAcesso: `${appUrl}/auth/token?login_token=abc` };

function withEmails(patch: Record<string, unknown>): PlatformSettings {
  return resolvePlatformSettings({ emails: patch });
}
const ctx = (settings: PlatformSettings = DEFAULT_SETTINGS) => ({ settings, appUrl, now });

test("padrões das configurações de e-mail", () => {
  const e = DEFAULT_SETTINGS.emails;
  expect(e.colors).toEqual({ page: "#fafafb", content: "#ffffff", text: "#212121", footer: "#212121", link: "#0c92f0" });
  expect(e.logoHeight).toBe(35);
  expect(e.templates.venda).toEqual({ enabled: true, message: null, oneClickButton: true });
  expect(e.templates.novoacesso).toEqual({ enabled: true, oneClickButton: true });
});

test("configurações inválidas voltam ao padrão", () => {
  const s = withEmails({ colors: { page: "red;background:url(x)", link: "#123abc" }, logoHeight: 9999, replyTo: "não é e-mail", logoUrl: "javascript:alert(1)" });
  expect(s.emails.colors.page).toBe("#fafafb");
  expect(s.emails.colors.link).toBe("#123abc");
  expect(s.emails.logoHeight).toBe(35);
  expect(s.emails.replyTo).toBeNull();
  expect(s.emails.logoUrl).toBeNull();
});

test("venda com mensagem null usa o texto padrão e o layout padrão", () => {
  const r = renderEmail("venda", vars, ctx())!;
  expect(r.subject).toBe("Seus dados de acesso");
  expect(r.html).toContain("Obrigado pela sua compra, seja muito bem vindo(a)!<br><br>Abaixo você encontra os seus dados de acesso");
  expect(r.html).toContain("Olá, Fulano");
  expect(r.html).not.toContain("Olá, Fulano de Tal");
  // Bloco centralizado do e-mail novo: login automático primeiro, depois o acesso normal.
  expect(r.html).toContain(`<b>Faça login automaticamente <a href="${appUrl}/auth/token?login_token=abc" class="button"`);
  expect(r.html).toContain(`ou acesse <a href="${appUrl}"`);
  expect(r.html).toContain("use seu email:");
  expect(r.html).toContain(">fulano@exemplo.com</b>");
  expect(r.html).toMatch(/e sua senha:<br>\s*<div style="font-size: 32px;[^"]*">123456<\/div>/);
  expect(r.html).toContain("para fazer login agora.");
  expect(r.html).not.toContain("Usuário:");
  expect(r.html).toContain('width="600"');
  expect(r.html).toContain("border-radius: 16px");
  expect(r.html).toContain("background-color: #fafafb");
  expect(r.html).toContain("<b>areadoaluno.exemplo.com</b>");
  expect(r.html).toContain("Não responda esta mensagem, ela foi enviada de forma automática através de nossos servidores.");
  expect(r.html).toContain("Att.");
});

test("importação e grátis têm os textos padrão próprios", () => {
  expect(DEFAULT_MESSAGES.importacao).toBe(DEFAULT_MESSAGES.venda);
  expect(MIGRATION_MESSAGE).toContain("migrado para uma nova plataforma");
  expect(renderEmail("gratis", vars, ctx())!.html).toContain("Obrigado por se cadastrar!");
});

test("mensagem personalizada substitui o padrão e é escapada", () => {
  const s = withEmails({ templates: { venda: { message: "Oi!\n<script>alert(1)</script>" } } });
  const r = renderEmail("venda", vars, ctx(s))!;
  expect(r.html).not.toContain("Obrigado pela sua compra");
  expect(r.html).not.toContain("<script>");
  expect(r.html).toContain("Oi!<br>&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("valores das variáveis são escapados", () => {
  const r = renderEmail("venda", { ...vars, nome: '<img src=x onerror="y">', senha: "a<b" }, ctx())!;
  expect(r.html).not.toContain("<img src=x");
  expect(r.html).toContain("a&lt;b");
});

test("sem senha (aluno que já tinha cadastro): sem o bloco da senha", () => {
  const html = renderEmail("venda", { ...vars, senha: undefined }, ctx())!.html;
  expect(html).toContain("use seu email:");
  expect(html).not.toContain("e sua senha:");
  expect(html).toContain("para fazer login agora.");
});

test("modelo desativado → null; fixos de segurança nunca", () => {
  const s = withEmails({ templates: { venda: { enabled: false }, novoacesso: { enabled: false } } });
  expect(renderEmail("venda", vars, ctx(s))).toBeNull();
  expect(renderEmail("novoacesso", { ...vars, produto: "Curso" }, ctx(s))).toBeNull();
  const forced = resolvePlatformSettings({ emails: { templates: { recuperacao: { enabled: false } } } });
  const link = `${appUrl}/auth/redefinir-senha/tok123`;
  const r = renderEmail("recuperacao", { nome: "Fulano", email: "f@x.com", linkRedefinicao: link }, ctx(forced));
  expect(r).not.toBeNull();
  expect(r!.subject).toBe("Recuperação de senha");
  expect(r!.html).toContain(`href="${link}"`);
  expect(r!.html).toContain("O link vale por 1 hora.");
  expect(r!.html).not.toContain("Usuário:");
});

test("botão de um clique some quando desligado", () => {
  const s = withEmails({ templates: { venda: { oneClickButton: false } } });
  const html = renderEmail("venda", vars, ctx(s))!.html;
  expect(html).not.toContain("clicando aqui");
  expect(html).not.toContain("login_token");
  expect(html).toContain(`Acesse <a href="${appUrl}"`);
});

test("aparência: cores, logo, contato e assinatura", () => {
  const s = withEmails({
    colors: { page: "#000001", content: "#000002", text: "#000003", footer: "#000004", link: "#000005" },
    logoUrl: "/media/9", logoHeight: 50, replyTo: "ajuda@exemplo.com", signature: "Equipe <Escola>",
  });
  const html = renderEmail("venda", vars, ctx(s))!.html;
  for (const c of ["#000001", "#000002", "#000003", "#000004", "#000005"]) expect(html).toContain(c);
  expect(html).toContain(`src="${appUrl}/media/9"`);
  expect(html).toContain('height="50"');
  expect(html).toContain('href="mailto:ajuda@exemplo.com"');
  expect(html).toContain("Att.<br>Equipe &lt;Escola&gt;");
});

test("sem logo nos e-mails: não usa a do site e o texto começa no topo", () => {
  const s = resolvePlatformSettings({ logoUrl: "/media/7", emails: {} });
  const html = renderEmail("recuperacao", vars, ctx(s))!.html;
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<strong");
  expect(html).toContain('class="content" style="padding: 40px 40px 40px;');
});

test("data formatada em America/Sao_Paulo", () => {
  expect(formatSentAt(now)).toBe("Sexta-feira - 12h25, 16 de Outubro");
  expect(renderEmail("venda", vars, ctx())!.html).toContain("<small>Enviado - Sexta-feira - 12h25, 16 de Outubro</small>");
});

test("fixos: assuntos e textos", () => {
  const c = ctx();
  expect(renderEmail("novoacesso", { ...vars, produto: "Curso <X>" }, c)).toMatchObject({ subject: "Novo acesso liberado" });
  expect(renderEmail("novoacesso", { ...vars, produto: "Curso <X>" }, c)!.html).toContain("Um novo acesso foi liberado para você: Curso &lt;X&gt;.");
  expect(renderEmail("convite-admin", vars, c)).toMatchObject({ subject: "Seu acesso ao painel" });
  expect(renderEmail("convite-admin", vars, c)!.html).toContain(`${appUrl}/dashboard`);
  // Promovido (já tinha cadastro): sem senha, com o link para definir uma nova.
  const promo = renderEmail("convite-admin", { nome: "Ana", email: "ana@x.com", linkRedefinicao: `${appUrl}/auth/recuperar_senha/tok` }, c)!.html;
  expect(promo).not.toContain("Senha:");
  expect(promo).toContain("Use a senha que você já tem");
  expect(promo).toContain(`href="${appUrl}/auth/recuperar_senha/tok"`);
  expect(promo).toContain("Clique aqui e defina uma nova senha");
  expect(promo).toContain(`${appUrl}/dashboard`);
  const nl = renderEmail("novo-link", vars, c)!;
  expect(nl.subject).toBe("Seu novo link de acesso");
  expect(nl.html).toContain("Aqui está o seu novo link de acesso:");
  expect(nl.html).toContain(`href="${appUrl}/auth/token?login_token=abc"`);
});

test("novoacesso: sem o botão de um clique, o link leva à tela de login", () => {
  const on = renderEmail("novoacesso", { nome: "Ana", email: "a@x.com", produto: "Curso", linkAcesso: "https://x.com/auth/login?login_token=T" }, {
    settings: DEFAULT_SETTINGS, appUrl: "https://x.com", now: new Date(),
  });
  expect(on?.html).toContain("login_token=T");
  const off = renderEmail("novoacesso", { nome: "Ana", email: "a@x.com", produto: "Curso", linkAcesso: "https://x.com/auth/login?login_token=T" }, {
    settings: withEmails({ templates: { novoacesso: { enabled: true, oneClickButton: false } } }), appUrl: "https://x.com", now: new Date(),
  });
  expect(off?.html).not.toContain("login_token=T");
  expect(off?.html).toContain('href="https://x.com/auth/login"');
});
