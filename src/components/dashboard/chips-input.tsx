"use client";

import { useState } from "react";
import { XIcon } from "./icons";

/** Quebra o texto digitado/colado em itens (Enter, vírgula, quebra de linha ou tab). */
export function splitChips(text: string): string[] {
  return text
    .split(/[,\n\r\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Campo de chips (IDs de produto do gateway, códigos da entrega): cada valor vira uma etiqueta
 * mono com X; Enter ou vírgula confirma, colar uma lista inteira separa sozinho, Backspace no
 * campo vazio remove o último. (modal "Lista de produtos ignorados").
 */
export function ChipsInput({
  id,
  values,
  onChange,
  placeholder,
  maxLength = 100,
  disabled = false,
}: {
  id?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add(items: string[]) {
    const next = [...values];
    for (const raw of items) {
      const v = raw.slice(0, maxLength);
      if (v && !next.includes(v)) next.push(v);
    }
    if (next.length !== values.length) onChange(next);
  }
  function commit() {
    add(splitChips(draft));
    setDraft("");
  }

  return (
    <div>
      <div
        onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
        className="flex min-h-[38px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15 has-[input:disabled]:pointer-events-none has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50"
      >
        {values.map((v) => (
          <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-md bg-gray-100 py-0.5 pl-2 pr-1 font-mono text-badge text-gray-700">
            <span className="truncate">{v}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remover ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="flex-shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          id={id}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.target.value;
            if (/[,\n\r\t]/.test(t)) {
              add(splitChips(t));
              setDraft("");
            } else setDraft(t);
          }}
          onPaste={(e) => {
            const items = splitChips(e.clipboardData.getData("text"));
            if (items.length > 1) {
              e.preventDefault(); // o campo de uma linha perderia as quebras
              add(items);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && draft === "" && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          className="min-w-[140px] flex-1 bg-transparent py-0.5 text-hint text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
