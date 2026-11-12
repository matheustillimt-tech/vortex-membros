"use client";

import { buttonClass } from "./button";
import { RotateCcwIcon } from "./icons";
import { Modal } from "./modal";

export type TrashEntry = { key: string; name: string; kindLabel: string; detail?: string; deletedAt: string; onRestore: () => void };

/** Lixeira: itens excluídos com "Restaurar" (mesmo visual de linha-lista). */
export function TrashModal({
  open,
  onClose,
  description,
  entries,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  description: string;
  entries: TrashEntry[];
  pending: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Lixeira" description={description} className="max-w-xl">
      {entries.length === 0 ? (
        <p className="text-hint text-gray-500">A lixeira está vazia.</p>
      ) : (
        <div className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
          {entries.map((t) => (
            <div key={t.key} className="linha-lista">
              <div className="linha-info">
                <div className="w-full min-w-0 sm:col-start-1 sm:row-start-1">
                  <span className="edicao-inline-texto block truncate">{t.name}</span>
                </div>
                <div className="linha-meta">
                  <span className="linha-meta-texto">{t.kindLabel}</span>
                  {t.detail ? (
                    <>
                      <span className="linha-meta-ponto">·</span>
                      <span className="linha-meta-texto">{t.detail}</span>
                    </>
                  ) : null}
                  <span className="linha-meta-ponto">·</span>
                  <span className="linha-meta-texto">Excluído em {t.deletedAt}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={t.onRestore}
                className={buttonClass("outline", "flex-shrink-0 !px-2.5 !py-1.5")}
              >
                <RotateCcwIcon className="h-4 w-4" />
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
