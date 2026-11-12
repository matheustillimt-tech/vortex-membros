import type { ButtonHTMLAttributes } from "react";

/** Botões do painel. */
const BASE =
  "inline-flex items-center gap-2 px-4 py-2 text-hint font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS = {
  primary: "focus:ring-brand-500/30 border border-transparent bg-brand-500 hover:bg-brand-600 text-white shadow-sm",
  outline: "focus:ring-brand-500/30 border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50",
  brand: "focus:ring-brand-500/30 border border-brand-500 text-brand-600 hover:bg-brand-50",
  ghost: "focus:ring-brand-500/30 border border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50",
  danger: "focus:ring-red-500/30 border border-transparent bg-red-600 hover:bg-red-700 text-white shadow-sm",
  /** Excluir no cabeçalho do produto. */
  dangerGhost: "focus:ring-red-500/30 border border-transparent text-red-600 hover:text-red-700 hover:bg-red-50",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return `${BASE} ${VARIANTS[variant]}${extra ? ` ${extra}` : ""}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}
