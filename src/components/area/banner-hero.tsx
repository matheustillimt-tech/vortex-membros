import Link from "next/link";
import type { BannerConfig } from "@/db/schema";
import { safeHttpUrl, safeImageUrl } from "@/lib/theme";

type BannerAction = { href: string; external: boolean; newTab: boolean } | null;

function resolveAction(action: BannerConfig["action"]): BannerAction {
  if (action?.type === "product" && Number.isInteger(action.productId)) {
    return { href: `/area/conteudo/listagem/${action.productId}`, external: false, newTab: false };
  }
  if (action?.type === "external") {
    const url = safeHttpUrl(action.url);
    if (url) return { href: url, external: true, newTab: action.newTab ?? true };
  }
  return null;
}

/**
 * Banner principal da home: só a imagem (desktop 1920×1080 a partir de 768px,
 * celular 600×1050 abaixo), cover e centralizada, altura 75vh (ou a do painel; no celular, mais baixa e
 * cortada em cima e embaixo), largura total, sem texto
 * ou cantos, com a vinheta e o degradê do pé (globals.css); 24px até a primeira vitrine. Com ação configurada, o banner inteiro é o link.
 */
export function BannerHero({ banner }: { banner: { name: string; config: BannerConfig } }) {
  const c = banner.config;
  const desktop = safeImageUrl(c.desktopImageUrl);
  const mobile = safeImageUrl(c.mobileImageUrl) ?? desktop;
  if (!desktop && !mobile) return null;
  const action = resolveAction(c.action);
  const label = c.title ?? banner.name;
  // Altura configurada no painel (10–100% da tela) vale a partir de 768px; sem valor, 75vh do CSS.
  // No celular a altura é fixa no CSS (imagem cortada em cima e embaixo).
  const h = c.heightPercent;
  const style = Number.isInteger(h) && h! >= 10 && h! <= 100 ? ({ "--banner-h": `${h}vh` } as React.CSSProperties) : undefined;

  const picture = (
    <picture>
      {mobile && desktop && mobile !== desktop && <source media="(max-width: 767px)" srcSet={mobile} />}
      <img src={desktop ?? mobile!} alt={action ? "" : label} fetchPriority="high" />
    </picture>
  );

  if (action?.external) {
    return (
      <a
        href={action.href}
        className="vx-banner"
        style={style}
        aria-label={label}
        {...(action.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {picture}
      </a>
    );
  }
  if (action) {
    return (
      <Link href={action.href} className="vx-banner" style={style} aria-label={label}>
        {picture}
      </Link>
    );
  }
  return (
    <section className="vx-banner" style={style} aria-label={label}>
      {picture}
    </section>
  );
}
