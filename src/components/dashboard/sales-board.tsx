"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  deleteSaleAction,
  ignoreSaleAction,
  listSalesAction,
  reprocessErrorsAction,
  reprocessQueueAction,
  reprocessSaleAction,
  saveIgnoredProductsAction,
} from "@/app/dashboard/sales/actions";
import { PROCESSING, SALE_STATUS, SEARCH_FIELDS, type SaleRow, type SalesFilters } from "@/app/dashboard/sales/rows";
import type { ActionResult } from "@/app/dashboard/action-utils";
import type { SalesSearchField, SalesView } from "@/lib/sales/sales-store";
import { buttonClass } from "./button";
import { ChipsInput } from "./chips-input";
import { Dropdown, MenuItem, MenuSeparator } from "./dropdown";
import { FilterChip, type ChipOption } from "./filter-chip";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BanIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DotsIcon,
  EyeIcon,
  FilterIcon,
  RefreshIcon,
  RotateCcwIcon,
  SaveIcon,
  SearchIcon,
  SlidersIcon,
  TrashIcon,
  XIcon,
} from "./icons";
import { DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { GatewayLogo, SaleDrawer } from "./sale-drawer";
import { SalesSubnav } from "./sales-subnav";
import { Tip } from "./settings-form";
import { useAdminAction, type Fields } from "./use-admin-action";

export type SalesPageData = {
  rows: SaleRow[];
  nextCursor: number | null;
  limitReached: boolean;
  errorCount: number;
};

const VIEWS: { value: SalesView; label: string }[] = [
  { value: "latest", label: "Últimas" },
  { value: "queued", label: "Na Fila" },
  { value: "error", label: "Com erro" },
];

const IGNORED_FORM = "form-produtos-ignorados";

function salesHref(f: SalesFilters): string {
  const qs = new URLSearchParams();
  if (f.view !== "latest") qs.set("view", f.view);
  for (const g of f.gateways) qs.append("gateways", g);
  if (f.q) {
    if (f.field !== "email") qs.set("field", f.field);
    qs.set("q", f.q);
  }
  const s = qs.toString();
  return s ? `/dashboard/sales?${s}` : "/dashboard/sales";
}

function filterFields(f: SalesFilters): FormData {
  const fd = new FormData();
  fd.set("view", f.view);
  for (const g of f.gateways) fd.append("gateways", g);
  fd.set("field", f.field);
  fd.set("q", f.q);
  return fd;
}

/* ---------- busca com seletor de campo ---------- */

function SalesSearch({ filters, onSearch, busy }: { filters: SalesFilters; onSearch: (field: SalesSearchField, q: string) => void; busy: boolean }) {
  const [field, setField] = useState<SalesSearchField>(filters.field);
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = SEARCH_FIELDS.find((f) => f.value === field) ?? SEARCH_FIELDS[0];

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

  return (
    <div className="w-full sm:w-96">
      <form
        className="flex"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(field, q.trim());
        }}
      >
        <div
          data-busca-caixa=""
          className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg border border-gray-200 bg-white text-hint transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15"
        >
          <div ref={ref} className="relative h-full flex-shrink-0">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="flex h-full items-center gap-1.5 whitespace-nowrap rounded-l-lg border-r border-gray-200 px-3 text-hint text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            >
              <span>{current.label}</span>
              <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            </button>
            {open ? (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg" role="listbox">
                {SEARCH_FIELDS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="option"
                    aria-selected={f.value === field}
                    onClick={() => {
                      setField(f.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-hint transition-colors ${
                      f.value === field ? "bg-gray-50 text-gray-900" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input
            type="text"
            value={q}
            readOnly={busy}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-hint text-gray-900 outline-none placeholder-gray-400 read-only:cursor-progress"
            placeholder={current.placeholder}
            aria-label={current.placeholder}
          />
          {q ? (
            <button
              type="button"
              aria-label="Limpar pesquisa"
              disabled={busy}
              onClick={() => {
                setQ("");
                if (filters.q) onSearch(field, "");
              }}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-wait disabled:opacity-50"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="submit"
            aria-label="Pesquisar"
            disabled={busy}
            className="flex h-full w-9 flex-shrink-0 items-center justify-center rounded-r-lg border-l border-gray-200 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:cursor-wait disabled:hover:bg-transparent"
          >
            {busy ? <Spinner /> : <SearchIcon className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Funil no cabeçalho da coluna Gateway: os mesmos gateways do chip. */
function ColumnFilter({ options, selected, onChange }: { options: ChipOption[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  const active = selected.length > 0;
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label="Filtrar"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${active ? "text-brand-500" : "text-gray-300 hover:text-gray-500"}`}
      >
        <FilterIcon className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <div className="scroll-fino max-h-64 space-y-0.5 overflow-y-auto transition-opacity">
            {options.length === 0 ? <p className="px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-gray-400">Sem opções</p> : null}
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-gray-700 transition-colors hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  value={o.value}
                  checked={selected.includes(o.value)}
                  onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30 disabled:cursor-wait"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- modais ---------- */

function DeleteSaleDialog({ open, onClose, onConfirm, pending }: { open: boolean; onClose: () => void; onConfirm: () => void; pending: boolean }) {
  const titleId = useId();
  return (
    <PanelDialog open={open} onClose={onClose} labelledBy={titleId}>
      <div className="p-5">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
            <TrashIcon className="h-5 w-5 text-red-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="mb-1 text-base font-semibold text-gray-900">
              Excluir venda
            </h3>
            <p className="text-sm text-gray-500">Tem certeza que deseja excluir esta venda? Ela será movida para a lixeira (recuperável).</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={buttonClass("outline", "w-full justify-center")}>
            <XIcon className="h-4 w-4" />
            Não, cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-red-500 px-4 py-2 text-hint font-medium text-white shadow-sm transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Spinner /> : <TrashIcon className="h-4 w-4" />}
            Sim, excluir
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}

function IgnoredProductsDialog({
  open,
  onClose,
  initial,
  onSave,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  initial: string[];
  onSave: (ids: string[]) => void;
  pending: boolean;
  error: string | null;
}) {
  const titleId = useId();
  const [ids, setIds] = useState(initial);
  return (
    <PanelDialog open={open} onClose={onClose} labelledBy={titleId} widthClass="sm:max-w-lg">
      <DialogHeader id={titleId} title="Lista de produtos ignorados" onClose={onClose} />
      <div className="">
        <p className="px-5 pt-5 text-sm text-gray-500">
          Ignore produtos que você não entrega pela plataforma. As vendas deles deixam de ser processadas e não geram erro.
        </p>
        {error ? (
          <div role="alert" className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
            {error}
          </div>
        ) : null}
        <form
          id={IGNORED_FORM}
          onSubmit={(e) => {
            e.preventDefault();
            onSave(ids);
          }}
        >
          <div className="min-w-0">
            <div className="painel-linhas">
              <div className="p-5">
                <div className="mb-2 flex items-center gap-1.5">
                  <label htmlFor="ignorados" className="text-sm text-gray-700">
                    IDs de produto a ignorar
                  </label>
                  <Tip text="É o ID do produto no gateway, o mesmo usado na oferta da entrega. Separe com Enter ou vírgula; dá para colar uma lista inteira." />
                </div>
                <div className="min-w-0">
                  <ChipsInput id="ignorados" values={ids} onChange={setIds} placeholder="Ex: 10288" disabled={pending} />
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={buttonClass("outline", "grow justify-center")}>
            Cancelar
          </button>
          <button type="submit" form={IGNORED_FORM} disabled={pending} className={buttonClass("primary", "grow justify-center")}>
            {pending ? <Spinner /> : <SaveIcon className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}

/* ---------- tela ---------- */

/**
 * Vendas: busca com seletor de campo, Reprocessar (Na Fila / Com erro), abas
 * Últimas / Na Fila / Com erro, chip Gateway, lista com selos, "Carregar mais resultados" até 200,
 * gaveta "Detalhes da Venda", menu da linha e os modais de exclusão e de produtos ignorados.
 */
export function SalesBoard({
  filters,
  data,
  gateways,
  ignoredProductIds,
}: {
  filters: SalesFilters;
  data: SalesPageData;
  gateways: ChipOption[];
  ignoredProductIds: string[];
}) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [list, setList] = useState(data);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [ignored, setIgnored] = useState(ignoredProductIds);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { pending, error, setError, run } = useAdminAction();
  const ignoredAction = useAdminAction();

  function go(next: SalesFilters, target: string) {
    setNavTarget(target);
    startNav(() => router.push(salesHref(next)));
  }

  /** Recarrega as linhas que já estão na tela (depois de reprocessar, ignorar, excluir). */
  async function reload() {
    const fd = filterFields(filters);
    fd.set("upTo", String(Math.max(list.rows.length, 20)));
    const res = await listSalesAction(fd);
    if (res.ok) setList({ rows: res.rows, nextCursor: res.nextCursor, limitReached: res.limitReached, errorCount: res.errorCount });
    else setListError(res.error);
  }

  async function loadMore() {
    if (list.nextCursor === null) return;
    setLoadingMore(true);
    const fd = filterFields(filters);
    fd.set("cursor", String(list.nextCursor));
    fd.set("loaded", String(list.rows.length));
    const res = await listSalesAction(fd);
    setLoadingMore(false);
    if (!res.ok) return setListError(res.error);
    setListError(null);
    setList((l) => ({
      rows: [...l.rows, ...res.rows.filter((r) => !l.rows.some((x) => x.id === r.id))],
      nextCursor: res.nextCursor,
      limitReached: res.limitReached,
      errorCount: res.errorCount,
    }));
  }

  function act(action: (fd: FormData) => Promise<ActionResult>, fields: Fields, after?: () => void) {
    run(action, fields, {
      onOk: () => {
        after?.();
        void reload();
      },
    });
  }

  function saveIgnored(ids: string[], after?: () => void) {
    const fd = new FormData();
    for (const id of ids) fd.append("ids", id);
    ignoredAction.run(saveIgnoredProductsAction, fd, {
      onOk: () => {
        setIgnored(ids);
        after?.();
      },
    });
  }

  const openIgnored = () => {
    ignoredAction.setError(null);
    setIgnoredOpen(true);
  };
  const busy = navigating ? navTarget : null;
  const rows = list.rows;

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Vendas</h1>
            <p className="mt-1 text-sm text-gray-500">Vendas recebidas dos gateways de pagamento</p>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <SalesSearch filters={filters} busy={busy === "search"} onSearch={(field, q) => go({ ...filters, field, q }, "search")} />
            <Dropdown
              trigger={(p) => (
                <button type="button" {...p} disabled={pending} className={buttonClass("outline", "flex-shrink-0")}>
                  {pending ? <Spinner /> : <RefreshIcon className="h-4 w-4" />}
                  Reprocessar
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
              )}
            >
              <MenuItem icon={<RotateCcwIcon className="me-2 size-5 shrink-0" />} onSelect={() => act(reprocessQueueAction, {})}>
                Na Fila
              </MenuItem>
              <MenuItem icon={<AlertCircleIcon className="me-2 size-5 shrink-0" />} onSelect={() => act(reprocessErrorsAction, {})}>
                Com erro
              </MenuItem>
            </Dropdown>
          </div>
        </div>
      </div>

      <SalesSubnav
        current="/dashboard/sales"
        actions={
          <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
            <button type="button" onClick={openIgnored} className={buttonClass("ghost", "flex-shrink-0 !px-2.5 !py-1.5")}>
              <BanIcon className="h-4 w-4" />
              Lista de produtos ignorados
            </button>
          </div>
        }
      />

      <div data-toolbar="" className="mb-6 flex flex-wrap items-center gap-2 lg:sticky lg:top-0 lg:z-30 lg:-mt-3 lg:mb-3 lg:bg-white lg:py-3 coluna:top-14">
        <div data-filtros-botao="" className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)} className={buttonClass("outline", "flex-shrink-0")}>
            <FilterIcon className="h-4 w-4" />
            Filtros
            <ChevronDownIcon className={`h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform duration-200${filtersOpen ? " rotate-180" : ""}`} />
          </button>
        </div>
        <div data-acoes-botao="" className="ml-auto flex flex-shrink-0 items-center lg:hidden">
          <Dropdown
            trigger={(p) => (
              <button type="button" {...p} className={buttonClass("outline")}>
                <SlidersIcon className="h-4 w-4" />
                Ações
                <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              </button>
            )}
          >
            <MenuItem icon={<BanIcon className="h-4 w-4 flex-shrink-0" />} onSelect={openIgnored}>
              Lista de produtos ignorados
            </MenuItem>
          </Dropdown>
        </div>
        <div data-filters-left="" className={`flex min-w-0 flex-1 flex-wrap items-center gap-2${filtersOpen ? " filtros-abertos" : ""}`}>
          <FilterChip
            id="filter-gateways-trigger"
            label="Gateway"
            options={gateways}
            selected={filters.gateways}
            onChange={(g) => go({ ...filters, gateways: g }, "gateways")}
          />
        </div>
        <div data-filters-right="" className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-shrink-0" />
      </div>

      <div className="scroll-fino mb-3 min-w-0 overflow-x-auto">
        <div className="flex w-fit select-none items-center gap-6">
          {VIEWS.map((v) => {
            const on = v.value === filters.view;
            return (
              <button
                key={v.value}
                type="button"
                aria-pressed={on}
                disabled={navigating}
                onClick={() => !on && go({ ...filters, view: v.value }, v.value)}
                className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap text-hint transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  on ? "font-semibold text-brand-600" : "font-medium text-gray-500 hover:text-gray-800"
                }`}
              >
                {v.label}
                {v.value === "error" && list.errorCount > 0 ? (
                  <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 px-1.5 text-badge font-semibold tabular-nums text-gray-500">
                    {list.errorCount}
                  </span>
                ) : null}
                {busy === v.value ? <RefreshIcon className="h-3.5 w-3.5 animate-spin" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {(() => {
        const message = error ?? listError ?? (ignoredOpen ? null : ignoredAction.error);
        return message ? (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
            {message}
          </div>
        ) : null;
      })()}

      <div className={`transition-opacity${navigating ? " opacity-60" : ""}`}>
        <div
          role="table"
          style={{ "--lista-cols": "12rem minmax(0,1fr) 10rem 9rem 9rem 4.5rem", "--lista-acoes": 2 } as React.CSSProperties}
          className="lista lista--card"
        >
          <div className="lista-cabecalho-envelope">
            <div role="row" className="lista-cabecalho">
              <div role="columnheader" className="lista-celula lista-th">
                <span className="inline-flex items-center">
                  Gateway
                  <ColumnFilter options={gateways} selected={filters.gateways} onChange={(g) => go({ ...filters, gateways: g }, "gateways")} />
                </span>
              </div>
              <div role="columnheader" className="lista-celula lista-th">
                Cliente
              </div>
              <div role="columnheader" className="lista-celula lista-th">
                Data
              </div>
              <div role="columnheader" className="lista-celula lista-th lista-celula--centro">
                Status da venda
              </div>
              <div role="columnheader" className="lista-celula lista-th lista-celula--centro">
                Status
              </div>
              <div role="columnheader" className="lista-celula lista-th lista-celula--fim">
                <span className="sr-only">Ações</span>
              </div>
            </div>
          </div>
          <div role="rowgroup" className="lista-corpo">
            {rows.length === 0 ? (
              <div role="row" className="lista-linha">
                <div role="cell" className="lista-celula text-sm text-gray-400">
                  Nenhuma venda encontrada
                </div>
              </div>
            ) : null}
            {rows.map((row) => {
              const failed = row.processing === "error" || row.processing === "queued";
              const status = SALE_STATUS[row.status];
              const proc = PROCESSING[row.processing];
              return (
                <div
                  key={row.id}
                  role="row"
                  data-linha-abrir=""
                  className="lista-linha lista-linha--dividida lista-linha--clicavel"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,[role=menu]")) return;
                    setOpenId(row.id);
                  }}
                >
                  <div role="cell" data-papel="secundario" className="lista-celula gap-3">
                    <GatewayLogo gateway={row.gateway} label={row.gatewayLabel} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{row.gatewayLabel}</span>
                      <span className="block text-hint text-gray-400" style={{ fontVariantNumeric: "tabular-nums" }}>
                        #{row.id}
                      </span>
                    </span>
                  </div>
                  <div role="cell" data-papel="titulo" className="lista-celula !block min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{row.email || "—"}</p>
                    {row.name ? <p className="truncate text-hint text-gray-400">{row.name}</p> : null}
                    {row.document ? (
                      <p className="lista-detalhe truncate text-hint text-gray-400" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {row.document}
                      </p>
                    ) : null}
                  </div>
                  <div role="cell" data-papel="meta" className="lista-celula !block">
                    <p className="text-sm text-gray-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {row.receivedAt}
                    </p>
                    {row.processedAt ? (
                      <p className="lista-detalhe text-hint text-gray-400" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {row.processedAt}
                      </p>
                    ) : null}
                  </div>
                  <div role="cell" data-papel="meta" className="lista-celula lista-celula--centro whitespace-nowrap">
                    <span className={`selo selo--${status.tone}`}>{status.label}</span>
                  </div>
                  <div role="cell" data-papel="meta" className="lista-celula lista-celula--centro whitespace-nowrap">
                    <span className={`selo selo--${proc.tone}`}>{proc.label}</span>
                  </div>
                  <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim gap-1 whitespace-nowrap">
                    <Dropdown
                      trigger={(p) => (
                        <button type="button" {...p} aria-label={`Ações para venda #${row.id}`} data-row-menu-trigger="comunicacao" className="btn-icone">
                          <DotsIcon className="h-4 w-4" />
                        </button>
                      )}
                    >
                      <MenuItem icon={<EyeIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setOpenId(row.id)}>
                        Ver detalhes
                      </MenuItem>
                      <MenuItem icon={<RefreshIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => act(reprocessSaleAction, { id: row.id })}>
                        {failed ? "Reprocessar" : "Forçar reprocessamento"}
                      </MenuItem>
                      {failed ? (
                        <MenuItem icon={<BanIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => act(ignoreSaleAction, { id: row.id })}>
                          Ignorar
                        </MenuItem>
                      ) : null}
                      {row.processing !== "processed" ? (
                        <>
                          <MenuSeparator />
                          <MenuItem tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDeleting(row.id)}>
                            Excluir
                          </MenuItem>
                        </>
                      ) : null}
                    </Dropdown>
                    <button className="btn-icone btn-abrir" type="button" data-abrir="" aria-label="Ver detalhes" onClick={() => setOpenId(row.id)}>
                      <ArrowRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {list.nextCursor !== null || rows.length > 20 ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            {list.nextCursor !== null ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={loadMore}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
              >
                {loadingMore ? <Spinner /> : <ChevronDownIcon className="h-4 w-4" />}
                <span>{loadingMore ? "Carregando…" : "Carregar mais resultados"}</span>
              </button>
            ) : null}
            {rows.length > 20 ? (
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <ChevronUpIcon className="h-4 w-4" />
                Voltar ao topo
              </button>
            ) : null}
          </div>
        ) : null}
        {list.limitReached ? (
          <p className="mt-4 text-center text-hint text-gray-500">
            Mostrando os primeiros 200 resultados. Use a busca ou os filtros para encontrar o que procura.
          </p>
        ) : null}
      </div>

      {openId !== null ? (
        <SaleDrawer
          key={openId}
          saleId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void reload()}
          ignoredProductIds={ignored}
          onIgnoreProduct={(pid) => saveIgnored([...ignored, pid])}
        />
      ) : null}

      <DeleteSaleDialog
        open={deleting !== null}
        pending={pending}
        onClose={() => {
          setDeleting(null);
          setError(null);
        }}
        onConfirm={() => deleting !== null && act(deleteSaleAction, { id: deleting }, () => setDeleting(null))}
      />

      {ignoredOpen ? (
        <IgnoredProductsDialog
          open
          initial={ignored}
          pending={ignoredAction.pending}
          error={ignoredAction.error}
          onClose={() => setIgnoredOpen(false)}
          onSave={(ids) => saveIgnored(ids, () => setIgnoredOpen(false))}
        />
      ) : null}
    </div>
  );
}

