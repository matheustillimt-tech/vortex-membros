import type { DeepPartial } from "@/db/schema";
import { parseEditorData, type EditorData } from "@/lib/content/editorjs";
import { validatePassword } from "@/lib/auth/password-policy";
import { DEFAULT_PASSWORD_MAX, PASSWORD_CRITERIA_MAX, PASSWORD_MIN_LENGTH_MIN, type PlatformSettings } from "@/lib/settings";
import { SHARE_DESCRIPTION_MAX, SHARE_TITLE_MAX } from "@/lib/sharing-limits";
import { safeHttpUrl } from "@/lib/theme";
import { AdminError } from "./errors";
import { bool, field, INVALID, oneOf, parseHexColor, url } from "./product-settings";

/**
 * Formulários de Configurações › Personalização (Área do aluno, Telas de acesso, Painel administrativo):
 * FormData → patch parcial de PlatformSettings, validado no servidor. Cores só #hex, imagens só
 * "/media/<id>" (upload) ou https, links http(s), números com limites, enums em lista branca.
 * Campo ausente/forjado → "Requisição inválida.".
 */

export type SettingsPatch = DeepPartial<PlatformSettings>;

const MAX_SITE_NAME = 120;
const IMAGE_MESSAGE = "Endereço de imagem inválido.";
const LINK_MESSAGE = "Informe um link válido (http ou https).";

/** Imagem enviada pelo painel (/media/<id>) ou https. */
export function checkImageUrl(v: string): string | null {
  if (/^\/media\/\d{1,15}$/.test(v)) return v;
  const ok = safeHttpUrl(v);
  return ok && ok.startsWith("https://") ? ok : null;
}

function image(fd: FormData, name: string): string | null {
  return url(fd, name, checkImageUrl, IMAGE_MESSAGE);
}

function requiredColor(fd: FormData, name: string): string {
  const c = parseHexColor(field(fd, name));
  if (!c) throw new AdminError("Informe uma cor.");
  return c;
}

/** Link opcional ligado por um toggle: desligado → null; ligado exige o link. */
function toggledLink(fd: FormData, toggle: string, name: string, missing: string): string | null {
  if (!bool(fd, toggle)) return null;
  const v = url(fd, name, safeHttpUrl, LINK_MESSAGE);
  if (!v) throw new AdminError(missing);
  return v;
}

/** Área do aluno › Geral: título das páginas. */
export function parseStudentGeneralForm(fd: FormData): SettingsPatch {
  const siteName = field(fd, "siteName").trim();
  if (!siteName) throw new AdminError("Informe o título das páginas.");
  if (siteName.length > MAX_SITE_NAME) throw new AdminError("Título muito longo.");
  return { siteName, showcaseAutoScroll: bool(fd, "showcaseAutoScroll") };
}

/** Configurações › Compartilhamento. Recomendado: até 60/160 caracteres; aqui o teto é o dobro. */
export function parseSharingForm(fd: FormData): SettingsPatch {
  const title = field(fd, "shareTitle").trim();
  const description = field(fd, "shareDescription").replace(/\s+/g, " ").trim();
  if (title.length > SHARE_TITLE_MAX) throw new AdminError("Título muito longo.");
  if (description.length > SHARE_DESCRIPTION_MAX) throw new AdminError("Descrição muito longa.");
  return { sharing: { title, description, imageUrl: image(fd, "shareImageUrl") } };
}

/** Área do aluno › Aparência. */
export function parseStudentAppearanceForm(fd: FormData): SettingsPatch {
  return {
    accentColor: requiredColor(fd, "accentColor"),
    theme: oneOf(fd, "theme", ["dark", "light"] as const),
    fontSize: oneOf(fd, "fontSize", ["default", "large"] as const),
    logoUrl: image(fd, "logoUrl"),
    faviconUrl: image(fd, "faviconUrl"),
  };
}

