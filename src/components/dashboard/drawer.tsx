"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buttonClass } from "./button";
import { AlertCircleIcon, RotateCcwIcon, SaveIcon, XIcon } from "./icons";

/**
 * Gaveta lateral (`data-sheet`): véu com blur, painel à direita
 * (`max-w-md` por padrão), cabeçalho com X, corpo rolável, barra âmbar "Alterações não salvas"
 * (com `dirty`) e rodapé. Fechar com mudanças abre o modal "Alterações não salvas".
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  dirty = false,
  onSaveAndExit,
  name,
  widthClass = "max-w-md",
  bodyClassName = "",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Há mudanças não salvas: mostra a barra âmbar e pede confirmação ao fechar. */
  dirty?: boolean;
  /** "Salvar e sair" do modal de confirmação (sem ele, o botão não aparece). */
  onSaveAndExit?: () => void;
  /** Valor de `data-sheet` (ex.: "admin-new"). */
  name?: string;
  widthClass?: string;
  /** Classes extras do corpo rolável (ex.: "p-5" nas gavetas de e-mail). */
  bodyClassName?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const requestClose = () => (dirty ? setConfirming(true) : onClose());
  const latestClose = useRef(requestClose);
  useEffect(() => {
    latestClose.current = requestClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("input:not([type=hidden]),textarea,select,button[role=combobox]");
    (first ?? panel.current)?.focus();
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        latestClose.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div data-sheet={name} className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" onClick={requestClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={`fixed inset-y-0 right-0 flex w-full ${widthClass} flex-col border-l border-gray-200 bg-white shadow-xl outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            <span>{title}</span>
          </h2>
          <button type="button" onClick={requestClose} className="text-gray-400 transition-colors hover:text-gray-600" aria-label="Fechar">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className={`scroll-fino relative flex-1 overflow-y-auto${bodyClassName ? ` ${bodyClassName}` : ""}`}>
          <div className="isolate h-full">{children}</div>
        </div>
        {dirty ? (
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-amber-200/70 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-600">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            Alterações não salvas
          </div>
        ) : null}
        {footer ? <div className="flex-shrink-0 border-t border-gray-100 px-4 py-4">{footer}</div> : null}
      </div>
      {confirming ? (
        <UnsavedChangesModal
          onContinue={() => setConfirming(false)}
          onDiscard={() => {
            setConfirming(false);
            onClose();
          }}
          onSave={
            onSaveAndExit
              ? () => {
                  setConfirming(false);
                  onSaveAndExit();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

const MODAL_BUTTON = "justify-center whitespace-nowrap";

/** Modal "Alterações não salvas" da gaveta (texto e botões). */
function UnsavedChangesModal({ onContinue, onDiscard, onSave }: { onContinue: () => void; onDiscard: () => void; onSave?: () => void }) {
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" onClick={onContinue} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-xl sm:rounded-2xl">
        <div className="p-6 sm:p-7">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertCircleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-semibold tracking-tight text-gray-900">
                Alterações não salvas
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
                Você alterou este painel e ainda não salvou. Se fechar agora, as alterações são perdidas.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" autoFocus onClick={onContinue} className={buttonClass("outline", `${MODAL_BUTTON} sm:mr-auto`)}>
              Continuar editando
            </button>
            <button type="button" onClick={onDiscard} className={buttonClass("outline", MODAL_BUTTON)}>
              <RotateCcwIcon className="h-4 w-4" />
              Descartar alterações
            </button>
            {onSave ? (
              <button type="button" onClick={onSave} className={buttonClass("primary", MODAL_BUTTON)}>
                <SaveIcon className="h-4 w-4" />
                Salvar e sair
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
