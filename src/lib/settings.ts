import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { platformSettings, type ProductSettings } from "@/db/schema";

export type PlatformSettings = {
  siteName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  accentColor: string;
  theme: "dark" | "light";
  fontSize: "default" | "large";
  footer: {
    show: boolean;
    legalNotice: boolean;
    termsUrl: string | null;
    privacyUrl: string | null;
  };
  menuLinks: { label: string; url: string }[];
  studentProfile: {
    canEditNameAndDocument: boolean;
    canEditEmail: boolean;
    showDocument: boolean;
    showAddress: boolean;
    showPhone: boolean;
  };
  loginScreen: {
    imageUrl: string | null;
    logoUrl: string | null;
    formSide: "left" | "right";
    /** Alinhamento do logo acima do formulário. */
    logoAlign: "left" | "center" | "right";
    /** Altura do logo em px (20–120). */
    logoHeight: number;
    /** "area" = segue o modo da área do aluno. */
    theme: "area" | "light" | "dark";
    /** null = segue a cor de destaque da área do aluno. */
    accentColor: string | null;
    /** Enquadramento da imagem do painel visual. */
    imagePosition: "left" | "center" | "right";
    /** Largura do painel visual (col-sm-2 / 3 / 6). */
    panelWidth: "narrow" | "default" | "medium" | "wide" | "extraWide";
  };
  /**
   * Termo exigido no primeiro acesso à área do aluno (HTML sanitizado; vazio = nada a aceitar).
   * `hash` = versão (sha256 do HTML), calculada ao salvar; null em configurações antigas.
   */
  firstAccessTerms: { enabled: boolean; html: string | null; hash: string | null };
  /** Home: fileiras de vitrine cheias avançam sozinhas, uma capa por vez, e voltam ao início no fim. */
  showcaseAutoScroll: boolean;
  /** Configurações → Compartilhamento: prévia dos links nas redes sociais (vazio = só o nome da plataforma). */
  sharing: { title: string; description: string; imageUrl: string | null };
  /** Identidade do painel administrativo. */
  adminArea: { accentColor: string; logoUrl: string | null; collapsedIconUrl: string | null };
  /** Aparência, remetente e modelos dos e-mails (Configurações → E-mails). */
  emails: EmailSettings;
  /** Configurações → Autenticação › Senhas. */
  auth: AuthSettings;
  /** Webhook da Kiwify (Vendas › Entregas). */
  kiwify: KiwifySettings;
};

export type KiwifySettings = {
  /** Segredo da URL de postback (32 bytes em base64url = 43 caracteres); null até a 1ª abertura de Entregas. */
  webhookSecret: string | null;
  /** Token que a Kiwify mostra ao criar o webhook; preenchido, só aceitamos vendas assinadas com ele. */
  signatureToken: string | null;
  /** IDs de produto do gateway cujas vendas não são processadas (Vendas › Lista de produtos ignorados). */
  ignoredProductIds: string[];
};

export type PasswordLevel = "padrao" | "reforcada" | "maxima" | "personalizada";
export type AuthSettings = {
  /** "Exigir senha forte": aplica os critérios abaixo; desligado, vale só o mínimo de 6 caracteres. */
  requireStrongPassword: boolean;
  level: PasswordLevel;
  minLength: number;
  special: number;
  upper: number;
  lower: number;
  digits: number;
  letters: number;
  /** "Usar um dado do aluno como senha inicial". */
  initialPasswordFrom: "none" | "email" | "doc";
  /** Mesma senha para todos os novos alunos; null = gerar uma senha individual. */
  defaultPassword: string | null;
};