/** Área do aluno › Rodapé. */
export function parseStudentFooterForm(fd: FormData): SettingsPatch {
  return {
    footer: {
      show: bool(fd, "footerShow"),
      legalNotice: bool(fd, "legalNotice"),
      termsUrl: toggledLink(fd, "termsOn", "termsUrl", "Informe o link dos termos de uso."),
      privacyUrl: toggledLink(fd, "privacyOn", "privacyUrl", "Informe o link da política de privacidade."),
    },
  };
}

/** Termo de aceite no primeiro acesso: toggle + blocos do editor (ausentes = texto intacto). */
export function parseFirstAccessTermsForm(fd: FormData): { enabled: boolean; blocks: EditorData | null } {
  const enabled = bool(fd, "termsEnabled");
  const raw = fd.get("blocks");
  if (raw === null) return { enabled, blocks: null };
  if (typeof raw !== "string") throw new AdminError(INVALID);
  const blocks = parseEditorData(raw);
  if (!blocks) throw new AdminError(INVALID);
  return { enabled, blocks };
}

/** Telas de acesso (15). Altura vazia = padrão (45 px); cor vazia = segue a área do aluno. */
export function parseAccessScreensForm(fd: FormData): SettingsPatch {
  const rawHeight = field(fd, "logoHeight").trim();
  let logoHeight = 45;
  if (rawHeight !== "") {
    logoHeight = /^\d{1,3}$/.test(rawHeight) ? Number(rawHeight) : NaN;
    if (!(logoHeight >= 20 && logoHeight <= 120)) throw new AdminError("Informe uma altura de 20 a 120 px.");
  }
  return {
    loginScreen: {
      logoUrl: image(fd, "logoUrl"),
      logoAlign: oneOf(fd, "logoAlign", ["left", "center", "right"] as const),
      logoHeight,
      formSide: oneOf(fd, "formSide", ["left", "right"] as const),
      theme: oneOf(fd, "loginTheme", ["area", "light", "dark"] as const),
      accentColor: parseHexColor(field(fd, "accentColor")),
      imageUrl: image(fd, "imageUrl"),
      imagePosition: oneOf(fd, "imagePosition", ["left", "center", "right"] as const),
      panelWidth: oneOf(fd, "panelWidth", ["narrow", "default", "medium", "wide", "extraWide"] as const),
    },
  };
}

/** Painel administrativo (16). */
export function parseAdminAreaForm(fd: FormData): SettingsPatch {
  return {
    adminArea: {
      accentColor: requiredColor(fd, "accentColor"),
      logoUrl: image(fd, "logoUrl"),
      collapsedIconUrl: image(fd, "collapsedIconUrl"),
    },
  };
}

// ---------- Autenticação (18) ----------

const CRITERIA_MESSAGE = `Cada critério precisa ser de 0 a ${PASSWORD_CRITERIA_MAX}.`;
const MIN_LENGTH_MESSAGE = `O tamanho mínimo precisa ser de ${PASSWORD_MIN_LENGTH_MIN} a ${PASSWORD_CRITERIA_MAX} caracteres.`;

function criterion(fd: FormData, name: string, min: number, message: string): number {
  const v = field(fd, name).trim();
  const n = /^\d{1,3}$/.test(v) ? Number(v) : NaN;
  if (!(n >= min && n <= PASSWORD_CRITERIA_MAX)) throw new AdminError(message);
  return n;
}

