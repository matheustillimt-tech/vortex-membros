"use client";

import { createContext, useContext, useState } from "react";
import { CheckIcon, InfoIcon } from "./icons";

/**
 * Peças das telas de configurações: seção "painel-aside" (título/descrição à
 * esquerda, card de linhas zebradas à direita), linha de formulário, toggle, cards de opção,
 * pílulas e controle segmentado. Classes do projeto.
 */

/** Avisa o formulário de uma mudança que não dispara `change` nativo (toggles com hidden input). */
export const DirtyContext = createContext<() => void>(() => {});

export function Section({ title, description, className = "", children }: { title: string; description: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`painel-aside grid items-start gap-3 md:grid-cols-[280px_1fr] md:gap-8${className ? ` ${className}` : ""}`}>
      <div className="min-w-0 painel-titulo-desc">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-hint text-gray-500">{description}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white min-w-0">
        <div className="painel-linhas">{children}</div>
      </div>
    </div>
  );
}

export function Tip({ text }: { text: string }) {
  return (
    <span className="tooltip">
      <span
        tabIndex={0}
        title={text}
        aria-label={text}
        className="inline-flex rounded-full text-gray-300 hover:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <InfoIcon className="h-3.5 w-3.5" />
      </span>
    </span>
  );
}

type RowProps = {
  label: React.ReactNode;
  htmlFor?: string;
  tip?: string;
  required?: boolean;
  /** "wide" = md:grid-cols-[1fr_3fr] (cards/pílulas); padrão [2fr_3fr]. */
  wide?: boolean;
  /** Texto abaixo do rótulo (ex.: tamanho recomendado da miniatura). */
  hint?: string;
  onClick?: () => void;
  children: React.ReactNode;
};

export function Row({ label, htmlFor, tip, required, wide, hint, onClick, children }: RowProps) {
  const labelEl = (
    <div className="flex items-center gap-1.5 mb-2 md:mb-0 md:pt-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm text-gray-700">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </label>
      ) : (
        <span className="text-sm text-gray-700">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </span>
      )}
      {tip ? <Tip text={tip} /> : null}
    </div>
  );
  return (
    <div
      className={`p-5 md:grid ${wide ? "md:grid-cols-[1fr_3fr]" : "md:grid-cols-[2fr_3fr]"} md:items-start md:gap-8${onClick ? " cursor-pointer select-none" : ""}`}
      onClick={onClick}
    >
      {hint ? (
        <div className="min-w-0">
          {labelEl}
          <div className="mt-3 mb-2 md:mb-0">
            <p className="text-hint text-gray-400">{hint}</p>
          </div>
        </div>
      ) : (
        labelEl
      )}
      <div className="min-w-0 md:flex md:flex-col md:items-end">{children}</div>
    </div>
  );
}

/** Interruptor 44×24 (role="switch") com o valor num hidden "1"/"0". */
export function Switch({ name, checked, label, onChange }: { name: string; checked: boolean; label: string; onChange: (v: boolean) => void }) {
  const markDirty = useContext(DirtyContext);
  return (
    <span className="inline-flex h-9 flex-shrink-0 items-center">
      <input type="hidden" name={name} value={checked ? "1" : "0"} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
          markDirty();
        }}
        className={`inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
          checked ? "bg-brand-500" : "bg-gray-200"
        }`}
      >
        <span aria-hidden="true" className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </span>
  );
}

/** Linha inteira clicável com toggle à direita (padrão do projeto). */
export function ToggleRow({
  name,
  label,
  tip,
  defaultChecked,
  onChange,
}: {
  name: string;
  label: string;
  tip?: string;
  defaultChecked: boolean;
  onChange?: (v: boolean) => void;
}) {
  const [on, setOn] = useState(defaultChecked);
  const markDirty = useContext(DirtyContext);
  const set = (v: boolean) => {
    setOn(v);
    onChange?.(v);
  };
  return (
    <Row
      label={label}
      tip={tip}
      onClick={() => {
        set(!on);
        markDirty();
      }}
    >
      <Switch name={name} checked={on} label={label} onChange={set} />
    </Row>
  );
}

export type CardOption<T extends string> = { value: T; label: string; icon: React.ReactNode; disabled?: boolean };

const CARD =
  "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border px-2.5 py-2.5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/30 bg-white aspect-square w-28";

/** Cards quadrados de opção (Formato, Modelo de listagem). */
export function RadioCards<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: CardOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={o.value}
            className={`${CARD} ${on ? "border-brand-500" : "border-gray-200 hover:border-gray-300"}${o.disabled ? " cursor-not-allowed opacity-50" : ""}`}
          >
            <input type="radio" name={name} value={o.value} className="sr-only" checked={on} disabled={o.disabled} onChange={() => onChange(o.value)} />
            {on ? (
              <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white">
                <CheckIcon className="h-2.5 w-2.5" />
              </span>
            ) : null}
            <span className={`flex h-9 items-center justify-center ${on ? "text-brand-500" : "text-gray-400"}`}>{o.icon}</span>
            <span className="mt-2 flex items-center justify-center gap-1 text-[13px] font-medium text-gray-900">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Pílulas de opção (Formato da miniatura). */
export function RadioPills<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: CardOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={o.value}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-[7px] text-[13px] font-medium text-gray-900 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/30 ${
              on ? "border-brand-500 bg-brand-50/60" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <input type="radio" name={name} value={o.value} className="sr-only" checked={on} onChange={() => onChange(o.value)} />
            <span className={`inline-flex flex-shrink-0 ${on ? "text-brand-500" : "text-gray-400"}`}>{o.icon}</span>
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

/** Controle segmentado (Navegação › Tipo). */
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: CardOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex h-[38px] max-w-full items-center rounded-lg border border-gray-200" role="radiogroup">
      <div className="segmentado-trilho scroll-oculto flex h-full min-w-0 items-center overflow-x-auto overscroll-x-contain p-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={o.value}
              className={`flex h-full shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-4 max-sm:px-3 text-hint font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/30 ${
                on ? "bg-brand-50 text-brand-700" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              <input type="radio" name={name} value={o.value} className="sr-only" checked={on} onChange={() => onChange(o.value)} />
              {o.icon}
              {o.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
