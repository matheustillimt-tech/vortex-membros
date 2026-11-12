"use client";

import { useEffect, useId, useRef, useState } from "react";
import { matchesSearch } from "@/lib/cover-progress";
import { SearchIcon } from "./icons";

/** Esconde as capas da página atual cujo nome não contém o termo (e a vitrine que ficar vazia). */
function applyFilter(query: string) {
  document.querySelectorAll<HTMLElement>("[data-cover-name]").forEach((el) => {
    el.hidden = !matchesSearch(el.dataset.coverName ?? "", query);
  });
  document.querySelectorAll<HTMLElement>("[data-cover-section]").forEach((section) => {
    const items = section.querySelectorAll<HTMLElement>("[data-cover-name]");
    section.hidden = items.length > 0 && Array.from(items).every((el) => el.hidden);
  });
  // Os trilhos recalculam as setas.
  window.dispatchEvent(new Event("resize"));
}

/**
 * Busca do cabeçalho (círculo 30×30): abre um campo que filtra, no navegador, as capas da página
 * atual pelo nome. Não busca dados novos. Esc ou o botão de novo fecham e limpam o filtro.
 */
export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    applyFilter(query);
    if (!query) return;
    // Navegou para outra página com o filtro ativo: as capas novas também são filtradas.
    const main = document.querySelector("main");
    if (!main) return;
    const observer = new MutationObserver(() => applyFilter(query));
    observer.observe(main, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="vx-hbtn vx-hbtn--search"
        aria-label={open ? "Fechar busca" : "Buscar"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <SearchIcon />
      </button>
      {open && (
        <div id={id} role="search" className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(280px,calc(100vw-16px))]">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            placeholder="Buscar nesta página"
            aria-label="Buscar conteúdos nesta página"
            className="h-[38px] w-full rounded-md border border-line bg-bg px-3 text-ui text-text outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
      )}
    </div>
  );
}
