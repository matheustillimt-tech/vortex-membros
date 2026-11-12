import type { CSSProperties, ReactNode } from "react";
import { Inter } from "next/font/google";
import type { PlatformSettings } from "@/lib/settings";
import { platformIdentity, safeColor, safeImageUrl, themeProps } from "@/lib/theme";
import { PlatformIdentity } from "@/components/platform-identity";

/*
 * Moldura das telas de acesso (login, esqueci a senha), mesmo padrão visual do login:

 * A fonte Inter vale só aqui; a área do aluno continua na pilha system-ui.
 */
const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "700"], display: "swap" });

/** url("...") seguro para CSS: a URL já passou por safeHttpUrl; escapa o que poderia fechar a string. */
function cssUrl(url: string) {
  return `url("${url.replace(/["'()\\\s]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)}")`;
}

type LoginScreen = PlatformSettings["loginScreen"];

const IMAGE_POSITION: Record<LoginScreen["imagePosition"], string> = { left: "0% 50%", center: "50% 50%", right: "100% 50%" };
// Larguras do painel visual a partir de 576px (col-sm-8 / 6 / 4 / 3 / 2).
const PANEL_WIDTH: Record<LoginScreen["panelWidth"], string> = {
  extraWide: "min-[576px]:max-w-[66.666667%] min-[576px]:flex-[0_0_66.666667%]",
  wide: "min-[576px]:max-w-[50%] min-[576px]:flex-[0_0_50%]",
  medium: "min-[576px]:max-w-[33.333333%] min-[576px]:flex-[0_0_33.333333%]",
  default: "min-[576px]:max-w-[25%] min-[576px]:flex-[0_0_25%]",
  narrow: "min-[576px]:max-w-[16.666667%] min-[576px]:flex-[0_0_16.666667%]",
};
const LOGO_ALIGN: Record<LoginScreen["logoAlign"], string> = { left: "justify-start", center: "justify-center", right: "justify-end" };

function ImagePanel({
  imageUrl,
  position,
  width,
  light,
  copyright,
}: {
  imageUrl: string | null;
  position: LoginScreen["imagePosition"];
  width: LoginScreen["panelWidth"];
  light: boolean;
  copyright: ReactNode;
}) {
  const style: CSSProperties = {
    backgroundColor: light ? "#e9ecef" : "#180f0c",
    ...(imageUrl ? { backgroundImage: cssUrl(imageUrl), backgroundSize: "cover", backgroundPosition: IMAGE_POSITION[position] } : {}),
  };
  return (
    <aside
      aria-label="Imagem da tela de acesso"
      style={style}
      data-sem-imagem={light && !imageUrl ? "" : undefined}
      className={`flex min-h-[60vh] flex-[1_1_auto] flex-col items-center justify-end px-[15px] py-12 min-[576px]:min-h-0 ${PANEL_WIDTH[width]} min-[576px]:py-0`}
    >
      {copyright}
    </aside>
  );
}

function AuthLogo({ src, siteName, align, height }: { src: string | null; siteName: string; align: LoginScreen["logoAlign"]; height: number }) {
  // 45px por padrão; outra altura vem das configurações (Telas de acesso › Logo).
  const style = height === 45 ? undefined : { height: `${height}px` };
  return (
    <div className={`flex h-[45px] ${LOGO_ALIGN[align]}`} style={style}>
      {src ? (
        <img src={src} alt={siteName} className="h-[45px] w-auto max-w-full object-contain" style={style} />
      ) : (
        <span className="flex h-[45px] items-center text-center font-bold text-white" style={style}>
          {siteName}
        </span>
      )}
    </div>
  );
}

export function AuthShell({ settings, children }: { settings: PlatformSettings; children: ReactNode }) {
  const { loginScreen, footer, siteName } = settings;
  const logo = safeImageUrl(loginScreen.logoUrl) ?? safeImageUrl(settings.logoUrl);
  // Modo: "area" segue a área do aluno. O visual claro é aplicado por CSS (globals.css, [data-auth-theme]).
  const theme = loginScreen.theme === "area" ? settings.theme : loginScreen.theme;
  const light = theme === "light";
  const identity = platformIdentity(settings);
  const accent = safeColor(loginScreen.accentColor ?? undefined) ?? safeColor(settings.accentColor) ?? "#ff7500";
  // Desktop: imagem à esquerda e formulário à direita (padrão), ou o inverso se formSide = "left".
  // Celular (< 576px, como flex-column-reverse flex-sm-row): formulário primeiro, imagem embaixo.
  const rowClass = loginScreen.formSide === "left" ? "min-[576px]:flex-row-reverse" : "min-[576px]:flex-row";

  const copyright =
    footer.show && footer.legalNotice ? (
      <div className="px-4 pt-12 text-center text-[14.4px] leading-[21.6px] text-white min-[576px]:pb-12">
        <p className="m-0">
          Copyright © {new Date().getFullYear()} - {siteName}
          <br />
          Todos os direitos reservados.
        </p>
      </div>
    ) : null;

  const main = (
    <main className="bg-[#181a1b] px-[15px] min-[576px]:flex min-[576px]:flex-1 min-[576px]:items-center min-[576px]:justify-center">
      <div className="mx-auto w-4/5 max-w-[500px] py-12">
        <AuthLogo src={logo} siteName={siteName} align={loginScreen.logoAlign} height={loginScreen.logoHeight} />
        {children}
      </div>
    </main>
  );

  return (
    <div
      {...themeProps(settings)}
      data-theme={theme}
      data-auth-theme={light ? "light" : undefined}
      style={{ "--accent": accent } as CSSProperties}
      className={`${inter.className} flex min-h-svh w-full flex-1 flex-col-reverse bg-[#111213] text-[14.4px] font-normal leading-[21.6px] text-white ${rowClass}`}
    >
      <ImagePanel
        imageUrl={safeImageUrl(loginScreen.imageUrl)}
        position={loginScreen.imagePosition}
        width={loginScreen.panelWidth}
        light={light}
        copyright={copyright}
      />
      {/* Sem configurações próprias, a árvore é a mesma de sempre (mesmos useId e HTML). */}
      {identity ? (
        <>
          {main}
          <PlatformIdentity {...identity} />
        </>
      ) : (
        main
      )}
    </div>
  );
}
