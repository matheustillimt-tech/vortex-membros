"use client";

import { useEffect, useRef, useState } from "react";
import { filterOptions as filterByQuery } from "./combobox";
import { CheckIcon, ChevronDownIcon, PlusCircleIcon, SearchIcon, XIcon } from "./icons";
import { Spinner } from "./panel-dialog";

export type ChipOption = { value: string; label: string };

/**
 * Chip de filtro da lista de alunos: pílula tracejada; com seleção, "x" à esquerda
 * ("Remover filtro {nome}") e o resumo em brand. Abre "Filtrado por: {nome}" com busca opcional;
 * escolha única aplica no clique, múltipla tem checkbox e "Aplicar". `load` busca as opções na primeira
 * abertura (Produtos, Vitrine, Entrega e Tags só carregam quando o dropdown abre).
 */
export function StudentFilterChip({
  id,
  label,
  name,
  multiple = false,
  searchable = false,
  options: initial,
  load,
  selected,
  selectedLabels,
  busy = false,
  onChange,
}: {
  id: string;
  label: string;
  /** Nome em minúsculas para "Filtrado por:" e "Remover filtro". */
  name: string;
  multiple?: boolean;
  searchable?: boolean;
  options?: ChipOption[];
  load?: () => Promise<ChipOption[] | null>;
  selected: string[];
  /** Rótulos das opções já escolhidas (para o resumo antes de carregar as opções). */
  selectedLabels?: Record<string, string>;
  busy?: boolean;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ChipOption[] | null>(initial ?? null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [marked, setMarked] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);
  const active = selected.length > 0;

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    if (open) return setOpen(false);
    setMarked(selected);
    setQuery("");
    setOpen(true);
    if (!options && load) {
      setLoading(true);
      const loaded = await load();
      setLoading(false);
      if (loaded) setOptions(loaded);
    }
  }

  const labelOf = (v: string) => options?.find((o) => o.value === v)?.label ?? selectedLabels?.[v] ?? v;
  const summary = selected.map(labelOf).join(", ");
  const shown = options ? (searchable ? filterByQuery(options, query) : options) : [];

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <div
        data-chip-pilula=""
        className={`inline-flex h-9 items-center rounded-full border text-hint font-medium transition-colors ${
          active ? "border-gray-300 text-gray-900 hover:bg-gray-50" : "border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        {active ? (
          <button
            type="button"
            aria-label={`Remover filtro ${name}`}
            disabled={busy}
            onClick={() => onChange([])}
            className="flex h-full items-center rounded-l-full pl-2.5 pr-1 text-gray-400 transition-colors hover:text-gray-700"
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : null}
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={busy}
          onClick={toggle}
          className={`flex h-full items-center gap-1.5 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:cursor-wait ${active ? "pl-1 pr-3" : "px-3"}`}
        >
          {active ? null : busy ? <Spinner /> : <PlusCircleIcon className="h-4 w-4 text-gray-400" />}
          <span>{label}</span>
          {active ? (
            <>
              <span className="mx-1 h-4 w-px bg-gray-300" aria-hidden="true" />
              <span className="max-w-48 truncate text-brand-600">{summary}</span>
              {busy ? <Spinner /> : <ChevronDownIcon className="h-3.5 w-3.5 text-brand-600" />}
            </>
          ) : null}
        </button>
      </div>
      {open ? (
        <div className={`absolute left-0 top-full z-50 mt-1.5 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-3 shadow-lg ${multiple || searchable ? "w-80" : "w-72"}`}>
          <p className="mb-2 text-sm font-semibold text-gray-900">Filtrado por: {name}</p>
          {searchable ? (
            <div className="mb-2 flex h-8 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 text-hint transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
              <SearchIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              <input
                type="text"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar..."
                className="h-full min-w-0 flex-1 bg-transparent text-hint text-gray-900 outline-none focus-visible:outline-none placeholder-gray-400"
              />
            </div>
          ) : null}
          <div className="scroll-fino -mx-1 max-h-64 space-y-0.5 overflow-y-auto px-1" role="listbox" aria-multiselectable={multiple || undefined} aria-labelledby={id}>
            {loading ? (
              <div className="space-y-2 py-1" aria-hidden="true">
                <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
              </div>
            ) : null}
            {shown.map((o) =>
              multiple ? (
                <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-hint text-gray-700 transition-colors hover:bg-gray-50">
                  <input
                    type="checkbox"
                    value={o.value}
                    checked={marked.includes(o.value)}
                    onChange={(e) => setMarked((m) => (e.target.checked ? [...m, o.value] : m.filter((v) => v !== o.value)))}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30"
                  />
                  <span className="min-w-0 flex-1 break-words">{o.label}</span>
                </label>
              ) : (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={selected[0] === o.value}
                  onClick={() => {
                    setOpen(false);
                    onChange(selected[0] === o.value ? [] : [o.value]);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-hint transition-colors ${
                    selected[0] === o.value ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="min-w-0 flex-1 break-words">{o.label}</span>
                  {selected[0] === o.value ? <CheckIcon className="h-4 w-4 flex-shrink-0 text-brand-500" /> : null}
                </button>
              ),
            )}
            {!loading && options && options.length === 0 ? <p className="px-1.5 py-1.5 text-hint text-gray-400">Sem opções</p> : null}
            {!loading && options && options.length > 0 && shown.length === 0 ? (
              <p className="px-1.5 py-1.5 text-center text-hint text-gray-400">Nenhum resultado</p>
            ) : null}
          </div>
          {multiple ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onChange(marked);
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-500 px-4 py-2 text-hint font-medium text-brand-600 transition-colors hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:ring-offset-2"
            >
              <CheckIcon className="h-4 w-4" />
              Aplicar
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
