"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Recipiente do iframe do player. O iframe é criado só no navegador, já no lugar final da página:
 * a aula chega por streaming (o Next põe o conteúdo num bloco escondido e depois o move para a
 * posição certa), e todo iframe movido no DOM recarrega. Com o iframe no HTML do servidor, o player
 * da Panda carregava duas vezes por aula (documento, CSS e ~480 KB de JS); a capa por baixo cobre a
 * espera (ver LessonPlayer).
 *
 * Com Cache Components o Next também não desmonta a página anterior ao navegar: esconde com
 * <Activity> (display: none) e o vídeo continuaria tocando. Quando a aula fica escondida, a limpeza
 * do efeito tira o iframe (o vídeo para na hora); quando ela volta a aparecer, o iframe é recolocado.
 */
export function PlayerFrame({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html;
    return () => {
      el.innerHTML = "";
    };
  }, [html]);
  return <div ref={ref} className="absolute inset-0" />;
}
