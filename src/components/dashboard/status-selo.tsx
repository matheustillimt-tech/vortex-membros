"use client";

import { Dropdown, MenuItem } from "./dropdown";
import { CheckCircleIcon, ChevronDownIcon, EyeOffIcon } from "./icons";

export type StatusOption<S extends string> = { value: S; label: string; tone: "success" | "neutral" };

/** Selo de status clicável (selo selo--botao) com menu para trocar o status. */
export function StatusSelo<S extends string>({
  value,
  options,
  onChange,
}: {
  value: S;
  options: StatusOption<S>[];
  onChange: (status: S) => void;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const Icon = (tone: StatusOption<S>["tone"]) =>
    tone === "success" ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />;
  return (
    <span className="inline-flex items-center sm:col-start-2 sm:row-span-2 sm:row-start-1">
      <Dropdown
        trigger={(p) => (
          <button type="button" {...p} className={`selo selo--botao selo--${current.tone}`}>
            {Icon(current.tone)}
            {current.label}
            <ChevronDownIcon className="h-3 w-3 opacity-60" />
          </button>
        )}
      >
        {options.map((o) => (
          <MenuItem
            key={o.value}
            active={o.value === value}
            icon={o.tone === "success" ? <CheckCircleIcon className="h-4 w-4 flex-shrink-0" /> : <EyeOffIcon className="h-4 w-4 flex-shrink-0" />}
            onSelect={() => o.value !== value && onChange(o.value)}
          >
            {o.label}
          </MenuItem>
        ))}
      </Dropdown>
    </span>
  );
}

export const SHOWCASE_STATUS: StatusOption<"published" | "unlisted">[] = [
  { value: "published", label: "Publicado", tone: "success" },
  { value: "unlisted", label: "Não listado", tone: "neutral" },
];
export const PRODUCT_STATUS: StatusOption<"published" | "hidden">[] = [
  { value: "published", label: "Publicado", tone: "success" },
  { value: "hidden", label: "Oculto", tone: "neutral" },
];
