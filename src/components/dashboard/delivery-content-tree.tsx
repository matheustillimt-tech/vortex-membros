"use client";

import { useState } from "react";
import type { DurationType } from "@/db/schema";
import { Combobox } from "./combobox";
import { ChevronDownIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, FolderIcon, LayersIcon, PackageIcon, SearchIcon } from "./icons";
import { INPUT_CLASS } from "./input";

export type TreeProduct = { id: number; name: string };
export type TreeShowcase = { id: number; name: string; products: TreeProduct[]; children: TreeShowcase[] };
export type ScheduleOption = { id: number; name: string; productIds: number[] };

/** Estado de uma linha marcada. Chaves: "all", "s:<vitrine>", "p:<produto>". */
export type ItemState = { durationType: DurationType | ""; duration: string; scheduleId: string };
export type ItemsState = Record<string, ItemState>;

/** "Tempo de Acesso" (opções e ordem). */
export const DURATION_OPTIONS: { value: DurationType; label: string }[] = [
  { value: "lifetime", label: "Acesso vitalício" },
  { value: "days", label: "Dias" },
  { value: "weeks", label: "Semanas" },
  { value: "months", label: "Meses" },
  { value: "years", label: "Anos" },
  { value: "hours", label: "Horas" },
];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Produtos cobertos por uma vitrine (com as subvitrines). */
function productsOf(s: TreeShowcase): number[] {
  return [...s.products.map((p) => p.id), ...s.children.flatMap(productsOf)];
}
function allShowcases(list: TreeShowcase[]): TreeShowcase[] {
  return list.flatMap((s) => [s, ...allShowcases(s.children)]);
}

/** Resumo do card ("Entregando 2 produtos em 1 vitrine"). */
function summary(tree: TreeShowcase[], items: ItemsState) {
  if (items.all) return { full: true, products: 0, showcases: 0 };
  const showcases = allShowcases(tree).filter((s) => items[`s:${s.id}`]);
  const products = new Set<number>(Object.keys(items).filter((k) => k.startsWith("p:")).map((k) => Number(k.slice(2))));
  for (const s of showcases) for (const id of productsOf(s)) products.add(id);
  return { full: false, products: products.size, showcases: showcases.length };
}

export function ContentSummary({ tree, items }: { tree: TreeShowcase[]; items: ItemsState }) {
  const s = summary(tree, items);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <p className="mt-1 text-hint text-gray-500">
      {s.full ? (
        <span className="font-medium text-gray-900">Entrega a plataforma completa.</span>
      ) : s.products === 0 && s.showcases === 0 ? (
        <span>Nenhum conteúdo selecionado ainda.</span>
      ) : (
        <span>
          <span>Entregando</span> <span className="font-medium text-gray-900">{plural(s.products, "produto", "produtos")}</span>
          {s.showcases > 0 ? (
            <>
              {" "}
              <span>em</span> <span className="font-medium text-gray-900">{plural(s.showcases, "vitrine", "vitrines")}</span>
            </>
          ) : null}
        </span>
      )}
    </p>
  );
}

const SWITCH_TRACK =
  "h-[18px] w-8 peer-checked:[&>span]:translate-x-[14px] block shrink-0 rounded-full bg-gray-300 transition-colors duration-200 peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/30 peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

type RowProps = {
  rowKey: string;
  label: string;
  title?: string;
  kind: "root" | "vitrine" | "produto";
  depth: number;
  state: ItemState | undefined;
  onToggle: (on: boolean) => void;
  onChange: (next: ItemState) => void;
  schedules: ScheduleOption[];
  collapsed?: boolean;
  onCollapse?: () => void;
};

