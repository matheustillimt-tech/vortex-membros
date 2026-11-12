"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, PlusCircleIcon, XIcon } from "./icons";

export type ChipOption = { value: string; label: string };

/** Chip de filtro: pílula tracejada; com seleção, borda contínua. */
export function FilterChip({
  id,
  label,
  options,
  selected,
  onChange,
}: {
  id: string;
  label: string;
  options: ChipOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
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

  const names = options.filter((o) => selected.includes(o.value)).map((o) => o.label);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <div
        data-chip-pilula=""
        className={`inline-flex h-9 items-center rounded-full border text-hint font-medium transition-colors ${
          active
            ? "border-gray-300 text-gray-900 hover:bg-gray-50"
            : "border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-full items-center gap-1.5 rounded-full px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/30"
        >
          <PlusCircleIcon className={`h-4 w-4 text-gray-400${active ? " hidden" : ""}`} />
          <span>{label}</span>
          {active ? (
            <>
              <span className="h-4 w-px bg-gray-200" aria-hidden />
              <span className="max-w-40 truncate text-brand-600">{names.join(", ")}</span>
            </>
          ) : null}
        </button>
        {active ? (
          <button
            type="button"
            aria-label={`Limpar filtro ${label}`}
            onClick={() => onChange([])}
            className="btn-icone -ml-1 mr-1.5 !min-h-0 !min-w-0 !p-0.5"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby={id}
          className="absolute left-0 top-full z-50 mt-1 min-w-48 rounded-lg border border-zinc-200 bg-white p-[.3125rem] shadow-xs"
        >
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                className="flex w-full select-none items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus:outline-hidden focus-visible:bg-zinc-50"
              >
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                    on ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 bg-white"
                  }`}
                >
                  {on ? <CheckIcon className="h-3 w-3" /> : null}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
