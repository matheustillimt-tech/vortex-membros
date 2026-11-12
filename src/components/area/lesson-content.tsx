"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { codeBlockText } from "@/lib/content/copy-text";

const COPY_ICON =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a1 1 0 0 1 1-1h10"></path></svg>';

/**
 * Conteúdo da aula (HTML já sanitizado no servidor). Logo abaixo de cada bloco <pre> (onde ficam os prompts)
 * entra um botão "Copiar prompt" em pílula com contorno — único JS deste bloco.
 */
export function LessonContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const buttons: HTMLButtonElement[] = [];
    for (const pre of root.querySelectorAll("pre")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "copy-button";
      button.innerHTML = COPY_ICON;
      const label = document.createElement("span");
      label.setAttribute("aria-live", "polite");
      label.textContent = "Copiar prompt";
      button.appendChild(label);
      let timer: ReturnType<typeof setTimeout> | undefined;
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(codeBlockText(pre));
          label.textContent = "Copiado";
        } catch {
          label.textContent = "Não foi possível copiar";
        }
        clearTimeout(timer);
        timer = setTimeout(() => (label.textContent = "Copiar prompt"), 2000);
      });
      pre.after(button);
      buttons.push(button);
    }
    return () => buttons.forEach((b) => b.remove());
  }, [html]);

  // Vídeo embutido no texto: com a aula escondida pelo <Activity> do Next (navegou para outra), o
  // iframe vai para about:blank e o vídeo para; volta ao endereço original quando a aula reaparece.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const f of root.querySelectorAll<HTMLIFrameElement>("iframe[data-src]")) {
      f.src = f.dataset.src!;
      delete f.dataset.src;
    }
    return () => {
      for (const f of root.querySelectorAll<HTMLIFrameElement>("iframe")) {
        f.dataset.src = f.getAttribute("src") ?? "";
        f.src = "about:blank";
      }
    };
  }, [html]);

  return <div ref={ref} className="lesson-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
