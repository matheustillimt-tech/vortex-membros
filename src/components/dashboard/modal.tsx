"use client";

import { useEffect, useRef } from "react";
import { XIcon } from "./icons";

/**
 * Modal (<dialog> rounded-xl, p-6, fundo branco, véu zinc-800/70).
 * Aberto enquanto `open`; Esc, o X e o clique no véu chamam `onClose`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // só o véu: o padding fica no wrapper interno
      }}
      className={`m-auto w-[calc(100%-2rem)] rounded-xl border border-transparent bg-white p-0 text-gray-900 shadow-lg backdrop:bg-zinc-800/70 ${className}`}
    >
      {open ? (
        <div className="space-y-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
              {description ? <p className="mt-1 text-hint text-gray-500">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="btn-icone -mr-1.5 -mt-1.5 flex-shrink-0">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

/** Rodapé padrão: ações alinhadas à direita. */
export function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
