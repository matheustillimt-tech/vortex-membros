"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { archiveDeliveryAction, duplicateDeliveryAction, restoreDeliveryAction } from "@/app/dashboard/sales/deliveries/actions";
import type { DeliveryType } from "@/db/schema";
import { buttonClass } from "./button";
import { Dropdown, MenuItem, MenuLink, MenuSeparator } from "./dropdown";
import { FilterChip } from "./filter-chip";
import {
  ArchiveIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  CopyToIcon,
  DotsIcon,
  FilterIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  RotateCcwIcon,
  SearchIcon,
  ShoppingCartIcon,
  XIcon,
} from "./icons";
import { ConfirmDialog, DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { GatewayLogo } from "./sale-drawer";
import { SalesSubnav } from "./sales-subnav";
import { useAdminAction } from "./use-admin-action";

export type DeliveryListItem = {
  id: number;
  name: string;
  codes: string[];
  type: DeliveryType;
  access: { total: number; active: number; inactive: number };
};
export type DeliveriesFilters = { archived: boolean; gateways: string[]; types: DeliveryType[]; q: string };

const TYPE_LABEL: Record<DeliveryType, string> = { single: "Venda única", subscription: "Assinatura" };
const TYPE_OPTIONS = [
  { value: "single", label: "Venda única" },
  { value: "subscription", label: "Assinatura" },
];
const GATEWAY_OPTIONS = [{ value: "kiwify", label: "Kiwify" }];

function deliveriesHref(f: DeliveriesFilters): string {
  const qs = new URLSearchParams();
  if (f.archived) qs.set("arquivadas", "1");
  for (const g of f.gateways) qs.append("gateway", g);
  for (const t of f.types) qs.append("tipo", t);
  if (f.q) qs.set("busca", f.q);
  const s = qs.toString();
  return s ? `/dashboard/sales/deliveries?${s}` : "/dashboard/sales/deliveries";
}

const nf = new Intl.NumberFormat("pt-BR");

/** Modal "Como funcionam as Entregas?". */
function HowItWorksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const box = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-hint font-medium text-gray-700";
  return (
    <PanelDialog open={open} onClose={onClose} labelledBy={titleId} widthClass="sm:max-w-2xl">
      <DialogHeader id={titleId} title="Como funcionam as Entregas?" onClose={onClose} />
      <div className="p-5">
        <p className="mx-auto max-w-md text-center text-sm text-gray-500">
          A entrega é o hub de distribuição do seu conteúdo. Venda por onde quiser, entregue como quiser.
        </p>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 rounded-lg bg-gray-50 p-5">
          <div className="space-y-2">
            {["Gateway 1", "Gateway 2", "Gateway 3"].map((g) => (
              <div key={g} className={box}>
                {g}
              </div>
            ))}
          </div>
          <ArrowRightIcon className="h-4 w-4 text-gray-400" />
          <div className="rounded-lg border border-brand-500 bg-brand-50 px-3 py-6 text-center text-sm font-semibold text-brand-700">Entregas</div>
          <ArrowRightIcon className="h-4 w-4 text-gray-400" />
          <div className="space-y-2">
            {["Vitrine A", "Produto A", "Produto B", "Produto C"].map((g) => (
              <div key={g} className={box}>
                {g}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PanelDialog>
  );
}

/** Entregas: busca, Nova Entrega, Arquivadas, chips Gateway/Tipo e a lista. */
export function DeliveriesBoard({ rows, filters }: { rows: DeliveryListItem[]; filters: DeliveriesFilters }) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const { pending, error, setError, run } = useAdminAction();
  const [how, setHow] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "archive" | "restore"; row: DeliveryListItem } | null>(null);
  const [q, setQ] = useState(filters.q);

  const go = (next: DeliveriesFilters) => startNav(() => router.push(deliveriesHref(next)));
  const refresh = () => router.refresh();
  const close = () => {
    setConfirm(null);
    setError(null);
  };

  const archivedToggle = (
    <button
      type="button"
      aria-pressed={filters.archived}
      onClick={() => go({ ...filters, archived: !filters.archived })}
      className={buttonClass("ghost", `flex-shrink-0 !px-2.5 !py-1.5${filters.archived ? " !text-brand-600 !bg-brand-50" : ""}`)}
    >
      {navigating ? <Spinner /> : <ArchiveIcon className="h-4 w-4" />}
      Arquivadas
    </button>
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Entregas</h1>
            <div className="mt-1 text-sm text-gray-500">
              Distribua seu conteúdo a partir das vendas nos gateways{" "}
              <button
                type="button"
                onClick={() => setHow(true)}
                className="ml-1 inline-flex items-baseline gap-1 align-baseline text-gray-500 underline decoration-dotted underline-offset-2 transition-colors hover:text-gray-700"
              >
                <InfoIcon className="h-3.5 w-3.5 self-center" />
                Como funciona?
              </button>
            </div>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <div className="w-full sm:w-72">
              <Form action="/dashboard/sales/deliveries" className="flex">
                {filters.archived ? <input type="hidden" name="arquivadas" value="1" /> : null}
                {filters.gateways.map((g) => (
                  <input key={g} type="hidden" name="gateway" value={g} />
                ))}
                {filters.types.map((t) => (
                  <input key={t} type="hidden" name="tipo" value={t} />
                ))}
                <div
                  data-busca-caixa=""
                  className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg border border-gray-200 bg-white text-hint transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15"
                >
                  <input
                    type="text"
                    name="busca"
                    value={q}
                    maxLength={200}
                    onChange={(e) => setQ(e.target.value)}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-hint text-gray-900 outline-none placeholder-gray-400 read-only:cursor-progress"
                    placeholder="Buscar por nome, gateway ou ID do produto…"
                    aria-label="Buscar entregas"
                  />
                  {q ? (
                    <button
                      type="button"
                      aria-label="Limpar pesquisa"
                      onClick={() => {
                        setQ("");
                        if (filters.q) go({ ...filters, q: "" });
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
              </Form>
            </div>
            <Link href="/dashboard/sales/deliveries/new" className={buttonClass("primary", "flex-shrink-0")}>
              <PlusIcon className="h-4 w-4" /> Nova Entrega
            </Link>
          </div>
        </div>
      </div>

      <SalesSubnav
        current="/dashboard/sales/deliveries"
        actions={
          <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
            {archivedToggle}
          </div>
        }
      />

      <div data-toolbar="" className="mb-6 flex flex-wrap items-center gap-2 lg:sticky lg:top-0 lg:z-30 lg:-mt-3 lg:mb-3 lg:bg-white lg:py-3 coluna:top-14">
        <div data-filtros-botao="" className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)} className={buttonClass("outline", "flex-shrink-0")}>
            <FilterIcon className="h-4 w-4" /> Filtros <ChevronDownIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          </button>
        </div>
        <div data-filters-left="" className={`flex min-w-0 flex-1 flex-wrap items-center gap-2${filtersOpen ? " filtros-abertos" : ""}`}>
          <FilterChip id="filter-gateways-trigger" label="Gateway" options={GATEWAY_OPTIONS} selected={filters.gateways} onChange={(gateways) => go({ ...filters, gateways })} />
          <FilterChip
            id="filter-tipos-trigger"
            label="Tipo"
            options={TYPE_OPTIONS}
            selected={filters.types}
            onChange={(types) => go({ ...filters, types: types as DeliveryType[] })}
          />
        </div>
        <div data-filters-right="" className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-shrink-0">
          <div className="contents lg:hidden">{archivedToggle}</div>
        </div>
      </div>

      {error && !confirm ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      <div className={`transition-opacity${navigating ? " opacity-60" : ""}`}>
        <div role="table" style={{ "--lista-cols": "5rem minmax(0,1fr) 8rem 10rem 7.5rem", "--lista-acoes": 1 } as React.CSSProperties} className="lista lista--card">
          <div className="lista-cabecalho-envelope">
            <div role="row" className="lista-cabecalho">
              <div role="columnheader" className="lista-celula lista-th">
                ID
              </div>
              <div role="columnheader" className="lista-celula lista-th">
                Entrega
              </div>
              <div role="columnheader" className="lista-celula lista-th lista-celula--centro">
                Acessos
              </div>
              <div role="columnheader" className="lista-celula lista-th lista-celula--centro">
                Tipo
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
                  Nenhuma entrega encontrada
                </div>
              </div>
            ) : null}
            {rows.map((row) => {
              const href = `/dashboard/sales/deliveries/${row.id}/edit`;
              const code = row.codes.join(", ");
              const pct = row.access.total ? Math.round((row.access.active / row.access.total) * 100) : 0;
              return (
                <div
                  key={row.id}
                  role="row"
                  data-linha-abrir=""
                  className="lista-linha lista-linha--dividida lista-linha--clicavel"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,[role=menu]")) return;
                    router.push(href);
                  }}
                >
                  <div role="cell" data-papel="oculto" className="lista-celula lista-celula--oculta font-mono text-xs text-gray-400">
                    #{row.id}
                  </div>
                  <div role="cell" data-papel="titulo" className="lista-celula">
                    <div className="flex min-w-0 items-center gap-3">
                      <GatewayLogo gateway="kiwify" label="Kiwify" size="list" />
                      <div className="min-w-0 max-w-md">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-gray-900">{row.name}</p>
                        </div>
                        <p className="truncate text-hint text-gray-400" title={code}>
                          Kiwify{code ? ` · ${code}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div role="cell" data-papel="oculto" className="lista-celula lista-celula--centro lista-celula--oculta !block">
                    {row.access.total ? (
                      <span className="tooltip block w-full" title={`${nf.format(row.access.active)} ativos · ${nf.format(row.access.inactive)} inativos`}>
                        <div className="flex flex-col items-center gap-1">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-label font-medium text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {nf.format(row.access.total)}
                          </span>
                        </div>
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </div>
                  <div role="cell" data-papel="meta" className="lista-celula lista-celula--centro whitespace-nowrap">
                    <span className="selo selo--neutral">
                      {row.type === "single" ? <ShoppingCartIcon className="h-3.5 w-3.5" /> : <RefreshIcon className="h-3.5 w-3.5" />}
                      {TYPE_LABEL[row.type]}
                    </span>
                  </div>
                  <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim gap-1 whitespace-nowrap">
                    <Dropdown
                      trigger={(p) => (
                        <button type="button" {...p} aria-label={`Ações para ${row.name}`} data-row-menu-trigger="entrega" className="btn-icone">
                          <DotsIcon className="h-4 w-4" />
                        </button>
                      )}
                    >
                      <MenuLink href={href} icon={<PencilIcon className="h-4 w-4 flex-shrink-0" />}>
                        Editar
                      </MenuLink>
                      <MenuItem
                        icon={<CopyToIcon className="h-4 w-4 flex-shrink-0" />}
                        disabled={pending}
                        onSelect={() => run(duplicateDeliveryAction, { id: row.id }, { onOk: (res) => (res.id ? router.push(`/dashboard/sales/deliveries/${res.id}/edit`) : refresh()) })}
                      >
                        Duplicar
                      </MenuItem>
                      <MenuSeparator />
                      {filters.archived ? (
                        <MenuItem icon={<RotateCcwIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setConfirm({ kind: "restore", row })}>
                          Restaurar
                        </MenuItem>
                      ) : (
                        <MenuItem tone="danger" icon={<ArchiveIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setConfirm({ kind: "archive", row })}>
                          Arquivar
                        </MenuItem>
                      )}
                    </Dropdown>
                    <Link href={href} className="btn-icone btn-abrir" data-abrir="" aria-label="Abrir">
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <HowItWorksDialog open={how} onClose={() => setHow(false)} />
      <ConfirmDialog
        open={confirm?.kind === "archive"}
        onClose={close}
        tone="danger"
        icon={<ArchiveIcon className="h-5 w-5" />}
        title="Arquivar entrega"
        confirmLabel="Sim, arquivar"
        pending={pending}
        error={error}
        onConfirm={() => confirm && run(archiveDeliveryAction, { id: confirm.row.id }, { onOk: () => (close(), refresh()) })}
      >
        Arquivar &quot;{confirm?.row.name}&quot;? Ela deixa de processar novas vendas; os acessos já entregues aos alunos não são alterados. Você pode restaurá-la depois.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "restore"}
        onClose={close}
        tone="brand"
        icon={<RotateCcwIcon className="h-5 w-5" />}
        title="Restaurar entrega"
        confirmLabel="Sim, restaurar"
        pending={pending}
        error={error}
        onConfirm={() => confirm && run(restoreDeliveryAction, { id: confirm.row.id }, { onOk: () => (close(), refresh()) })}
      >
        Restaurar &quot;{confirm?.row.name}&quot;? Ela volta a aparecer na listagem e a processar as vendas recebidas do gateway.
      </ConfirmDialog>
    </div>
  );
}

/** Passo 1 de "Nova Entrega": busca e o card Kiwify em Recentes/Principais. */
export function GatewayPicker({ recent }: { recent: boolean }) {
  const [q, setQ] = useState("");
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const visible = !q.trim() || fold("kiwify").includes(fold(q.trim()));
  const card = (
    <Link
      href="/dashboard/sales/deliveries/create/kiwify"
      data-name="kiwify kiwify"
      className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-brand-500/40 hover:shadow-sm sm:gap-3 sm:p-4"
    >
      <GatewayLogo gateway="kiwify" label="Kiwify" />
      <span className="min-w-0 truncate text-sm font-medium text-gray-900">Kiwify</span>
    </Link>
  );
  const group = (title: string) => (
    <div className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">{card}</div>
    </div>
  );
  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          name="gateway_search"
          id="gateway_search"
          placeholder="Digite o nome da plataforma para filtrar..."
          aria-label="Pesquisar gateway"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 !pl-9 text-hint text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        />
      </div>
      {visible ? (
        <>
          {recent ? group("Recentes") : null}
          {group("Principais")}
        </>
      ) : (
        <p className="py-10 text-center text-sm text-gray-400">Nenhum resultado</p>
      )}
    </div>
  );
}
