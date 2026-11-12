import type { CSSProperties } from "react";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/settings";

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;

/** Aceita só cores simples (hex/rgb/hsl), para nunca injetar CSS vindo de configuração. */
export function safeColor(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  return v && COLOR.test(v) ? v : undefined;
}

/** Só http(s); qualquer outra coisa (javascript:, data:...) vira null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Endereço de imagem: http(s) ou caminho do próprio site ("/demo/capa.jpg").
 * Recusa "//host" e "/\host" (o navegador trata como outro domínio) e caracteres de controle.
 */
export function safeImageUrl(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.startsWith("/")) {
    if (v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f\u007f]/.test(v)) return null;
    return v;
  }
  return safeHttpUrl(v);
}

/** Atributos do wrapper que aplicam tema, tamanho de fonte e cor de destaque. */
export function themeProps(settings: PlatformSettings) {
  return {
    "data-theme": settings.theme,
    "data-font-size": settings.fontSize,
    style: { "--accent": safeColor(settings.accentColor) ?? "#ff7500" } as CSSProperties,
  };
}


/**
 * Título das páginas (nome do site) e favicon para <PlatformIdentity>, ou null quando as duas coisas
 * estão no padrão (aí nada é renderizado e o HTML fica exatamente como sem configurações).
 */
export function platformIdentity(settings: PlatformSettings): { title: string | null; icon: string | null } | null {
  const title = settings.siteName !== DEFAULT_SETTINGS.siteName ? settings.siteName : null;
  const icon = safeImageUrl(settings.faviconUrl);
  return title || icon ? { title, icon } : null;
}