/** Modelos com mensagem editável no painel. */
export type EditableTemplate = "venda" | "importacao" | "gratis";
export type EmailTemplateSettings = { enabled: boolean; message: string | null; oneClickButton: boolean };
export type EmailSettings = {
  colors: { page: string; content: string; text: string; footer: string; link: string };
  logoUrl: string | null;
  logoHeight: number;
  senderName: string | null;
  replyTo: string | null;
  signature: string | null;
  templates: Record<EditableTemplate, EmailTemplateSettings> & { novoacesso: { enabled: boolean; oneClickButton: boolean } };
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  siteName: "Vórtex Membros",
  logoUrl: null,
  faviconUrl: null,
  accentColor: "#ff7500",
  theme: "dark",
  fontSize: "default",
  footer: { show: true, legalNotice: true, termsUrl: null, privacyUrl: null },
  menuLinks: [],
  studentProfile: {
    canEditNameAndDocument: true,
    canEditEmail: false,
    showDocument: true,
    showAddress: true,
    showPhone: true,
  },
  loginScreen: {
    imageUrl: null,
    logoUrl: null,
    formSide: "right",
    logoAlign: "center",
    logoHeight: 45,
    theme: "area",
    accentColor: null,
    imagePosition: "center",
    panelWidth: "wide",
  },
  firstAccessTerms: { enabled: false, html: null, hash: null },
  showcaseAutoScroll: true,
  sharing: { title: "", description: "", imageUrl: null },
  adminArea: { accentColor: "#e91e63", logoUrl: null, collapsedIconUrl: null },
  emails: {
    colors: { page: "#fafafb", content: "#ffffff", text: "#212121", footer: "#212121", link: "#0c92f0" },
    logoUrl: null,
    logoHeight: 35,
    senderName: null,
    replyTo: null,
    signature: null,
    templates: {
      venda: { enabled: true, message: null, oneClickButton: true },
      importacao: { enabled: true, message: null, oneClickButton: true },
      gratis: { enabled: true, message: null, oneClickButton: true },
      novoacesso: { enabled: true, oneClickButton: true },
    },
  },
  auth: {
    requireStrongPassword: false,
    level: "padrao",
    minLength: 8,
    special: 1,
    upper: 1,
    lower: 1,
    digits: 1,
    letters: 0,
    initialPasswordFrom: "none",
    defaultPassword: "123456",
  },
  kiwify: { webhookSecret: null, signatureToken: null, ignoredProductIds: [] },
};

/** Valores aceitos para os campos de lista fechada (caminho com pontos → opções). */
const PLATFORM_ENUMS: Record<string, readonly unknown[]> = {
  theme: ["dark", "light"],
  fontSize: ["default", "large"],
  "loginScreen.formSide": ["left", "right"],
  "loginScreen.logoAlign": ["left", "center", "right"],
  "loginScreen.theme": ["area", "light", "dark"],
  "loginScreen.imagePosition": ["left", "center", "right"],
  "loginScreen.panelWidth": ["narrow", "default", "medium", "wide", "extraWide"],
  "auth.level": ["padrao", "reforcada", "maxima", "personalizada"],
  "auth.initialPasswordFrom": ["none", "email", "doc"],
};
const PRODUCT_ENUMS: Record<string, readonly unknown[]> = {
  listing: ["none", "grid", "list", "timeline", "streaming"],
  thumbnailFormat: ["auto", "original", "16:9", "1:1", "4:5", "4:7"],
  "lesson.navigation": ["simple", "thumbnail"],
};

