"use client";

import { useRef, useState } from "react";

/** Nome editável no lugar. Enter/blur salva; Esc cancela. */
export function InlineName({
  value,
  onSave,
  label,
  textClassName = "edicao-inline-texto",
}: {
  value: string;
  onSave: (name: string) => void;
  label: string;
  /** Classe do texto (padrão: linha de lista; título do produto usa text-xl font-semibold). */
  textClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Enter salva e desmonta o input; o blur que vem junto não pode salvar de novo.
  const done = useRef(false);

  function commit() {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const name = draft.trim();
    if (name && name !== value) onSave(name);
    else setDraft(value);
  }

  return (
    <span className="-mx-1 block w-fit min-w-0 max-w-full">
      {editing ? (
        <input
          autoFocus
          aria-label={label}
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              done.current = true;
              setDraft(value);
              setEditing(false);
            }
          }}
          className={`edicao-inline-input ${textClassName} ring-2 ring-brand-500/15`}
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            done.current = false;
            setDraft(value);
            setEditing(true);
          }}
          className="edicao-inline-botao group block w-fit max-w-full"
        >
          <span className={`${textClassName} block w-fit max-w-full truncate`}>{value}</span>
        </button>
      )}
    </span>
  );
}
