import type { CSSProperties } from "react";
import { cache } from "react";
import { connection } from "next/server";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/admin/guard";
import { DEFAULT_SETTINGS, getPlatformSettings, type PlatformSettings } from "@/lib/settings";
import { safeColor, safeImageUrl } from "@/lib/theme";

// Uma consulta por requisição, mesmo com layout e página pedindo os mesmos dados.
export const getAdmin = cache(requireAdmin);
export const getDashboardSettings = cache(async () => {
  await connection(); // sempre por requisição (nunca no prerender do build)
  return getPlatformSettings(getDb());
});

/** Logo do painel: `adminArea.logoUrl` (Configurações › Painel administrativo) ou null → nome do site. */
export function dashboardLogoUrl(settings: PlatformSettings): string | null {
  return safeImageUrl(settings.adminArea.logoUrl);
}

/**
 * Cor de destaque do painel como `--color-brand-*` (os utilitários brand-* leem estas variáveis).
 * Com a cor padrão (#e91e63) devolve undefined: valem os tons exatos do globals.css.
 * Outra cor: tons derivados com color-mix (mais claros com branco, mais escuros com preto).
 */
export function dashboardBrandStyle(settings: PlatformSettings): CSSProperties | undefined {
  const c = safeColor(settings.adminArea.accentColor);
  if (!c || c.toLowerCase() === DEFAULT_SETTINGS.adminArea.accentColor) return undefined;
  const light = (pct: number) => `color-mix(in srgb, ${c} ${pct}%, #fff)`;
  const dark = (pct: number) => `color-mix(in srgb, ${c} ${pct}%, #000)`;
  return {
    "--color-brand-50": light(12),
    "--color-brand-100": light(28),
    "--color-brand-200": light(45),
    "--color-brand-300": light(65),
    "--color-brand-400": light(85),
    "--color-brand-500": c,
    "--color-brand-600": dark(92),
    "--color-brand-700": dark(82),
    "--color-brand-800": dark(72),
    "--color-brand-900": dark(55),
    "--color-brand-950": dark(30),
    "--accent": c,
  } as CSSProperties;
}
