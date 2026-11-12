"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { buttonClass } from "./button";
import { CheckIcon, XIcon } from "./icons";

export function Spinner() {
  return (
    <svg aria-hidden className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" />
    </svg>
  );
}

/** Modal do painel (folha no celular, caixa `sm:max-w-*` centralizada). */
export function PanelDialog({
  open,
  onClose,
  widthClass = "sm:max-w-sm",
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  widthClass?: string;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  // Portal (no <main>, dentro do .dash e da cor de destaque): o modal pode abrir de dentro de um
  // <form> (ex.: "Adicionando Tag" no formulário da entrega), e form aninhado não vale.
  return createPortal(
    // O portal muda o DOM, mas os eventos do React sobem pela árvore de componentes: o submit de um
    // form do modal não pode chegar ao form em volta (ex.: "Adicionando Tag" dentro da entrega).
    <div className="fixed inset-0 z-50" onSubmit={(e) => e.stopPropagation()}>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          tabIndex={-1}
          className={`scroll-fino max-h-[90vh] w-full ${widthClass} overflow-y-auto rounded-t-2xl border border-gray-200 bg-white shadow-xl outline-none has-[[data-select-open=true]]:overflow-visible sm:rounded-xl`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
        >
          {children}
        </div>
      </div>
    </div>,
    document.querySelector("[data-main]") ?? document.body,
  );
}

export function DialogHeader({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 pb-0 pt-5">
      <h2 id={id} className="text-lg font-semibold text-gray-900">
        {title}
      </h2>
      <button type="button" onClick={onClose} className="text-gray-400 transition-colors hover:text-gray-600" aria-label="Fechar">
        <XIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

/**
 * Confirmação padrão (ícone redondo, título, texto, "Não, cancelar" / "Sim, …"): `danger` em
 * vermelho (arquivar, excluir) ou `brand` (restaurar, aplicar).
 */
export function ConfirmDialog({
  open,
  onClose,
  tone,
  icon,
  title,
  children,
  confirmLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  tone: "brand" | "danger";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const danger = tone === "danger";
  return (
    <PanelDialog open={open} onClose={onClose} labelledBy={titleId}>
      <div className="p-5">
        <div className="flex gap-4">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-50 text-red-500" : "bg-brand-50 text-brand-500"}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="mb-1 text-base font-semibold text-gray-900">
              {title}
            </h3>
            <p className="text-sm text-gray-500">
              <span>{children}</span>
            </p>
          </div>
        </div>
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
            {error}
          </div>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={buttonClass("outline", "w-full justify-center")}>
            <XIcon className="h-4 w-4" />
            Não, cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={
              danger
                ? "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-red-500 px-4 py-2 text-hint font-medium text-white shadow-sm transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                : buttonClass("primary", "w-full justify-center")
            }
          >
            {pending ? <Spinner /> : <CheckIcon className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}
