"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "./icons";

/** Aviso rápido no rodapé ("Copiado!"), some sozinho em 2 s. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), 2000);
  }, []);
  const node =
    message && typeof document !== "undefined"
      ? createPortal(
          <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
              <CheckIcon className="h-4 w-4 text-emerald-400" />
              {message}
            </div>
          </div>,
          document.body,
        )
      : null;
  return { show, node };
}

/** Copia para a área de transferência (com plano B para navegador sem Clipboard API). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

/** Baixa um arquivo de uma rota do painel (CSV) sem sair da página. */
export function downloadFrom(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
