"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  createStudentAction,
  deleteStudentAction,
  listStudentsAction,
  loadFilterOptionsAction,
  resendWelcomeAction,
  restoreStudentAction,
} from "@/app/dashboard/students/actions";
import {
  ACCESS_OPTIONS,
  SEARCH_FIELDS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  studentsQuery,
  type FilterKind,
  type StudentFilters,
  type StudentListRow,
} from "@/app/dashboard/students/rows";
import type { StudentSearchField } from "@/lib/students/queries";
import { buttonClass } from "./button";
import { Dropdown, MenuItem, MenuLink, MenuSeparator } from "./dropdown";
import {
  ArrowRightIcon,
  ArrowUpDownIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  DotsIcon,
  DownloadIcon,
  EyeIcon,
  FilterIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SendIcon,
  SlidersIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from "./icons";
import { INPUT_CLASS } from "./input";
import { ConfirmDialog, DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { StudentFilterChip, type ChipOption } from "./student-filter-chip";
import { StudentsSubnav } from "./students-subnav";
import { copyText, downloadFrom, useToast } from "./toast";
import { useAdminAction } from "./use-admin-action";

export type StudentsPageData = { rows: StudentListRow[]; total: number; nextCursor: string | null };

const href = (f: StudentFilters) => {
  const qs = studentsQuery(f);
  return qs ? `/dashboard/students?${qs}` : "/dashboard/students";
};

function filterFields(f: StudentFilters): FormData {
  const fd = new FormData();
  for (const [k, v] of new URLSearchParams(studentsQuery(f))) fd.append(k, v);
  return fd;
}

/* ---------- busca com seletor de campo (E-mail, Nome, CPF ou CNPJ, ID) ---------- */

function StudentSearch({ filters, onSearch, busy }: { filters: StudentFilters; onSearch: (field: StudentSearchField, q: string) => void; busy: boolean }) {
  const [field, setField] = useState<StudentSearchField>(filters.field);
  const [q, setQ] = useState(filters.q);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = SEARCH_FIELDS.find((f) => f.value === field) ?? SEARCH_FIELDS[0];
  useOutside(ref, open, () => setOpen(false));

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

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

function SortButton({ value, busy, onChange }: { value: StudentFilters["sort"]; busy: boolean; onChange: (v: StudentFilters["sort"]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, open, () => setOpen(false));
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];
  return (
    <div ref={ref} className="relative flex-shrink-0 self-start">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 px-4 py-2 text-hint font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none"
      >
        {busy ? <Spinner /> : <ArrowUpDownIcon className="h-4 w-4" />}
        <span>
          Ordenar por: <span className="text-gray-900">{current.label}</span>
        </span>
        <ChevronDownIcon className={`h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform duration-200${open ? " rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg" role="listbox">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                setOpen(false);
                if (o.value !== value) onChange(o.value);
              }}
              className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-hint transition-colors ${
                o.value === value ? "bg-gray-50 text-gray-900" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value ? <CheckIcon className="h-4 w-4 flex-shrink-0 text-brand-500" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Novo Aluno ---------- */

function NewStudentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const router = useRouter();
  const { pending, error, run } = useAdminAction();
  return (
    <PanelDialog open={open} onClose={onClose} widthClass="sm:max-w-md" labelledBy={titleId}>
      <DialogHeader id={titleId} title="Novo Aluno" onClose={onClose} />
      <div>
        {error ? (
          <div role="alert" className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
            {error}
          </div>
        ) : null}
        <form id="form-novo-aluno" action={(fd) => run(createStudentAction, fd, { onOk: (res) => router.push(`/dashboard/student/${res.id}`) })}>
          <div className="min-w-0">
            <div className="painel-linhas">
              <div className="p-5">
                <div className="mb-2 flex items-center gap-1.5">
                  <label htmlFor="nome" className="text-sm text-gray-700">
                    Nome <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="min-w-0">
                  <input type="text" name="name" id="nome" required maxLength={200} placeholder="Nome completo" className={INPUT_CLASS} />
                </div>
              </div>
              <div className="p-5">
                <div className="mb-2 flex items-center gap-1.5">
                  <label htmlFor="email" className="text-sm text-gray-700">
                    E-mail <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="min-w-0">
                  <input type="email" name="email" id="email" required maxLength={254} placeholder="email@exemplo.com" className={INPUT_CLASS} />
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
          <button type="submit" form="form-novo-aluno" disabled={pending} className={buttonClass("primary", "grow justify-center")}>
            {pending ? <Spinner /> : <SendIcon className="h-4 w-4" />}
            Criar e enviar boas vindas
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}

/* ---------- tela ---------- */

type Pending = { kind: "resend" | "delete" | "restore"; row: StudentListRow } | null;

/**
 * Alunos: busca com seletor de campo, "Novo Aluno", submenu Alunos/Tags/Importações
 * com "Lixeira", chips Status/Tipo/Acesso/Produtos/Vitrine/Entrega/Tags, "Ordenar por", "Exportar",
 * contador, lista (ID, Aluno, Email, Último acesso, ⋯) e "Carregar mais resultados".
 */
export function StudentsBoard({
  filters,
  data,
  labels,
}: {
  filters: StudentFilters;
  data: StudentsPageData;
  /** Rótulos dos valores já escolhidos nos chips carregados sob demanda. */
  labels: Record<FilterKind, Record<string, string>>;
}) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [list, setList] = useState(data);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingRow, setPendingRow] = useState<Pending>(null);
  const { pending, error, setError, run } = useAdminAction();
  const toast = useToast();

  function go(next: StudentFilters, target: string) {
    setNavTarget(target);
    startNav(() => router.push(href(next)));
  }
  const busy = navigating ? navTarget : null;

  const loader = (kind: FilterKind) => async (): Promise<ChipOption[] | null> => {
    const fd = new FormData();
    fd.set("kind", kind);
    const res = await loadFilterOptionsAction(fd);
    if (!res.ok) {
      setListError(res.error);
      return null;
    }
    return res.options;
  };

  async function reload() {
    const res = await listStudentsAction(filterFields(filters));
    if (res.ok) setList({ rows: res.rows, total: res.total, nextCursor: res.nextCursor });
    else setListError(res.error);
  }

  async function loadMore() {
    if (!list.nextCursor) return;
    setLoadingMore(true);
    const fd = filterFields(filters);
    fd.set("cursor", list.nextCursor);
    const res = await listStudentsAction(fd);
    setLoadingMore(false);
    if (!res.ok) return setListError(res.error);
    setListError(null);
    setList((l) => ({ rows: [...l.rows, ...res.rows.filter((r) => !l.rows.some((x) => x.id === r.id))], total: res.total, nextCursor: res.nextCursor }));
  }

  function confirmPending() {
    if (!pendingRow) return;
    const action = pendingRow.kind === "resend" ? resendWelcomeAction : pendingRow.kind === "delete" ? deleteStudentAction : restoreStudentAction;
    run(action, { id: pendingRow.row.id }, {
      onOk: () => {
        setPendingRow(null);
        if (pendingRow.kind !== "resend") void reload();
      },
    });
  }

  const one = (v: string | null) => (v ? [v] : []);
  const trashButton = (
    <button
      type="button"
      aria-pressed={filters.trash}
      disabled={navigating}
      onClick={() => go({ ...filters, trash: !filters.trash }, "trash")}
      className={buttonClass("ghost", `flex-shrink-0 !px-2.5 !py-1.5${filters.trash ? " bg-gray-100 text-gray-900" : ""}`)}
    >
      {busy === "trash" ? <Spinner /> : <TrashIcon className="h-4 w-4" />}
      Lixeira
    </button>
  );
  const rows = list.rows;

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Alunos</h1>
            <p className="mt-1 text-sm text-gray-500">Gerencie os alunos da plataforma</p>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <StudentSearch filters={filters} busy={busy === "search"} onSearch={(field, q) => go({ ...filters, field, q }, "search")} />
            <button type="button" onClick={() => setNewOpen(true)} className={buttonClass("primary", "flex-shrink-0")}>
              <PlusIcon className="h-4 w-4" />
              Novo Aluno
            </button>
          </div>
        </div>
      </div>

      <StudentsSubnav
        current="/dashboard/students"
        actions={
          <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
            {trashButton}
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
            {SORT_OPTIONS.map((o) => (
              <MenuItem key={o.value} active={o.value === filters.sort} icon={<ArrowUpDownIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => go({ ...filters, sort: o.value }, "sort")}>
                Ordenar por: {o.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<DownloadIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setExportOpen(true)}>
              Exportar
            </MenuItem>
            <MenuItem icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => go({ ...filters, trash: !filters.trash }, "trash")}>
              Lixeira
            </MenuItem>
          </Dropdown>
        </div>
        <div data-filters-left="" className={`flex min-w-0 flex-1 flex-wrap items-center gap-2${filtersOpen ? " filtros-abertos" : ""}`}>
          <StudentFilterChip id="filter-status-trigger" label="Status" name="status" options={STATUS_OPTIONS} selected={one(filters.status)} busy={busy === "status"} onChange={(v) => go({ ...filters, status: (v[0] as StudentFilters["status"]) ?? null }, "status")} />
          <StudentFilterChip id="filter-tipo-trigger" label="Tipo" name="tipo" options={TYPE_OPTIONS} selected={one(filters.type)} busy={busy === "type"} onChange={(v) => go({ ...filters, type: (v[0] as StudentFilters["type"]) ?? null }, "type")} />
          <StudentFilterChip id="filter-acesso-trigger" label="Acesso" name="acesso" options={ACCESS_OPTIONS} selected={one(filters.access)} busy={busy === "access"} onChange={(v) => go({ ...filters, access: (v[0] as StudentFilters["access"]) ?? null }, "access")} />
          <StudentFilterChip
            id="filter-produtos-trigger"
            label="Produtos"
            name="produtos"
            multiple
            searchable
            load={loader("products")}
            selected={filters.products.map(String)}
            selectedLabels={labels.products}
            busy={busy === "products"}
            onChange={(v) => go({ ...filters, products: v.map(Number) }, "products")}
          />
          <StudentFilterChip
            id="filter-vitrine-trigger"
            label="Vitrine"
            name="vitrine"
            searchable
            load={loader("showcases")}
            selected={filters.showcase !== null ? [String(filters.showcase)] : []}
            selectedLabels={labels.showcases}
            busy={busy === "showcase"}
            onChange={(v) => go({ ...filters, showcase: v[0] ? Number(v[0]) : null }, "showcase")}
          />
          <StudentFilterChip
            id="filter-entrega-trigger"
            label="Entrega"
            name="entrega"
            searchable
            load={loader("deliveries")}
            selected={filters.delivery !== null ? [String(filters.delivery)] : []}
            selectedLabels={labels.deliveries}
            busy={busy === "delivery"}
            onChange={(v) => go({ ...filters, delivery: v[0] ? Number(v[0]) : null }, "delivery")}
          />
          <StudentFilterChip
            id="filter-tags-trigger"
            label="Tags"
            name="tags"
            multiple
            searchable
            load={loader("tags")}
            selected={filters.tags.map(String)}
            selectedLabels={labels.tags}
            busy={busy === "tags"}
            onChange={(v) => go({ ...filters, tags: v.map(Number) }, "tags")}
          />
        </div>
        <div data-filters-right="" className="hidden min-w-0 flex-wrap items-center justify-end gap-2 lg:flex lg:flex-shrink-0">
          <SortButton value={filters.sort} busy={busy === "sort"} onChange={(sort) => go({ ...filters, sort }, "sort")} />
          <button type="button" onClick={() => setExportOpen(true)} className={buttonClass("outline", "flex-shrink-0 self-start")}>
            <DownloadIcon className="h-4 w-4" />
            Exportar
          </button>
        </div>
      </div>

      <div className={`transition-opacity${navigating ? " opacity-60" : ""}`}>
        <div className="mb-4 flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <UsersIcon className="h-4 w-4 text-brand-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p aria-hidden="true" className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span>{list.total.toLocaleString("pt-BR")}</span>
              <span>{list.total === 1 ? "aluno" : "alunos"}</span>
              {filters.trash ? <span>na lixeira</span> : null}
            </p>
            <span className="sr-only" aria-live="polite">
              {list.total.toLocaleString("pt-BR")} {list.total === 1 ? "aluno" : "alunos"}
            </span>
          </div>
        </div>

        {error || listError ? (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
            {error ?? listError}
          </div>
        ) : null}

        <div role="table" style={{ "--lista-cols": "5rem minmax(0,1fr) 18rem 10rem 7.5rem", "--lista-acoes": 1 } as React.CSSProperties} className="lista lista--card">
          <div className="lista-cabecalho-envelope">
            <div role="row" className="lista-cabecalho">
              <div role="columnheader" className="lista-celula lista-th">
                ID
              </div>
              <div role="columnheader" className="lista-celula lista-th">
                Aluno
              </div>
              <div role="columnheader" className="lista-celula lista-th">
                Email
              </div>
              <div role="columnheader" className="lista-celula lista-th">
                Último acesso
              </div>
              <div role="columnheader" className="lista-celula lista-th lista-celula--fim">
                <span className="sr-only">Ações</span>
              </div>
            </div>
          </div>
          <div role="rowgroup" className="lista-corpo">
            {rows.length === 0 ? (
              <div role="row" className="lista-linha">
                <div role="cell" className="lista-celula text-sm text-gray-400" style={{ gridColumn: "1 / -1" }}>
                  Nenhum aluno encontrado
                </div>
              </div>
            ) : null}
            {rows.map((row) => (
              <div
                key={row.id}
                role="row"
                data-linha-abrir=""
                className={`lista-linha lista-linha--dividida${filters.trash ? "" : " lista-linha--clicavel"}`}
                onClick={(e) => {
                  if (filters.trash || (e.target as HTMLElement).closest("a,button,[role=menu]")) return;
                  router.push(`/dashboard/student/${row.id}`);
                }}
              >
                <div role="cell" data-papel="oculto" className="lista-celula lista-celula--oculta font-mono text-xs text-gray-400">
                  #{row.id}
                </div>
                <div role="cell" data-papel="titulo" className="lista-celula gap-3">
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${row.color}`}>
                    <span>{row.initials}</span>
                  </div>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium text-gray-900">{row.name}</span>
                    </span>
                    {row.document ? (
                      <span className="block truncate text-hint text-gray-400" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {row.document}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div role="cell" data-papel="secundario" className="lista-celula text-sm text-gray-500">
                  <span className="truncate">{row.email}</span>
                </div>
                <div role="cell" data-papel="meta" className="lista-celula text-sm text-gray-400" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.lastAccess}
                </div>
                <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim gap-1">
                  <Dropdown
                    trigger={(p) => (
                      <button type="button" {...p} aria-label={`Ações para ${row.name}`} data-row-menu-trigger="aluno" className="btn-icone">
                        <DotsIcon className="h-4 w-4" />
                      </button>
                    )}
                  >
                    {filters.trash ? (
                      <MenuItem icon={<RotateCcwIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => { setError(null); setPendingRow({ kind: "restore", row }); }}>
                        Restaurar
                      </MenuItem>
                    ) : (
                      <>
                        <MenuLink href={`/dashboard/student/${row.id}`} icon={<EyeIcon className="h-4 w-4 flex-shrink-0" />}>
                          Ver perfil
                        </MenuLink>
                        <MenuItem icon={<SendIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => { setError(null); setPendingRow({ kind: "resend", row }); }}>
                          Reenviar e-mail de boas-vindas
                        </MenuItem>
                        {row.document ? (
                          <MenuItem icon={<CopyIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => void copyText(row.document!).then((ok) => ok && toast.show("Copiado!"))}>
                            Copiar documento
                          </MenuItem>
                        ) : null}
                        <MenuSeparator />
                        <MenuItem tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => { setError(null); setPendingRow({ kind: "delete", row }); }}>
                          Excluir
                        </MenuItem>
                      </>
                    )}
                  </Dropdown>
                  {filters.trash ? null : (
                    <Link href={`/dashboard/student/${row.id}`} className="btn-icone btn-abrir" data-abrir="" aria-label="Ver perfil">
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        {list.nextCursor || rows.length > 30 ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            {list.nextCursor ? (
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
            {rows.length > 30 ? (
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
      </div>

      {newOpen ? <NewStudentDialog open onClose={() => setNewOpen(false)} /> : null}

      <ConfirmDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tone="brand"
        icon={<DownloadIcon className="h-5 w-5" />}
        title="Exportar alunos"
        confirmLabel="Sim, exportar"
        pending={false}
        onConfirm={() => {
          setExportOpen(false);
          downloadFrom("/dashboard/students/export");
        }}
      >
        A exportação gera um arquivo com os alunos de toda a plataforma.
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingRow?.kind === "resend"}
        onClose={() => setPendingRow(null)}
        tone="brand"
        icon={<SendIcon className="h-5 w-5" />}
        title="Reenviar boas-vindas"
        confirmLabel="Sim, reenviar"
        pending={pending}
        error={error}
        onConfirm={confirmPending}
      >
        Uma nova senha será gerada e enviada para o aluno. A senha atual deixará de funcionar.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingRow?.kind === "delete"}
        onClose={() => setPendingRow(null)}
        tone="danger"
        icon={<TrashIcon className="h-5 w-5" />}
        title="Excluir aluno"
        confirmLabel="Sim, excluir"
        pending={pending}
        error={error}
        onConfirm={confirmPending}
      >
        Tem certeza que deseja excluir &quot;{pendingRow?.row.name}&quot;? O aluno perderá o acesso à plataforma.
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingRow?.kind === "restore"}
        onClose={() => setPendingRow(null)}
        tone="brand"
        icon={<RotateCcwIcon className="h-5 w-5" />}
        title="Restaurar aluno"
        confirmLabel="Sim, restaurar"
        pending={pending}
        error={error}
        onConfirm={confirmPending}
      >
        Restaurar &quot;{pendingRow?.row.name}&quot;? O aluno volta a aparecer na listagem e recupera o acesso à plataforma.
      </ConfirmDialog>
      {toast.node}
    </div>
  );
}
