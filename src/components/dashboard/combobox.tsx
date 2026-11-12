"use client";

import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";
import { DirtyContext } from "./settings-form";

export type ComboOption = { value: string; label: string; sub?: string };

/** Listas com mais de 8 opções ganham busca no topo. */
export const SEARCH_THRESHOLD = 8;

/** Filtra as opções pela busca (sem acento, sem caixa). */
export function filterOptions(options: ComboOption[], query: string): ComboOption[] {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = fold(query.trim());
  return q ? options.filter((o) => fold(o.label).includes(q) || (o.sub ? fold(o.sub).includes(q) : false)) : options;
}

/**
 * Combobox do painel (no lugar do <select> nativo): botão 38px + lista. O valor vai num input hidden
 * com o mesmo `name`. Setas mudam a opção ativa, Enter escolhe, Esc e clique fora fecham.
 */
export function Combobox({
  name,
  options,
  value: controlled,
  defaultValue = "",
  onChange,
  id,
  placeholder = "Selecione…",
  required,
  disabled,
  "aria-label": ariaLabel,
}: {
  name: string;
  options: ComboOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  id?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const markDirty = useContext(DirtyContext);
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const searchable = options.length > SEARCH_THRESHOLD;
  const shown = searchable ? filterOptions(options, query) : options;
  const selected = options.find((o) => o.value === value);

  function openList() {
    if (disabled) return;
    const r = button.current?.getBoundingClientRect();
    const need = Math.min(options.length, 6) * 36 + 8 + (searchable ? 52 : 0) + 4;
    setUp(!!r && window.innerHeight - r.bottom < need && r.top > window.innerHeight - r.bottom);
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(focus = true) {
    setOpen(false);
    if (focus) button.current?.focus();
  }

  function pick(o: ComboOption) {
    if (o.value !== value) {
      if (controlled === undefined) setOwn(o.value);
      onChange?.(o.value);
      markDirty();
    }
    close();
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useLayoutEffect(() => {
    if (open && searchable) search.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === "Enter" || (e.key === " " && !searchable)) {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // dentro de um modal, Esc fecha só a lista
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  const activeId = open && shown[active] ? `${listId}-${active}` : undefined;

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={value} />
      {required ? (
        // input hidden não é validado: este espelho (sem name) faz o navegador exigir uma escolha.
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          onFocus={() => button.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        />
      ) : null}
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={searchable ? undefined : activeId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-hint outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`min-w-0 break-words text-left ${selected ? "text-gray-900" : "text-gray-400"}`}>{selected ? selected.label : placeholder}</span>
        <svg
          aria-hidden="true"
          className="ml-2 h-4 w-4 flex-shrink-0 text-gray-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m7 15 5 5 5-5" />
          <path d="m7 9 5-5 5 5" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute z-50 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          style={up ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }}
        >
          {searchable ? (
            <div className="p-2">
              <input
                ref={search}
                type="text"
                role="searchbox"
                aria-label="Buscar"
                aria-controls={listId}
                aria-activedescendant={activeId}
                placeholder="Buscar…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-hint text-gray-900 placeholder-gray-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
            </div>
          ) : null}
          <ul id={listId} role="listbox" className="scroll-fino max-h-48 overflow-y-auto py-1">
            {shown.length === 0 ? <li className="px-3 py-2 text-hint text-gray-400">Nada encontrado</li> : null}
            {shown.map((o, i) => {
              const on = o.value === value;
              return (
                <li key={o.value} role="presentation">
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={on}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-hint transition-colors${i === active ? " bg-brand-50" : ""}`}
                  >
                    {on ? <CheckIcon className="h-3.5 w-3.5 flex-shrink-0 text-brand-500" /> : <span className="w-3.5 flex-shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-gray-900">{o.label}</span>
                      {o.sub ? <span className="block break-words text-micro text-gray-400">{o.sub}</span> : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