export const DEFAULT_PRODUCT_SETTINGS: ProductSettings = {
  listing: "streaming",
  modulesAsCarousel: true,
  showModuleTitles: true,
  thumbnailFormat: "4:7",
  showBanner: false,
  bannerUrl: null,
  lesson: {
    theaterMode: false,
    mobileVideoFirst: true,
    showModuleBar: true,
    compactModuleBar: true,
    showLessonNumbers: true,
    showTotalProgress: false,
    showMarkSeenButton: true,
    keepButtonAfterSeen: true,
    autoMarkSeen: false,
    navigation: "simple",
    nextProductId: null,
    nextProductButtonText: null,
  },
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** O valor salvo tem o mesmo tipo do padrão? (padrão null aceita string/número/null; enums em lista branca.) */
function sameShape(base: unknown, value: unknown, allowed: readonly unknown[] | undefined): boolean {
  if (allowed) return allowed.includes(value);
  if (base === null) return value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
  if (typeof base === "number") return typeof value === "number" && Number.isFinite(value);
  if (Array.isArray(base)) return Array.isArray(value);
  return typeof value === typeof base;
}

/**
 * Mescla o salvo (parcial, vindo do banco) sobre o padrão: objetos recursivamente, o resto substitui
 * só se tiver o tipo certo (senão vale o padrão). Ignora __proto__/constructor/prototype, chaves
 * herdadas e chaves que o padrão não conhece. Não muta.
 */
function safeMerge<T>(base: T, override: unknown, enums: Record<string, readonly unknown[]>, path = ""): T {
  if (!isPlainObject(base)) {
    if (override === undefined) return base;
    return (sameShape(base, override, enums[path]) ? override : base) as T;
  }
  if (!isPlainObject(override)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(override)) {
    if (UNSAFE_KEYS.has(k)) continue;
    const v = override[k];
    if (v === undefined) continue;
    const key = path ? `${path}.${k}` : k;
    // Só chaves que o padrão conhece; o resto (dados de outros scripts, lixo) não entra nas configurações.
    if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
    out[k] = safeMerge((base as Record<string, unknown>)[k], v, enums, key);
  }
  return out as T;
}

function cleanMenuLinks(links: unknown): PlatformSettings["menuLinks"] {
  if (!Array.isArray(links)) return [];
  return links.filter(
    (l): l is { label: string; url: string } => isPlainObject(l) && typeof l.label === "string" && typeof l.url === "string",
  ).map((l) => ({ label: l.label, url: l.url }));
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL_ADDRESS = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** Texto opcional: vazio vira null; não-string vira null; corta no máximo. */
function optionalText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t.slice(0, max);
}

/** Valida o que safeMerge não cobre (formato de cor, faixa da logo, e-mail, URL da logo). */
function cleanEmailSettings(e: EmailSettings): EmailSettings {
  const d = DEFAULT_SETTINGS.emails;
  const colors = { ...d.colors };
  for (const k of Object.keys(colors) as (keyof EmailSettings["colors"])[]) {
    if (HEX_COLOR.test(e.colors[k])) colors[k] = e.colors[k].toLowerCase();
  }
  const h = e.logoHeight;
  const logoUrl = typeof e.logoUrl === "string" && /^(https?:\/\/|\/(?!\/))/i.test(e.logoUrl) ? e.logoUrl : null;
  const replyTo = optionalText(e.replyTo, 254);
  const template = (k: EditableTemplate): EmailTemplateSettings => ({
    enabled: e.templates[k].enabled,
    message: optionalText(e.templates[k].message, 5000),
    oneClickButton: e.templates[k].oneClickButton,
  });
  return {
    colors,
    logoUrl,
    logoHeight: Number.isInteger(h) && h >= 10 && h <= 200 ? h : d.logoHeight,
    senderName: optionalText(e.senderName, 100),
    replyTo: replyTo && EMAIL_ADDRESS.test(replyTo) ? replyTo : null,
    signature: optionalText(e.signature, 1000),
    templates: {
      venda: template("venda"),
      importacao: template("importacao"),
      gratis: template("gratis"),
      novoacesso: { enabled: e.templates.novoacesso.enabled, oneClickButton: e.templates.novoacesso.oneClickButton },
    },
  };
}

/** Limites dos critérios de senha (Configurações › Autenticação). */
export const PASSWORD_CRITERIA_MAX = 64;
export const PASSWORD_MIN_LENGTH_MIN = 6;
export const DEFAULT_PASSWORD_MAX = 128;

/**
 * Autenticação: critérios inteiros 0–64 (tamanho mínimo 6–64). A senha padrão vem de
 * `auth.defaultPassword` (string ou null = gerar); sem ela, do `defaultPassword` antigo do topo.
 */
function cleanAuthSettings(a: AuthSettings, raw: unknown): AuthSettings {
  const d = DEFAULT_SETTINGS.auth;
  const n = (v: number, def: number, min: number) => (Number.isInteger(v) && v >= min && v <= PASSWORD_CRITERIA_MAX ? v : def);
  const rawAuth = isPlainObject(raw) && isPlainObject(raw.auth) ? raw.auth : {};
  const legacy = isPlainObject(raw) ? raw.defaultPassword : undefined;
  const source = Object.prototype.hasOwnProperty.call(rawAuth, "defaultPassword") ? rawAuth.defaultPassword : legacy;
  let defaultPassword: string | null = d.defaultPassword;
  if (source === null) defaultPassword = null;
  else if (typeof source === "string") defaultPassword = source.trim() === "" ? null : source.trim().slice(0, DEFAULT_PASSWORD_MAX);
  return {
    requireStrongPassword: a.requireStrongPassword,
    level: a.level,
    minLength: n(a.minLength, d.minLength, PASSWORD_MIN_LENGTH_MIN),
    special: n(a.special, d.special, 0),
    upper: n(a.upper, d.upper, 0),
    lower: n(a.lower, d.lower, 0),
    digits: n(a.digits, d.digits, 0),
    letters: n(a.letters, d.letters, 0),
    initialPasswordFrom: a.initialPasswordFrom,
    defaultPassword,
  };
}

export const KIWIFY_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const KIWIFY_TOKEN_MAX = 200;
export const IGNORED_PRODUCTS_MAX = 200;
export const IGNORED_PRODUCT_ID_MAX = 100;

/** Lista de IDs de produto ignorados: strings aparadas, não vazias, até 100 caracteres, sem repetir, no máx. 200. */
export function cleanIgnoredProductIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || t.length > IGNORED_PRODUCT_ID_MAX || out.includes(t)) continue;
    out.push(t);
    if (out.length >= IGNORED_PRODUCTS_MAX) break;
  }
  return out;
}

