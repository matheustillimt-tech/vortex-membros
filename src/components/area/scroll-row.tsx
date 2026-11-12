"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "./icons";

/** Recuo lateral do trilho (padding-left/right de .vx-track). */
const GUTTER = 24;
/** Rolagem automática: uma capa a cada AUTO_STEP_MS; depois de mexer na fileira, espera AUTO_IDLE_MS. */
const AUTO_STEP_MS = 3000;
const AUTO_IDLE_MS = 6000;

/**
 * Linha de título (36px; 24px no celular) com as setas à direita (só ≥ 768px) e o trilho
 * horizontal de capas (toque/trackpad com scroll-snap). As setas rolam uma página e ficam
 * com opacidade .35 quando não há para onde ir; sem rolagem possível, somem.
 *
 * `autoScroll`: com mais capas do que cabem, avança uma capa por vez e, no fim, volta ao início.
 * Para com o mouse ou o foco na fileira, fora da tela, com a aba oculta, por um tempo depois de o
 * aluno rolar/usar as setas, e nunca roda com "reduzir movimento" ligado no sistema.
 */
export function ScrollRow({
  heading,
  children,
  label,
  wide = false,
  autoScroll = false,
}: {
  heading: ReactNode;
  children: ReactNode;
  label: string;
  wide?: boolean;
  autoScroll?: boolean;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const hovered = useRef(false);
  const lastManual = useRef(0);
  const touched = () => {
    lastManual.current = Date.now();
  };
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    // "resize" também é disparado pela busca do cabeçalho depois de filtrar as capas.
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  useEffect(() => {
    const el = ref.current;
    if (!autoScroll || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(el);
    const id = window.setInterval(() => {
      if (hovered.current || !visible || document.hidden || Date.now() - lastManual.current < AUTO_IDLE_MS) return;
      if (el.contains(document.activeElement)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4) return;
      if (el.scrollLeft >= max - 4) {
        el.scrollTo({ left: 0, behavior: "smooth" });
        return;
      }
      // Passo = distância entre duas capas (largura + espaço); o scroll-snap acerta o alinhamento.
      const [a, b] = el.querySelectorAll<HTMLElement>(":scope > li");
      const step = a && b ? b.offsetLeft - a.offsetLeft : (a?.offsetWidth ?? el.clientWidth);
      el.scrollBy({ left: step, behavior: "smooth" });
    }, AUTO_STEP_MS);
    return () => {
      window.clearInterval(id);
      io.disconnect();
    };
  }, [autoScroll]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    touched();
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * Math.max(el.clientWidth - 2 * GUTTER, 1), behavior: smooth ? "smooth" : "auto" });
  };

  const arrows = !(edges.start && edges.end);
  return (
    <>
      <div className="vx-row-head">
        {heading}
        {arrows && (
          <div className="vx-arrows">
            <button type="button" className="vx-arrow" onClick={() => scroll(-1)} disabled={edges.start} aria-label="Anteriores">
              <ChevronLeft strokeWidth={3} />
            </button>
            <button type="button" className="vx-arrow" onClick={() => scroll(1)} disabled={edges.end} aria-label="Próximos">
              <ChevronRight strokeWidth={3} />
            </button>
          </div>
        )}
      </div>
      <ul
        ref={ref}
        onScroll={update}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") hovered.current = true;
        }}
        onPointerLeave={() => {
          hovered.current = false;
        }}
        onTouchStart={touched}
        onWheel={touched}
        aria-label={label}
        className={`vx-track${wide ? " vx-track--wide" : ""}`}
      >
        {children}
      </ul>
    </>
  );
}
