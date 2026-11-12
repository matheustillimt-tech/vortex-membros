"use client";

import { useEffect } from "react";

/** Título estático do layout raiz (src/app/layout.tsx): é ele que o nome do site substitui. */
export const DEFAULT_DOCUMENT_TITLE = "Vórtex Membros";

/**
 * Título das páginas e favicon vindos das configurações. Fica no cliente de propósito: um
 * generateMetadata dinâmico faria o Next transmitir o <head> no corpo da página e mudaria o HTML
 * de quem usa as configurações padrão. Só é renderizado
 * quando há algo diferente do padrão. Páginas com título próprio ("Perfil") mantêm o delas.
 */
export function PlatformIdentity({ title, icon }: { title: string | null; icon: string | null }) {
  useEffect(() => {
    function apply() {
      if (title && document.title === DEFAULT_DOCUMENT_TITLE) document.title = title;
      if (icon) {
        const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
        if (links.length === 0) {
          const link = document.createElement("link");
          link.rel = "icon";
          link.href = icon;
          document.head.appendChild(link);
        }
        links.forEach((l) => {
          if (l.getAttribute("href") !== icon) {
            l.href = icon;
            l.removeAttribute("type");
            l.removeAttribute("sizes");
          }
        });
      }
    }
    apply();
    // Navegações do App Router regravam o <head>: reaplica quando ele muda.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title, icon]);
  return null;
}