function cleanKiwifySettings(k: KiwifySettings): KiwifySettings {
  const secret = typeof k.webhookSecret === "string" && KIWIFY_SECRET_PATTERN.test(k.webhookSecret) ? k.webhookSecret : null;
  const token = typeof k.signatureToken === "string" ? k.signatureToken.trim() : "";
  return {
    webhookSecret: secret,
    signatureToken: token && token.length <= KIWIFY_TOKEN_MAX ? token : null,
    ignoredProductIds: cleanIgnoredProductIds(k.ignoredProductIds),
  };
}

/** Configurações completas e com tipos válidos a partir do JSON salvo (parcial ou corrompido). */
export function resolvePlatformSettings(raw: unknown): PlatformSettings {
  const s = safeMerge(DEFAULT_SETTINGS, raw, PLATFORM_ENUMS);
  const h = s.loginScreen.logoHeight;
  const logoHeight = Number.isInteger(h) && h >= 20 && h <= 120 ? h : DEFAULT_SETTINGS.loginScreen.logoHeight;
  return {
    ...s,
    menuLinks: cleanMenuLinks(s.menuLinks),
    loginScreen: { ...s.loginScreen, logoHeight },
    emails: cleanEmailSettings(s.emails),
    auth: cleanAuthSettings(s.auth, raw),
    kiwify: cleanKiwifySettings(s.kiwify),
  };
}

/** Leitura direta (sempre do banco). Também renova o cache de getCachedPlatformSettings. */
export async function getPlatformSettings(db: Database): Promise<PlatformSettings> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  const settings = resolvePlatformSettings(row?.data);
  settingsCache.set(db, { at: Date.now(), value: Promise.resolve(settings) });
  return settings;
}

/**
 * Cache em memória (por instância) da linha de configurações, com TTL curto.
 *
 * Por que não `"use cache"` + cacheTag: o proxy não é um escopo de renderização, o handler padrão
 * guarda em memória por instância (em serverless não é compartilhado) e revalidateTag/updateTag só
 * limpam a instância que salvou. Então: TTL de SETTINGS_TTL_MS em todas as instâncias, e a instância
 * que salva limpa na hora (invalidatePlatformSettingsCache em updatePlatformSettings).
 * Efeito: uma mudança de aparência/termo pode levar até SETTINGS_TTL_MS para valer nas outras
 * instâncias. Quem decide algo sensível com base nele (o bloqueio do termo) confere no banco antes.
 */
export const SETTINGS_TTL_MS = 30_000;
const settingsCache = new WeakMap<Database, { at: number; value: Promise<PlatformSettings> }>();

export function getCachedPlatformSettings(db: Database): Promise<PlatformSettings> {
  const hit = settingsCache.get(db);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.value;
  const value = db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1)
    .then(([row]) => resolvePlatformSettings(row?.data));
  const entry = { at: Date.now(), value };
  settingsCache.set(db, entry);
  // Erro não fica no cache: a próxima chamada tenta de novo.
  value.catch(() => {
    if (settingsCache.get(db) === entry) settingsCache.delete(db);
  });
  return value;
}

export function invalidatePlatformSettingsCache(db: Database): void {
  settingsCache.delete(db);
}

export function resolveProductSettings(raw: unknown): ProductSettings {
  return safeMerge(DEFAULT_PRODUCT_SETTINGS, raw, PRODUCT_ENUMS);
}