/** Autenticação › Senhas. Senha padrão vazia = gerar uma senha individual (null). */
export function parseAuthForm(fd: FormData): SettingsPatch {
  const requireStrongPassword = bool(fd, "requireStrongPassword");
  const level = oneOf(fd, "level", ["padrao", "reforcada", "maxima", "personalizada"] as const);
  const criteria = {
    minLength: criterion(fd, "minLength", PASSWORD_MIN_LENGTH_MIN, MIN_LENGTH_MESSAGE),
    special: criterion(fd, "special", 0, CRITERIA_MESSAGE),
    upper: criterion(fd, "upper", 0, CRITERIA_MESSAGE),
    lower: criterion(fd, "lower", 0, CRITERIA_MESSAGE),
    digits: criterion(fd, "digits", 0, CRITERIA_MESSAGE),
    letters: criterion(fd, "letters", 0, CRITERIA_MESSAGE),
  };
  const initialPasswordFrom = oneOf(fd, "initialPasswordFrom", ["none", "email", "doc"] as const);
  const raw = field(fd, "defaultPassword").trim();
  if (raw.length > DEFAULT_PASSWORD_MAX) throw new AdminError(`A senha padrão pode ter até ${DEFAULT_PASSWORD_MAX} caracteres.`);
  const defaultPassword = raw === "" ? null : raw;
  if (defaultPassword) {
    const problem = validatePassword(defaultPassword, { strong: requireStrongPassword, ...criteria });
    if (problem) throw new AdminError(problem.replace(/^A senha/, "A senha padrão"));
  }
  return { auth: { requireStrongPassword, level, ...criteria, initialPasswordFrom, defaultPassword } };
}

// ---------- E-mails ----------

export const EMAIL_LOGO_MIN = 10;
export const EMAIL_LOGO_MAX = 120;
export const MAX_SIGNATURE = 500;
export const MAX_EMAIL_MESSAGE = 5000;
const MAX_SENDER_NAME = 100;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"'.]+(\.[^\s@<>"'.]+)+$/;

function optionalText(fd: FormData, name: string, max: number, message: string): string | null {
  const v = field(fd, name).trim();
  if (v.length > max) throw new AdminError(message);
  return v === "" ? null : v;
}

/** Gaveta "Aparência dos e-mails": cores, logo, altura, remetente, resposta e assinatura. */
export function parseEmailAppearanceForm(fd: FormData): SettingsPatch {
  const color = (name: string) => requiredColor(fd, name).toLowerCase();
  const rawHeight = field(fd, "logoHeight").trim();
  let logoHeight = 35;
  if (rawHeight !== "") {
    logoHeight = /^\d{1,3}$/.test(rawHeight) ? Number(rawHeight) : NaN;
    if (!(logoHeight >= EMAIL_LOGO_MIN && logoHeight <= EMAIL_LOGO_MAX)) {
      throw new AdminError(`Informe uma altura de ${EMAIL_LOGO_MIN} a ${EMAIL_LOGO_MAX} px.`);
    }
  }
  const replyTo = optionalText(fd, "replyTo", 254, "Informe um e-mail de resposta válido.");
  if (replyTo && !EMAIL_RE.test(replyTo)) throw new AdminError("Informe um e-mail de resposta válido.");
  return {
    emails: {
      colors: {
        page: color("colorPage"),
        content: color("colorContent"),
        text: color("colorText"),
        footer: color("colorFooter"),
        link: color("colorLink"),
      },
      logoUrl: image(fd, "logoUrl"),
      logoHeight,
      senderName: optionalText(fd, "senderName", MAX_SENDER_NAME, `O nome do remetente pode ter até ${MAX_SENDER_NAME} caracteres.`),
      replyTo: replyTo?.toLowerCase() ?? null,
      signature: optionalText(fd, "signature", MAX_SIGNATURE, `A assinatura pode ter até ${MAX_SIGNATURE} caracteres.`),
    },
  };
}

/** Gaveta de modelo: envio, mensagem (vazia = texto padrão) e botão de um clique. O fixo não tem mensagem. */
export function parseEmailTemplateForm(fd: FormData): SettingsPatch {
  const template = oneOf(fd, "template", ["venda", "importacao", "gratis", "novoacesso"] as const);
  const enabled = bool(fd, "enabled");
  const oneClickButton = bool(fd, "oneClickButton");
  if (template === "novoacesso") return { emails: { templates: { novoacesso: { enabled, oneClickButton } } } };
  const message = optionalText(fd, "message", MAX_EMAIL_MESSAGE, `A mensagem pode ter até ${MAX_EMAIL_MESSAGE} caracteres.`);
  return { emails: { templates: { [template]: { enabled, message: message?.replace(/\r\n?/g, "\n") ?? null, oneClickButton } } } };
}
