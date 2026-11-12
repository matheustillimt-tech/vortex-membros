"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MENU_COOKIE } from "./caminho";

type Painel = {
  recolhido: boolean;
  alternarRecolhido: () => void;
  /** Nomes de produtos, alunos etc. para o caminho no topo, por endereço (/dashboard/content/product/12). */
  nomes: Record<string, string>;
  definirNome: (href: string, nome: string | null) => void;
};

const PainelContext = createContext<Painel | null>(null);

export function usePainel(): Painel {
  const ctx = useContext(PainelContext);
  if (!ctx) throw new Error("usePainel fora do PainelRaiz");
  return ctx;
}

/**
 * Raiz do painel: o atributo data-menu-lateral liga o layout de menu lateral (variantes coluna: e
 * recolhido: do globals.css), via body[data-menu-lateral].
 */
export function PainelRaiz({
  recolhidoInicial,
  style,
  children,
}: {
  recolhidoInicial: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [recolhido, setRecolhido] = useState(recolhidoInicial);
  const [nomes, setNomes] = useState<Record<string, string>>({});

  const alternarRecolhido = useCallback(() => {
    setRecolhido((v) => {
      const novo = !v;
      document.cookie = novo
        ? `${MENU_COOKIE}=recolhido; path=/dashboard; max-age=31536000; samesite=lax`
        : `${MENU_COOKIE}=; path=/dashboard; max-age=0; samesite=lax`;
      return novo;
    });
  }, []);

  const definirNome = useCallback((href: string, nome: string | null) => {
    setNomes((atual) => {
      if (nome === null) {
        if (!(href in atual)) return atual;
        const resto = { ...atual };
        delete resto[href];
        return resto;
      }
      return atual[href] === nome ? atual : { ...atual, [href]: nome };
    });
  }, []);

  const valor = useMemo(
    () => ({ recolhido, alternarRecolhido, nomes, definirNome }),
    [recolhido, alternarRecolhido, nomes, definirNome],
  );

  return (
    <PainelContext.Provider value={valor}>
      <div className="contents" data-menu-lateral={recolhido ? "recolhido" : ""} style={style}>
        {children}
      </div>
    </PainelContext.Provider>
  );
}

/** Registra o nome de um item (produto, aluno, aula) para o caminho no topo enquanto a página está aberta. */
export function NomeNoCaminho({ href, nome }: { href: string; nome: string }) {
  const { definirNome } = usePainel();
  useEffect(() => {
    definirNome(href, nome);
    return () => definirNome(href, null);
  }, [href, nome, definirNome]);
  return null;
}
