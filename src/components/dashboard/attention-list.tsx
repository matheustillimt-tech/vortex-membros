import Link from "next/link";
import { ChevronRightIcon } from "./icons";

const nf = new Intl.NumberFormat("pt-BR");

export type AttentionItem = { label: string; category: string; count: number; href: string; tone: "red" | "amber"; icon: React.ReactNode };

/** "Precisa de atenção": só as filas com algo esperando; o contador é o número de filas. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const open = items.filter((i) => i.count > 0);
  const lastRow = open.length % 2 === 0 ? open.length - 2 : open.length - 1;
  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-col gap-1 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-gray-900">Precisa de atenção</h2>
          {open.length > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-50 px-1.5 text-label font-semibold tabular-nums text-amber-700">{open.length}</span>
          ) : null}
        </div>
        <span className="text-hint text-gray-400">Filas esperando por você</span>
      </div>
      {open.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-gray-400">Nenhuma fila esperando por você.</p>
      ) : (
        <ul className="grid flex-1 grid-cols-1 divide-y divide-gray-50 sm:grid-cols-2 sm:divide-y-0">
          {open.map((item, i) => (
            <li key={item.label} className={`sm:border-b sm:border-gray-50${i % 2 === 0 ? " sm:border-r" : ""}${i >= lastRow ? " sm:!border-b-0" : ""}`}>
              <Link
                href={item.href}
                className="group flex h-full items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${item.tone === "red" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600"}`}>{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug text-gray-700">{item.label}</span>
                  <span className="block text-label text-gray-400">{item.category}</span>
                </span>
                <span className={`text-xl font-semibold leading-none tabular-nums ${item.tone === "red" ? "text-red-600" : "text-gray-900"}`}>{nf.format(item.count)}</span>
                <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-gray-300 transition-colors group-hover:text-brand-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
