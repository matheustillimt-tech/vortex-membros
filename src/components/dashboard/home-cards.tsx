import Link from "next/link";
import { ArrowRightIcon, InfoIcon } from "./icons";
import { Sparkline } from "./sparkline";

const nf = new Intl.NumberFormat("pt-BR");

/** Selo de variação ("-93%"): vermelho para queda, verde para alta. */
export function VariationBadge({ value }: { value: number }) {
  const down = value < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-label font-medium tabular-nums ${down ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}
    >
      <svg aria-hidden className={`h-3 w-3${down ? " rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12 7-7 7 7" />
        <path d="M12 19V5" />
      </svg>
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

type Card = {
  label: string;
  tip: string;
  href: string;
  value: number;
  badge?: number | null;
  sub?: string;
  spark?: number[];
};

/** Coluna de cards do Início (Alunos, Novos no mês, Acessos hoje). */
export function HomeCards({ cards }: { cards: Card[] }) {
  return (
    <ul className="grid grid-cols-2 divide-gray-100 lg:grid-cols-1 lg:divide-y">
      {cards.map((c, i) => {
        const last = i === cards.length - 1;
        const cls = last ? "col-span-2 lg:col-span-1" : `border-b border-gray-100 lg:border-b-0${i % 2 === 0 ? " border-r lg:border-r-0" : ""}`;
        return (
          <li key={c.label} className={`min-w-0 ${cls}`}>
            <Link
              href={c.href}
              className="group block h-full px-5 py-4 transition-colors hover:bg-gray-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
            >
              <div className="flex items-center gap-1.5 text-hint text-gray-500">
                <span className="truncate">{c.label}</span>
                <span className="tooltip" title={c.tip}>
                  <span tabIndex={0} aria-label={c.tip} className="inline-flex rounded-full text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <InfoIcon className="h-3.5 w-3.5" />
                  </span>
                </span>
                <ArrowRightIcon className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-gray-900">{nf.format(c.value)}</span>
                    {c.badge !== undefined && c.badge !== null ? <VariationBadge value={c.badge} /> : null}
                  </div>
                  {c.sub ? <p className="mt-1 truncate text-hint text-gray-400">{c.sub}</p> : null}
                </div>
                {c.spark ? (
                  <div className="hidden w-20 flex-shrink-0 lg:block">
                    <Sparkline values={c.spark} label="Cadastros por semana nas últimas 8 semanas" />
                  </div>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
