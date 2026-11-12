"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ProductReportRow } from "@/lib/dashboard/reports";
import { buttonClass } from "./button";
import { FilterChip } from "./filter-chip";
import { ArrowRightIcon, ChevronDownIcon, ChevronUpIcon, FilterIcon, PackageIcon, PlayListIcon, SearchIcon, XIcon } from "./icons";
import { KpiCard, ReportHeader, nf } from "./reports";

const PAGE = 12;
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Relatório Produtos: busca, filtro Vitrine, KPI e lista de 12 em 12. */
export function ReportProductsBoard({ rows, showcases }: { rows: ProductReportRow[]; showcases: { id: number; name: string }[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [vitrines, setVitrines] = useState<string[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = fold(q.trim());
    return rows.filter((r) => (!term || fold(r.name).includes(term)) && (vitrines.length === 0 || vitrines.includes(String(r.showcaseId))));
  }, [rows, q, vitrines]);
  const visible = filtered.slice(0, shown);

  const search = (
    <div className="w-full sm:w-72">
      <form
        className="flex"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft);
          setShown(PAGE);
        }}
      >
        <div
          data-busca-caixa=""
          className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg border border-gray-200 bg-white text-hint transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-hint text-gray-900 outline-none placeholder-gray-400"
            placeholder="Buscar produto..."
            aria-label="Buscar produto..."
          />
          {draft || q ? (
            <button
              type="button"
              aria-label="Limpar pesquisa"
              onClick={() => {
                setDraft("");
                setQ("");
                setShown(PAGE);
              }}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-gray-600"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="submit"
            aria-label="Pesquisar"
            className="flex h-full w-9 flex-shrink-0 items-center justify-center rounded-r-lg border-l border-gray-200 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <ReportHeader back={{ href: "/dashboard/reports#learning", label: "Voltar para Relatórios" }} title="Produtos" subtitle="Quanto os alunos avançam em cada produto" actions={search} />

      <div data-toolbar="" className="mb-6 flex flex-wrap items-center gap-2 lg:sticky lg:top-0 lg:z-30 lg:-mt-3 lg:mb-3 lg:bg-white lg:py-3 coluna:top-14">
        <div data-filtros-botao="" className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)} className={buttonClass("outline", "flex-shrink-0")}>
            <FilterIcon className="h-4 w-4" /> Filtros <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          </button>
        </div>
        <div data-filters-left="" className={`flex min-w-0 flex-1 flex-wrap items-center gap-2${filtersOpen ? " filtros-abertos" : ""}`}>
          <FilterChip
            id="filter-vitrines-trigger"
            label="Vitrine"
            options={showcases.map((s) => ({ value: String(s.id), label: s.name }))}
            selected={vitrines}
            onChange={(v) => {
              setVitrines(v);
              setShown(PAGE);
            }}
          />
        </div>
        <div data-filters-right="" className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-shrink-0" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard icon={PackageIcon} tone="brand" value={nf.format(filtered.length)} label="Total de produtos" />
      </div>

      <div role="table" style={{ "--lista-cols": "minmax(0,1fr) 11rem 10rem 6rem 2.25rem", "--lista-acoes": 1 } as React.CSSProperties} className="lista lista--card">
        <div className="lista-cabecalho-envelope">
          <div role="row" className="lista-cabecalho">
            <div role="columnheader" className="lista-celula lista-th">
              Produto
            </div>
            <div role="columnheader" className="lista-celula lista-th">
              Alunos
            </div>
            <div role="columnheader" className="lista-celula lista-th">
              Progresso
            </div>
            <div role="columnheader" className="lista-celula lista-th lista-celula--centro">
              Aulas
            </div>
            <div role="columnheader" className="lista-celula lista-th lista-celula--fim">
              <span className="sr-only">Ações</span>
            </div>
          </div>
        </div>
        <div role="rowgroup" className="lista-corpo">
          {visible.length === 0 ? (
            <div role="row" className="lista-linha">
              <div role="cell" className="lista-celula text-sm text-gray-400">
                Nenhum produto encontrado
              </div>
            </div>
          ) : null}
          {visible.map((r) => {
            const href = `/dashboard/reports/products/${r.id}`;
            return (
              <div
                key={r.id}
                role="row"
                data-linha-abrir=""
                className="lista-linha lista-linha--dividida lista-linha--clicavel"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a,button")) return;
                  router.push(href);
                }}
              >
                <div role="cell" data-papel="titulo" className="lista-celula !block min-w-0">
                  <span className="block truncate text-xs text-gray-400">{r.showcaseName}</span>
                  <Link href={`/dashboard/content/product/${r.id}`} className="text-sm font-medium text-gray-900 transition-colors hover:text-brand-500">
                    {r.name}
                  </Link>
                </div>
                <div role="cell" data-papel="secundario" className="lista-celula !block" title="Com progresso / acesso">
                  <span className="text-sm tabular-nums text-gray-900">
                    {nf.format(r.withProgress)} <span className="text-gray-300">/</span> {nf.format(r.withAccess)}
                  </span>
                  <span className="block whitespace-nowrap text-label text-gray-400">Com progresso / acesso</span>
                </div>
                <div role="cell" data-papel="meta" className="lista-celula gap-2.5">
                  <div className="h-1.5 !w-24 w-32 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${r.progress}%` }} />
                  </div>
                  <span className="text-sm font-medium tabular-nums text-gray-700">{r.progress}%</span>
                </div>
                <div role="cell" data-papel="meta" className="lista-celula lista-celula--centro">
                  <span className="tooltip" title="Ver relatório das aulas">
                    <Link
                      href={href}
                      aria-label="Ver relatório das aulas"
                      className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-sm font-medium tabular-nums text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                    >
                      {nf.format(r.lessons)}
                      <PlayListIcon className="h-4 w-4" />
                    </Link>
                  </span>
                </div>
                <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim">
                  <Link href={href} className="btn-icone btn-abrir" data-abrir="" aria-label="Ver relatório das aulas">
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {filtered.length > PAGE ? (
        <div className="mt-4 flex items-center justify-center gap-2">
          {shown < filtered.length ? (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <ChevronDownIcon className="h-4 w-4" />
              <span>Carregar mais resultados</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <ChevronUpIcon className="h-4 w-4" /> Voltar ao topo
          </button>
        </div>
      ) : null}
    </div>
  );
}