function Row({ rowKey, label, title, kind, depth, state, onToggle, onChange, schedules, collapsed, onCollapse }: RowProps) {
  const on = !!state;
  const Icon = kind === "root" ? LayersIcon : kind === "vitrine" ? FolderIcon : PackageIcon;
  const rowClass =
    kind === "vitrine"
      ? "cursor-pointer select-none hover:bg-gray-100 bg-gray-100/60"
      : `cursor-pointer select-none hover:bg-gray-50 border-b ${kind === "root" ? "border-gray-200" : "border-gray-100"}`;
  const scheduleOptions = [{ value: "", label: " - " }, ...schedules.map((s) => ({ value: String(s.id), label: s.name }))];
  return (
    <div
      className={`flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 transition-colors ${rowClass}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("fieldset,button,label,input")) return;
        onToggle(!on);
      }}
    >
      <div className="flex w-11 flex-shrink-0 items-center">
        <div className="flex items-center">
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only" aria-label={`Ativar ${title ?? label}`} checked={on} onChange={(e) => onToggle(e.target.checked)} />
            <span aria-hidden="true" className={SWITCH_TRACK}>
              <span className="absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200" />
            </span>
          </label>
        </div>
      </div>
      <div className={`flex min-w-0 flex-1 items-center gap-2${on ? "" : " opacity-40"}`} style={{ paddingLeft: `${depth * 1.5}rem` }} title={title}>
        {onCollapse ? (
          <button
            type="button"
            aria-label={collapsed ? `Expandir ${label}` : `Recolher ${label}`}
            aria-expanded={!collapsed}
            onClick={onCollapse}
            className="-ml-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-600"
          >
            {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        ) : null}
        <Icon className="h-4 w-4 flex-shrink-0 text-gray-400" />
        <span className={`line-clamp-2 break-words text-sm text-gray-900${kind === "produto" ? "" : " font-medium"}`}>{label}</span>
      </div>
      {on && state ? (
        <>
          <fieldset data-linha-campos="" className="flex w-full min-w-0 items-center gap-2 pl-14 xl:w-56 xl:flex-shrink-0 xl:pl-0">
            <span className="text-micro font-semibold uppercase tracking-wider text-gray-400 xl:hidden">Tempo de Acesso:</span>
            {state.durationType !== "lifetime" ? (
              <div className="w-16">
                <input
                  type="text"
                  inputMode="numeric"
                  id={`acesso_${rowKey}_duracao`}
                  placeholder="1"
                  aria-label="Quantidade"
                  value={state.duration}
                  onChange={(e) => onChange({ ...state, duration: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  className={`${INPUT_CLASS} !px-2 text-center`}
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <Combobox
                name={`acesso_${rowKey}_duracao_tipo`}
                aria-label="Tempo de Acesso"
                placeholder="Selecionar..."
                options={DURATION_OPTIONS}
                value={state.durationType}
                onChange={(v) => onChange({ ...state, durationType: v as DurationType })}
              />
            </div>
          </fieldset>
          <fieldset
            data-linha-campos=""
            className={`w-full min-w-0 pl-14 xl:w-44 xl:flex-shrink-0 xl:pl-0${kind === "produto" && schedules.length ? "" : " hidden xl:block"}`}
          >
            {kind === "produto" && schedules.length ? (
              <div>
                <span className="mb-1 block text-micro font-semibold uppercase tracking-wider text-gray-400 xl:hidden">Liberação:</span>
                <Combobox
                  name={`turma_${rowKey}`}
                  aria-label="Liberação"
                  placeholder=" - "
                  options={scheduleOptions}
                  value={state.scheduleId}
                  onChange={(v) => onChange({ ...state, scheduleId: v })}
                />
              </div>
            ) : null}
          </fieldset>
        </>
      ) : null}
    </div>
  );
}

/**
 * Card "Conteúdo entregue": filtro, "Só os entregues", recolher/expandir,
 * e a árvore "Acesso completo a todos os produtos" → vitrines → produtos, com tempo de acesso e
 * liberação (programações do produto) em cada linha marcada.
 */
export function DeliveryContentTree({
  tree,
  schedules,
  items,
  onChange,
}: {
  tree: TreeShowcase[];
  schedules: ScheduleOption[];
  items: ItemsState;
  onChange: (items: ItemsState) => void;
}) {
  const [q, setQ] = useState("");
  const [onlyDelivered, setOnlyDelivered] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const showcaseIds = allShowcases(tree).map((s) => s.id);
  const anyOpen = showcaseIds.some((id) => !collapsed.has(id));
  const query = fold(q.trim());

  const set = (key: string, next: ItemState | null) => {
    const copy = { ...items };
    if (next) copy[key] = next;
    else delete copy[key];
    onChange(copy);
  };
  const toggle = (key: string) => (on: boolean) => set(key, on ? (items[key] ?? { durationType: "", duration: "", scheduleId: "" }) : null);
  const schedulesFor = (productId: number) => schedules.filter((s) => s.productIds.includes(productId));

  const productVisible = (p: TreeProduct, parentMatch: boolean) =>
    (!onlyDelivered || !!items[`p:${p.id}`]) && (!query || parentMatch || fold(p.name).includes(query));
  function showcaseVisible(s: TreeShowcase, parentMatch: boolean): boolean {
    const match = parentMatch || (!!query && fold(s.name).includes(query));
    const selfOk = (!onlyDelivered || !!items[`s:${s.id}`]) && (!query || match);
    return selfOk || s.products.some((p) => productVisible(p, match)) || s.children.some((c) => showcaseVisible(c, match));
  }
  const rootVisible = (!onlyDelivered || !!items.all) && (!query || fold("Acesso completo a todos os produtos").includes(query));

  function renderShowcase(s: TreeShowcase, depth: number, parentMatch: boolean): React.ReactNode {
    if (!showcaseVisible(s, parentMatch)) return null;
    const match = parentMatch || (!!query && fold(s.name).includes(query));
    const isCollapsed = collapsed.has(s.id) && !query;
    const key = `s:${s.id}`;
    return (
      <div key={key}>
        <Row
          rowKey={key.replace(":", "")}
          kind="vitrine"
          depth={depth}
          label={s.name}
          title={`Todos os produtos da Vitrine: ${s.name}`}
          state={items[key]}
          onToggle={toggle(key)}
          onChange={(n) => set(key, n)}
          schedules={[]}
          collapsed={isCollapsed}
          onCollapse={() =>
            setCollapsed((c) => {
              const n = new Set(c);
              if (n.has(s.id)) n.delete(s.id);
              else n.add(s.id);
              return n;
            })
          }
        />
        {isCollapsed ? null : (
          <>
            {s.products
              .filter((p) => productVisible(p, match))
              .map((p) => (
                <Row
                  key={`p:${p.id}`}
                  rowKey={`p${p.id}`}
                  kind="produto"
                  depth={depth + 1}
                  label={p.name}
                  state={items[`p:${p.id}`]}
                  onToggle={toggle(`p:${p.id}`)}
                  onChange={(n) => set(`p:${p.id}`, n)}
                  schedules={schedulesFor(p.id)}
                />
              ))}
            {s.children.map((c) => renderShowcase(c, depth + 1, match))}
          </>
        )}
      </div>
    );
  }

  const rendered = tree.map((s) => renderShowcase(s, 0, false)).filter(Boolean);
  const empty = !rootVisible && rendered.length === 0;

  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              name="access_search"
              id="access_search"
              placeholder="Filtrar vitrines e produtos"
              aria-label="Filtrar vitrines e produtos"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} // filtro, não envia o formulário
              className={`${INPUT_CLASS} h-9 !pl-8 sm:w-64`}
            />
          </div>
          <div
            className={`inline-flex h-9 flex-shrink-0 items-center rounded-full border text-hint font-medium transition-colors ${
              onlyDelivered ? "border-gray-300 text-gray-900 hover:bg-gray-50" : "border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
            }`}
          >
            <button
              type="button"
              aria-pressed={onlyDelivered}
              onClick={() => setOnlyDelivered((v) => !v)}
              className="flex h-full items-center gap-1.5 rounded-full px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              <span className={onlyDelivered ? "text-brand-600" : ""}>Só os entregues</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(anyOpen ? new Set(showcaseIds) : new Set())}
          className="ml-auto inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-hint font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          {anyOpen ? <ChevronsDownUpIcon className="h-4 w-4" /> : <ChevronsUpDownIcon className="h-4 w-4" />}
          {anyOpen ? "Recolher vitrines" : "Expandir vitrines"}
        </button>
      </div>
      <fieldset>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 coluna:top-14">
          <div className="w-11 flex-shrink-0" />
          <div className="min-w-0 flex-1 text-label font-semibold uppercase tracking-wider text-gray-400">Selecionar Conteúdo</div>
          <div className="hidden w-56 flex-shrink-0 text-label font-semibold uppercase tracking-wider text-gray-400 xl:block">Tempo de Acesso</div>
          <div className="hidden w-44 flex-shrink-0 text-label font-semibold uppercase tracking-wider text-gray-400 xl:block">Liberação</div>
        </div>
        {rootVisible ? (
          <Row
            rowKey="all"
            kind="root"
            depth={0}
            label="Acesso completo a todos os produtos"
            state={items.all}
            onToggle={toggle("all")}
            onChange={(n) => set("all", n)}
            schedules={[]}
          />
        ) : null}
        {rendered}
        {empty ? <div className="px-4 py-10 text-center text-sm text-gray-400">Nenhum conteúdo corresponde ao filtro.</div> : null}
      </fieldset>
    </div>
  );
}
