"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircleIcon, CheckIcon } from "./icons";

/**
 * Estado de um formulário com a barra de salvar: sujo → barra sobe; salvo → "Salvo"
 * por um instante e a barra desce. ⌘/Ctrl+S salva; sair com alterações não salvas pede confirmação.
 */
export function useSaveState(onSave: () => void | Promise<void>) {
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const markDirty = useCallback(() => {
    setDirty(true);
    setSaved(false);
  }, []);
  const markSaved = useCallback(() => {
    setDirty(false);
    setSaved(true);
  }, []);

  useEffect(() => {
    if (!saved || dirty) return;
    const t = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [saved, dirty]);

  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    }
    function onUnload(e: BeforeUnloadEvent) {
      if (dirty) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty]);

  return { dirty, saved, markDirty, markSaved };
}

export type SaveBarState = { dirty: boolean; saved: boolean; pending: boolean; error: string | null };

/** A barra só aparece com alteração, salvando, erro ou "salvo agora". */
export function isSaveBarOpen({ dirty, saved, pending, error }: SaveBarState) {
  return dirty || pending || saved || !!error;
}

/** O que a barra mostra em cada estado. */
export function saveBarView(s: SaveBarState) {
  const failed = !!s.error && !s.pending;
  const justSaved = s.saved && !s.dirty && !s.pending && !failed;
  return {
    open: isSaveBarOpen(s),
    status: failed ? ("erro" as const) : justSaved ? ("salvo" as const) : s.dirty || s.pending ? ("sujo" as const) : null,
    tone: failed ? ("erro" as const) : justSaved ? ("ok" as const) : null,
    collapsed: s.pending || justSaved,
    disabled: s.pending || justSaved,
  };
}

const noSubscribe = () => () => {};
const isMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** Barra de salvar com "notch"; o botão envia o formulário em volta. */
export function SaveBar(props: SaveBarState) {
  const view = saveBarView(props);
  const mac = useSyncExternalStore(noSubscribe, isMac, () => true);

  // Entrada/saída: monta com translate-y-full/opacity-0 e anima até 0; some (display:none) depois de sair.
  const [prevOpen, setPrevOpen] = useState(view.open);
  const [shown, setShown] = useState(view.open);
  const [entered, setEntered] = useState(view.open);
  if (prevOpen !== view.open) {
    setPrevOpen(view.open);
    if (view.open) setShown(true);
    else setEntered(false);
  }
  useEffect(() => {
    if (view.open) {
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    const t = window.setTimeout(() => setShown(false), 300);
    return () => window.clearTimeout(t);
  }, [view.open]);

  return (
    <>
      <div aria-hidden="true" className="savebar-reserva" />
      <div
        className={`dashboard-savebar pointer-events-none fixed bottom-0 left-1/2 z-30 ${shown ? "flex" : "hidden"} max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center ${
          entered ? "dashboard-savebar--entrando translate-y-0 opacity-100" : "dashboard-savebar--saindo translate-y-full opacity-0"
        }`}
      >
        <div className="relative z-10 mb-2 flex items-center justify-center text-hint font-medium" aria-live="polite">
          {view.status === "erro" ? (
            <span className="inline-flex items-center gap-2 text-red-600">
              <AlertCircleIcon className="h-4 w-4" /> Não foi possível salvar
            </span>
          ) : view.status === "salvo" ? (
            <span className="inline-flex items-center gap-2 text-emerald-600">
              <CheckIcon className="h-4 w-4" /> Salvo
            </span>
          ) : view.status === "sujo" ? (
            <span className="inline-flex items-center gap-2 text-amber-600">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>{" "}
              Alterações não salvas
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-keyshortcuts="Meta+S Control+S"
          disabled={view.disabled}
          tabIndex={view.open ? 0 : -1}
          onClick={(e) => e.currentTarget.form?.requestSubmit()}
          className={`savebar-ilha savebar-notch pointer-events-auto flex items-center px-5 pb-3 pt-2.5 text-hint font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-default${
            view.tone === "ok" ? " savebar-notch--ok" : view.tone === "erro" ? " savebar-notch--erro" : ""
          }`}
        >
          <span className="savebar-icone">
            {props.pending ? (
              <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            ) : (
              <CheckIcon className="h-4 w-4" />
            )}
          </span>
          <span className={`savebar-rotulo${view.collapsed ? " savebar-rotulo--recolhido" : ""}`}>
            Salvar agora{" "}
            <kbd className="savebar-tecla hidden sm:inline-flex" aria-hidden="true">
              {mac ? "⌘+S" : "Ctrl+S"}
            </kbd>
          </span>
        </button>
      </div>
    </>
  );
}
