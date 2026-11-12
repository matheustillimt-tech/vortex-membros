import type { PlatformSettings } from "@/lib/settings";
import { safeHttpUrl } from "@/lib/theme";

/**
 * Rodapé: borda superior, padding 24px, 11.2px. A partir de 992px, duas colunas
 * (copyright à esquerda; links sublinhados à direita com padding-top 32px); no celular, centralizado.
 */
export function AreaFooter({ settings }: { settings: PlatformSettings }) {
  const { footer, siteName } = settings;
  if (!footer.show) return null;
  const terms = safeHttpUrl(footer.termsUrl);
  const privacy = safeHttpUrl(footer.privacyUrl);
  const linkClass = "text-muted underline hover:text-text";

  return (
    <footer className="mt-auto flex flex-col items-center border-t border-line p-6 text-center text-[calc(11.2px*var(--fs))] leading-[1.5] min-[992px]:flex-row min-[992px]:items-start min-[992px]:justify-between min-[992px]:text-left">
      {footer.legalNotice ? (
        <small className="text-[length:inherit] text-muted">
          Copyright © {new Date().getFullYear()} - {siteName}. Todos os direitos reservados.
        </small>
      ) : (
        <span />
      )}
      {(terms || privacy) && (
        <nav aria-label="Documentos legais" className="flex gap-2 pt-8 min-[992px]:justify-end min-[992px]:text-right">
          {terms && (
            <a href={terms} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Termos de uso
            </a>
          )}
          {privacy && (
            <a href={privacy} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Política de privacidade
            </a>
          )}
        </nav>
      )}
    </footer>
  );
}
