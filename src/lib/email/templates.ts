import type { PlatformSettings } from "@/lib/settings";
import { DEFAULT_MESSAGES, FIXED_MESSAGES, SUBJECTS, type EmailTemplateKey } from "./defaults";
import { credentialsTable, escapeHtml, link, renderLayout, textToHtml, type EmailColors } from "./layout";

export type EmailVars = {
  nome: string;
  email: string;
  senha?: string;
  linkAcesso?: string;
  linkRedefinicao?: string;
  produto?: string;
};
export type RenderContext = { settings: PlatformSettings; appUrl: string; now: Date };

const TZ = "America/Sao_Paulo";
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Sexta-feira - 12h25, 16 de Outubro" no fuso de São Paulo (rodapé). */
export function formatSentAt(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return `${capitalize(parts.weekday)} - ${parts.hour}h${parts.minute}, ${parts.day} de ${capitalize(parts.month)}`;
}

function firstName(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome.trim();
}

/** URL absoluta http(s) (a logo pode ser um caminho do próprio site, como `/media/9`). */
function absoluteUrl(url: string, base: string): string | null {
  try {
    const u = new URL(url, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Fecho comum: ajuda com o e-mail de contato e "Att." + assinatura. */
function closing(settings: PlatformSettings, colors: EmailColors): string {
  const { replyTo, signature } = settings.emails;
  const help = replyTo
    ? `<br><br>\n\tSe precisar de qualquer ajuda, sinta-se à vontade para entrar em contato pelo email: ${link(`mailto:${replyTo}`, replyTo, colors)}\n`
    : "";
  return `${help}<br><br>\n\tAtt.${signature ? `<br>${textToHtml(signature)}` : ""}`;
}

/** Bloco "Usuário/Senha" em tabela (convite do painel). */
function accessBlock(vars: EmailVars, url: string, colors: EmailColors, oneClick: string | null): string {
  const rows: [string, string][] = [["Usuário:", vars.email]];
  if (vars.senha !== undefined) rows.push(["Senha:", vars.senha]);
  let html = `<br><br>\n\tAcesse ${link(url, url, colors)} utilizando os dados abaixo:\n\t<br><br>\n\t${credentialsTable(rows, colors)}\n\t<br>`;
  if (oneClick) html += `\n\t${link(oneClick, "Ou clique aqui e acesse agora", colors, ' class="button"')}`;
  return html;
}

/**
 * Bloco de acesso centralizado do e-mail novo (venda/importação/grátis): "Faça login
 * automaticamente clicando aqui", "ou acesse {url}", "use seu email:", "e sua senha:" em destaque.
 */
function centeredAccessBlock(vars: EmailVars, url: string, colors: EmailColors, oneClick: string | null): string {
  const strong = (s: string) => `<b style="color: ${colors.link};">${escapeHtml(s)}</b>`;
  const parts: string[] = [];
  if (oneClick) {
    parts.push(`<b>Faça login automaticamente ${link(oneClick, "clicando aqui", colors, ' class="button"')}</b><br>\n\tou acesse ${link(url, url, colors)}`);
  } else {
    parts.push(`Acesse ${link(url, url, colors)}`);
  }
  parts.push(`use seu email:<br>\n\t${strong(vars.email)}`);
  if (vars.senha !== undefined) {
    parts.push(
      `e sua senha:<br>\n\t<div style="font-size: 32px; line-height: 44px; font-weight: bold; letter-spacing: 2px; margin: 4px 0;">${escapeHtml(vars.senha)}</div>`,
    );
  }
  const body = parts.join("\n\t<br><br>\n\t") + `${vars.senha !== undefined ? "" : "<br>"}\n\tpara fazer login agora.`;
  return `<br><br>\n\t<div style="text-align: center;">\n\t${body}\n\t</div>`;
}

/**
 * Renderiza um modelo de e-mail com o layout padrão. Null quando o modelo está desativado
 * (só os editáveis e `novoacesso` podem ser desativados). Todo valor variável é escapado.
 */
export function renderEmail(key: EmailTemplateKey, vars: EmailVars, ctx: RenderContext): { subject: string; html: string } | null {
  const { settings, appUrl, now } = ctx;
  const e = settings.emails;
  const colors = e.colors;
  const base = appUrl.replace(/\/+$/, "");
  const loginUrl = vars.linkAcesso ?? `${base}/auth/login`;
  let body: string;

  switch (key) {
    case "venda":
    case "importacao":
    case "gratis": {
      const t = e.templates[key];
      if (!t.enabled) return null;
      body = textToHtml(t.message ?? DEFAULT_MESSAGES[key]) + centeredAccessBlock(vars, base, colors, t.oneClickButton ? loginUrl : null);
      break;
    }
    case "novoacesso":
      if (!e.templates.novoacesso.enabled) return null;
      // Sem o botão de um clique, o link leva à tela de login (sem entrar direto).
      body = `${textToHtml(FIXED_MESSAGES.novoacesso(vars.produto ?? ""))}\n\t<br><br>\n\t${link(
        e.templates.novoacesso.oneClickButton ? loginUrl : `${base}/auth/login`,
        "Clique aqui e acesse agora",
        colors,
        ' class="button"',
      )}`;
      break;
    case "recuperacao":
      body = `${textToHtml(FIXED_MESSAGES.recuperacao)}\n\t<br><br>\n\t${link(vars.linkRedefinicao ?? `${base}/auth/login`, "Clique aqui e defina sua nova senha", colors, ' class="button"')}`;
      break;
    case "convite-admin":
      // Duas formas: cadastro novo (usuário + senha gerada) ou promovido (usuário + link de redefinição).
      body = textToHtml(FIXED_MESSAGES["convite-admin"]) + accessBlock(vars, `${base}/dashboard`, colors, null);
      if (vars.senha === undefined && vars.linkRedefinicao) {
        body += `\n\t${textToHtml(FIXED_MESSAGES["convite-admin-senha-atual"])}\n\t<br><br>\n\t${link(vars.linkRedefinicao, "Clique aqui e defina uma nova senha", colors, ' class="button"')}`;
      }
      break;
    case "novo-link":
      body = `${textToHtml(FIXED_MESSAGES["novo-link"])}\n\t<br><br>\n\t${link(loginUrl, "Clique aqui e acesse agora", colors, ' class="button"')}`;
      break;
  }

  // Só a logo escolhida em Aparência dos e-mails; sem ela, nada no topo (a do site não entra).
  const logo = e.logoUrl;
  const html = renderLayout({
    colors,
    logoSrc: logo ? absoluteUrl(logo, `${base}/`) : null,
    logoHeight: e.logoHeight,
    siteName: settings.siteName,
    firstName: firstName(vars.nome),
    bodyHtml: body + closing(settings, colors),
    domain: hostOf(base),
    sentAt: formatSentAt(now),
  });
  return { subject: SUBJECTS[key], html };
}

