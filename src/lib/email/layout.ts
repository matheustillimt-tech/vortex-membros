import type { EmailSettings } from "@/lib/settings";

/** Escapa texto para HTML (conteúdo e atributos). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texto escapado com quebras de linha viradas em `<br>`. */
export function textToHtml(value: string): string {
  return escapeHtml(value.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
}

export type EmailColors = EmailSettings["colors"];

/** Link com a cor das configurações (inline: muitos clientes de e-mail ignoram o `<style>`). */
export function link(href: string, label: string, colors: EmailColors, extra = ""): string {
  // Só http(s) e mailto: um `javascript:` vindo de um chamador vira "#".
  const safe = /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : "#";
  return `<a href="${escapeHtml(safe)}"${extra} style="color: ${colors.link}; text-decoration: none;">${escapeHtml(label)}</a>`;
}

/** Tabela "Usuário / Senha" (células `.info`). */
export function credentialsTable(rows: [string, string][], colors: EmailColors): string {
  const info = `background:${colors.page}; padding:5px 10px; font-weight: bold; letter-spacing: 1px;`;
  const cells = rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="info" style="${info}">${escapeHtml(v)}</td></tr>`).join("");
  return `<table style="border-radius: 8px; padding:20px; width:100%; border:1px solid ${colors.page};">${cells}</table>`;
}

export type LayoutInput = {
  colors: EmailColors;
  /** URL absoluta da logo; null = sem cabeçalho (o "Olá" fica no topo). */
  logoSrc: string | null;
  logoHeight: number;
  siteName: string;
  firstName: string;
  /** Corpo já em HTML (montado com os helpers acima, tudo escapado). */
  bodyHtml: string;
  domain: string;
  sentAt: string;
};

/**
 * Estrutura do e-mail: tabela de 600px com cantos de
 * 16px sobre a cor "página", logo, "Olá {primeiro nome}", corpo e rodapé de 12px com domínio e data.
 */
export function renderLayout(i: LayoutInput): string {
  const c = i.colors;
  const header = i.logoSrc
    ? `<tr>
						<td align="left" style="padding: 40px;">
							<img loading="lazy" decoding="async" width="auto" height="${i.logoHeight}" style="height: ${i.logoHeight}px;" src="${escapeHtml(i.logoSrc)}" alt="${escapeHtml(i.siteName)}" />
						</td>
					</tr>
					`
    : "";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="ie=edge">
	<style>
        .content a {
            color: ${c.link};
            text-decoration: none;
        }
        .content a:hover{
            text-decoration: underline;
        }
        .content table{
            border-radius: 8px;
            padding:20px;
            width:100%;
            border:1px solid ${c.page};
        }
        .content table .info{
            background:${c.page};
            padding:5px 10px;
            font-weight: bold;
            letter-spacing: 1px;
        }
	</style>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; background-color: ${c.page}; color: ${c.text};">
	<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${c.page}; padding: 40px 0;">
		<tr>
			<td align="center">
				<table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: ${c.content}; border-radius: 16px; width: 100%; max-width: 600px;">
					${header}<tr>
						<td class="content" style="padding: ${i.logoSrc ? "0" : "40px"} 40px 40px; font-size: 16px; line-height: 24px; color: ${c.text};">
							<h1 style="font-size: 20px; margin: 0; padding: 0 0 20px 0;">
									Olá, ${escapeHtml(i.firstName)}
							</h1>
	${i.bodyHtml}
						</td>
					</tr>
				</table>
			</td>
		</tr>
		<tr>
			<td align="center" style="padding: 20px 0;">
				<table border="0" cellpadding="0" cellspacing="0" width="600" style="width: 100%; max-width: 600px;">
					<tr>
						<td align="center" style="font-size: 12px; line-height: 20px; color: ${c.footer}; text-align: center;">
							Este e-mail está relacionado a seu acesso em: <b>${escapeHtml(i.domain)}</b>
							<br>
							Não responda esta mensagem, ela foi enviada de forma automática através de nossos servidores.<br><br><small>Enviado - ${escapeHtml(i.sentAt)}</small>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>
`;
}
