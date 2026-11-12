"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AdminProductRow, AdminShowcaseNode } from "@/lib/admin/content";
import {
  createProductAction,
  createShowcaseAction,
  duplicateProductAction,
  duplicateShowcaseAction,
  moveProductAction,
  renameShowcaseAction,
  renameProductAction,
  reorderAction,
  restoreProductAction,
  restoreShowcaseAction,
  setProductImageAction,
  setProductStatusAction,
  setShowcaseStatusAction,
  trashProductAction,
  trashShowcaseAction,
  type ActionResult,
} from "@/app/dashboard/content/products/actions";
import { Button, buttonClass } from "./button";
import { FilterChip } from "./filter-chip";
import {
  CalendarClockIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ImageIcon,
  PackageIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  FilterIcon,
  TrashIcon,
} from "./icons";
import { ImageUpload } from "./image-upload";
import { Combobox } from "./combobox";
import { INPUT_CLASS, Input, Label } from "./input";
import { Modal, ModalFooter } from "./modal";
import { ShowcaseCard, type ShowcaseHandlers, type Visibility } from "./showcase-card";
import type { SortableMove } from "./sortable-list";
import { SortableList } from "./sortable-list";
import { useAdminAction, type Fields } from "./use-admin-action";

export type TrashItem = { id: number; name: string; deletedAt: string };

type Dialog =
  | { type: "newShowcase"; parent: AdminShowcaseNode | null }
  | { type: "renameShowcase"; node: AdminShowcaseNode }
  | { type: "newProduct"; node: AdminShowcaseNode }
  | { type: "productImage"; product: AdminProductRow }
  | { type: "duplicateTo"; product: AdminProductRow }
  | { type: "trash"; kind: "showcase" | "product"; id: number; name: string }
  | { type: "lixeira" }
  | null;


// ---------- árvore (funções puras) ----------

function findNode(tree: AdminShowcaseNode[], id: number): AdminShowcaseNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    const inner = findNode(n.children, id);
    if (inner) return inner;
  }
  return null;
}
function mapNodes(tree: AdminShowcaseNode[], fn: (n: AdminShowcaseNode) => AdminShowcaseNode): AdminShowcaseNode[] {
  return tree.map((n) => fn({ ...n, children: mapNodes(n.children, fn) }));
}
function moveIn<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
function flatten(tree: AdminShowcaseNode[], depth = 0): { node: AdminShowcaseNode; depth: number }[] {
  return tree.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}

// ---------- filtros ----------

const STATUS_OPTIONS = [
  { value: "published", label: "Publicado" },
  { value: "hidden", label: "Oculto" },
];
const RECURSOS_OPTIONS = [
  { value: "free", label: "Gratuito" },
  { value: "paid", label: "Pago" },
  { value: "terms", label: "Termo de aceite" },
];
const PENDENCIAS_OPTIONS = [
  { value: "noLessons", label: "Sem aulas" },
  { value: "noImage", label: "Sem capa" },
  { value: "noOffer", label: "Sem oferta" },
];

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

type Filters = { q: string; status: string[]; recursos: string[]; pendencias: string[] };

function chipsMatch(p: AdminProductRow, f: Filters) {
  if (f.status.length && !f.status.includes(p.status)) return false;
  if (
    f.recursos.length &&
    !f.recursos.some((r) => (r === "free" ? p.isFree : r === "paid" ? !p.isFree : r === "terms" ? p.termsEnabled : false))
  )
    return false;
  if (
    f.pendencias.length &&
    !f.pendencias.some((r) =>
      // Gratuito não precisa de oferta: todo aluno já acessa.
      r === "noImage" ? !p.thumbnailUrl : r === "noLessons" ? p.lessonCount === 0 : r === "noOffer" ? !p.isFree && !p.hasOffer : false,
    )
  )
    return false;
  return true;
}

/** Quais vitrines/produtos aparecem com a busca e os filtros atuais. */
function computeVisibility(tree: AdminShowcaseNode[], f: Filters) {
  const q = normalize(f.q.trim());
  const chips = f.status.length + f.recursos.length + f.pendencias.length > 0;
  const showcases = new Set<number>();
  const products = new Set<number>();
  function walk(node: AdminShowcaseNode, ancestorMatch: boolean): boolean {
    const selfMatch = ancestorMatch || (q !== "" && normalize(node.name).includes(q));
    let any = false;
    for (const p of node.products) {
      const textOk = q === "" || selfMatch || normalize(p.name).includes(q);
      if (textOk && chipsMatch(p, f)) {
        products.add(p.id);
        any = true;
      }
    }
    for (const child of node.children) if (walk(child, selfMatch)) any = true;
    const visible = any || (!chips && (q === "" || selfMatch));
    if (visible) showcases.add(node.id);
    return visible;
  }
  for (const n of tree) walk(n, false);
  return { showcases, products, active: q !== "" || chips };
}

// ---------- tela ----------

export function ProductsBoard({
  tree: serverTree,
  trash,
  initialPendencias = [],
}: {
  tree: AdminShowcaseNode[];
  trash: { showcases: TrashItem[]; products: TrashItem[] };
  initialPendencias?: string[];
}) {
  // Estado local para reordenação otimista; volta a seguir o servidor quando a página é revalidada.
  const [tree, setTree] = useState(serverTree);
  const [synced, setSynced] = useState(serverTree);
  if (synced !== serverTree) {
    setSynced(serverTree);
    setTree(serverTree);
  }

  const [filters, setFilters] = useState<Filters>({ q: "", status: [], recursos: [], pendencias: initialPendencias });
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const { pending, error, run } = useAdminAction();

  const visibility = useMemo(() => computeVisibility(tree, filters), [tree, filters]);
  const allIds = useMemo(() => flatten(tree).map((x) => x.node.id), [tree]);
  const anyOpen = allIds.some((id) => !collapsed.has(id));

  /** Executa a action; em erro mostra a mensagem e, se houver, desfaz o estado otimista. */
  // As chamadas entram em fila (useAdminAction): edições feitas durante outra action não se perdem.
  function act(action: (fd: FormData) => Promise<ActionResult>, fields: Fields, opts: { optimistic?: boolean; done?: () => void } = {}) {
    run(action, fields, { onOk: () => opts.done?.(), onError: opts.optimistic ? () => setTree(serverTree) : undefined });
  }

  function reorderShowcases(parentId: number | null, from: number, to: number) {
    const siblings = parentId === null ? tree : (findNode(tree, parentId)?.children ?? []);
    const next = moveIn(siblings, from, to);
    setTree(parentId === null ? next : mapNodes(tree, (n) => (n.id === parentId ? { ...n, children: next } : n)));
    act(reorderAction, { kind: "showcase", parentId: parentId ?? "", ids: next.map((n) => n.id).join(",") }, { optimistic: true });
  }

  function onMoveProduct(m: SortableMove) {
    if (m.fromParent === null || m.toParent === null) return;
    const source = findNode(tree, m.fromParent);
    const product = source?.products.find((p) => p.id === m.id);
    if (!source || !product) return;
    if (m.fromParent === m.toParent) {
      const next = moveIn(source.products, m.oldIndex, m.newIndex);
      setTree(mapNodes(tree, (n) => (n.id === source.id ? { ...n, products: next } : n)));
      act(reorderAction, { kind: "product", parentId: source.id, ids: next.map((p) => p.id).join(",") }, { optimistic: true });
      return;
    }
    const toParent = m.toParent;
    setTree(
      mapNodes(tree, (n) => {
        if (n.id === source.id) return { ...n, products: n.products.filter((p) => p.id !== m.id) };
        if (n.id === toParent) {
          const products = n.products.slice();
          products.splice(m.newIndex, 0, { ...product, showcaseId: toParent });
          return { ...n, products };
        }
        return n;
      }),
    );
    act(moveProductAction, { id: m.id, showcaseId: toParent, position: m.newIndex }, { optimistic: true });
  }

  const handlers: ShowcaseHandlers = {
    toggle: (id) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    rename: (id, name) => act(renameShowcaseAction, { id, name }),
    editName: (node) => setDialog({ type: "renameShowcase", node }),
    setStatus: (id, status) => act(setShowcaseStatusAction, { id, status }),
    duplicate: (id) => act(duplicateShowcaseAction, { id }),
    trash: (node) => setDialog({ type: "trash", kind: "showcase", id: node.id, name: node.name }),
    newSubshowcase: (node) => setDialog({ type: "newShowcase", parent: node }),
    newProduct: (node) => setDialog({ type: "newProduct", node }),
    step: (node, delta) => {
      const siblings = node.parentId === null ? tree : (findNode(tree, node.parentId)?.children ?? []);
      const i = siblings.findIndex((n) => n.id === node.id);
      if (i < 0 || i + delta < 0 || i + delta >= siblings.length) return;
      reorderShowcases(node.parentId, i, i + delta);
    },
    moveShowcase: (m) => {
      if (m.fromParent !== m.toParent) return; // grupos por pai: não acontece
      reorderShowcases(m.fromParent, m.oldIndex, m.newIndex);
    },
    moveProduct: onMoveProduct,
    product: {
      rename: (id, name) => act(renameProductAction, { id, name }),
      setStatus: (id, status) => act(setProductStatusAction, { id, status }),
      editImage: (product) => setDialog({ type: "productImage", product }),
      duplicate: (id) => act(duplicateProductAction, { id }),
      duplicateTo: (product) => setDialog({ type: "duplicateTo", product }),
      trash: (product) => setDialog({ type: "trash", kind: "product", id: product.id, name: product.name }),
    },
  };

  const view: Visibility = {
    isOpen: (id) => !collapsed.has(id),
    showcaseVisible: (id) => visibility.showcases.has(id),
    productVisible: (p) => visibility.products.has(p.id),
    // Com busca/filtro ativos parte dos itens está escondida: arrastar ficaria ambíguo.
    dragDisabled: visibility.active || pending,
    busy: pending,
  };

  const close = () => setDialog(null);
  const submitAndClose = (action: (fd: FormData) => Promise<ActionResult>) => (fd: FormData) => run(action, fd, { onOk: close });
  const trashCount = trash.showcases.length + trash.products.length;

  return (
    <div>
      <div>
        <div className="mb-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div data-backlink="" />
              <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Produtos</h1>
              <p className="mt-1 text-sm text-gray-500">Gerencie suas vitrines e produtos</p>
            </div>
            <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
              <div className="w-full sm:w-72">
                <div className="relative w-full">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    name="filtroProdutos"
                    id="filtroProdutos"
                    aria-label="Buscar por vitrines ou produtos"
                    placeholder="Buscar por vitrines ou produtos"
                    value={filters.q}
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                    className={`${INPUT_CLASS} h-[38px] pl-9 pr-3`}
                  />
                </div>
              </div>
              <Button className="flex-shrink-0" onClick={() => setDialog({ type: "newShowcase", parent: null })}>
                <PlusIcon className="h-4 w-4" />
                Nova vitrine
              </Button>
            </div>
          </div>
        </div>

        <nav data-subnav="" className="relative z-30 my-6 border-b border-gray-200 max-sm:mb-4 max-sm:border-b-0">
          <div className="flex min-h-11 flex-wrap items-end justify-start gap-x-1">
            <div className="min-w-0 flex-1">
              <div className="relative">
                <div className="subnav-pista flex flex-wrap items-end gap-x-1 max-sm:flex-nowrap max-sm:gap-x-1.5 max-sm:overflow-x-auto max-sm:overscroll-x-contain">
                  {[
                    { href: "/dashboard/content/products", label: "Produtos", Icon: PackageIcon, current: true },
                    { href: "/dashboard/content/schedules", label: "Conteúdo programado", Icon: CalendarClockIcon, current: false },
                    { href: "/dashboard/content/banners", label: "Banners", Icon: ImageIcon, current: false },
                  ].map(({ href, label, Icon, current }) => (
                    <Link
                      key={href}
                      href={href}
                      data-nav="sub"
                      data-current={current ? "" : undefined}
                      aria-current={current ? "page" : undefined}
                      className="nav-aba -mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-2.5 text-hint text-gray-600 transition-colors hover:text-gray-900"
                    >
                      <Icon className="nav-icone h-4 w-4 flex-shrink-0" />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
              <Button variant="ghost" className="flex-shrink-0 !px-2.5 !py-1.5" onClick={() => setDialog({ type: "lixeira" })}>
                <TrashIcon className="h-4 w-4" />
                Lixeira
              </Button>
            </div>
          </div>
        </nav>

        <div data-toolbar="" className="mb-6 flex flex-wrap items-center gap-2 lg:sticky lg:top-0 lg:z-30 lg:-mt-3 lg:mb-3 lg:bg-white lg:py-3 coluna:top-14">
          <div data-filtros-botao="" className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <Button variant="outline" className="flex-shrink-0" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
              <FilterIcon className="h-4 w-4" />
              Filtros
            </Button>
          </div>
          <div data-filters-left="" className={`flex min-w-0 flex-1 flex-wrap items-center gap-2${filtersOpen ? " filtros-abertos" : ""}`}>
            <FilterChip
              id="filter-status-trigger"
              label="Status"
              options={STATUS_OPTIONS}
              selected={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
            />
            <FilterChip
              id="filter-recursos-trigger"
              label="Recursos"
              options={RECURSOS_OPTIONS}
              selected={filters.recursos}
              onChange={(recursos) => setFilters((f) => ({ ...f, recursos }))}
            />
            <FilterChip
              id="filter-pendencias-trigger"
              label="Pendências"
              options={PENDENCIAS_OPTIONS}
              selected={filters.pendencias}
              onChange={(pendencias) => setFilters((f) => ({ ...f, pendencias }))}
            />
          </div>
          <div data-filters-right="" className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-shrink-0">
            <div className="flex-shrink-0 self-start">
              <Button variant="outline" onClick={() => setCollapsed(anyOpen ? new Set(allIds) : new Set())} disabled={allIds.length === 0}>
                <span className="inline-flex items-center gap-2">
                  {anyOpen ? <ChevronsDownUpIcon className="h-4 w-4" /> : <ChevronsUpDownIcon className="h-4 w-4" />}
                  {anyOpen ? "Recolher tudo" : "Expandir tudo"}
                </span>
              </Button>
            </div>
            <div className="contents lg:hidden">
              <Button variant="ghost" className="flex-shrink-0 !px-2.5 !py-1.5" onClick={() => setDialog({ type: "lixeira" })}>
                <TrashIcon className="h-4 w-4" />
                Lixeira
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
            {error}
          </div>
        ) : null}

        <div className={`transition-opacity${pending ? " opacity-60" : ""}`}>
          <div role="tree">
            {tree.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center">
                <p className="text-sm font-medium text-gray-900">Nenhuma vitrine ainda</p>
                <p className="mt-1 text-hint text-gray-500">Crie uma vitrine para organizar seus produtos.</p>
              </div>
            ) : null}
            <SortableList
              group="vitrine-topo"
              type="vitrine"
              parentId={null}
              disabled={view.dragDisabled}
              onMove={handlers.moveShowcase}
              className="space-y-6"
            >
              {tree.map((node, i) => (
                <ShowcaseCard key={node.id} node={node} index={i} siblings={tree.length} on={handlers} view={view} />
              ))}
            </SortableList>
            {visibility.active && visibility.showcases.size === 0 && tree.length > 0 ? (
              <p className="py-12 text-center text-hint text-gray-500">Nenhum resultado para os filtros atuais.</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------- modais ---------- */}

      <Modal
        open={dialog?.type === "newShowcase"}
        onClose={close}
        title={dialog?.type === "newShowcase" && dialog.parent ? "Nova subvitrine" : "Nova vitrine"}
        description={
          dialog?.type === "newShowcase" && dialog.parent ? `Dentro de "${dialog.parent.name}"` : "Vitrines agrupam seus produtos na área do aluno."
        }
      >
        {dialog?.type === "newShowcase" ? (
          <form action={submitAndClose(createShowcaseAction)} className="space-y-6">
            {dialog.parent ? <input type="hidden" name="parentId" value={dialog.parent.id} /> : null}
            <div>
              <Label htmlFor="showcase-name">Nome da vitrine</Label>
              <Input id="showcase-name" name="name" required maxLength={200} autoFocus />
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Criar vitrine
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal open={dialog?.type === "renameShowcase"} onClose={close} title="Editar vitrine">
        {dialog?.type === "renameShowcase" ? (
          <form action={submitAndClose(renameShowcaseAction)} className="space-y-6">
            <input type="hidden" name="id" value={dialog.node.id} />
            <div>
              <Label htmlFor="showcase-rename">Nome da vitrine</Label>
              <Input id="showcase-rename" name="name" required maxLength={200} defaultValue={dialog.node.name} autoFocus />
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Salvar
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={dialog?.type === "newProduct"}
        onClose={close}
        title="Novo produto"
        description={dialog?.type === "newProduct" ? `Na vitrine "${dialog.node.name}"` : undefined}
      >
        {dialog?.type === "newProduct" ? (
          <form action={submitAndClose(createProductAction)} className="space-y-6">
            <input type="hidden" name="showcaseId" value={dialog.node.id} />
            <div>
              <Label htmlFor="product-name">Nome do produto</Label>
              <Input id="product-name" name="name" required maxLength={200} autoFocus />
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Criar produto
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal open={dialog?.type === "productImage"} onClose={close} title="Imagem do produto" description="JPG, PNG, WebP ou GIF, até 2 MB.">
        {dialog?.type === "productImage" ? (
          <form action={submitAndClose(setProductImageAction)} className="space-y-6">
            <input type="hidden" name="id" value={dialog.product.id} />
            <ImageUpload name="thumbnailUrl" defaultValue={dialog.product.thumbnailUrl} boxClassName="w-44 h-28" />
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Salvar
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal open={dialog?.type === "duplicateTo"} onClose={close} title="Duplicar para…">
        {dialog?.type === "duplicateTo" ? (
          <form action={submitAndClose(duplicateProductAction)} className="space-y-6">
            <input type="hidden" name="id" value={dialog.product.id} />
            <div>
              <Label htmlFor="duplicate-target">Vitrine de destino</Label>
              <Combobox
                id="duplicate-target"
                name="targetShowcaseId"
                defaultValue={String(dialog.product.showcaseId)}
                options={flatten(tree).map(({ node, depth }) => ({ value: String(node.id), label: `${"— ".repeat(depth)}${node.name}` }))}
              />
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Duplicar
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={dialog?.type === "trash"}
        onClose={close}
        title={dialog?.type === "trash" && dialog.kind === "showcase" ? "Excluir vitrine?" : "Excluir produto?"}
        description={
          dialog?.type === "trash"
            ? `"${dialog.name}" vai para a Lixeira${dialog.kind === "showcase" ? " com os produtos dela" : ""}. Você pode restaurar depois.`
            : undefined
        }
      >
        {dialog?.type === "trash" ? (
          <ModalFooter>
            <Button variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                act(dialog.kind === "showcase" ? trashShowcaseAction : trashProductAction, { id: dialog.id }, { done: close })
              }
            >
              <TrashIcon className="h-4 w-4" />
              Excluir
            </Button>
          </ModalFooter>
        ) : null}
      </Modal>

      <Modal open={dialog?.type === "lixeira"} onClose={close} title="Lixeira" description="Vitrines e produtos excluídos." className="max-w-xl">
        {trashCount === 0 ? (
          <p className="text-hint text-gray-500">A lixeira está vazia.</p>
        ) : (
          <div className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {[
              ...trash.showcases.map((t) => ({ ...t, kind: "showcase" as const })),
              ...trash.products.map((t) => ({ ...t, kind: "product" as const })),
            ].map((t) => (
              <div key={`${t.kind}-${t.id}`} className="linha-lista">
                <div className="linha-info">
                  <div className="w-full min-w-0 sm:col-start-1 sm:row-start-1">
                    <span className="edicao-inline-texto block truncate">{t.name}</span>
                  </div>
                  <div className="linha-meta">
                    <span className="linha-meta-texto">{t.kind === "showcase" ? "Vitrine" : "Produto"}</span>
                    <span className="linha-meta-ponto">·</span>
                    <span className="linha-meta-texto">Excluído em {t.deletedAt}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(t.kind === "showcase" ? restoreShowcaseAction : restoreProductAction, { id: t.id })}
                  className={buttonClass("outline", "flex-shrink-0 !px-2.5 !py-1.5")}
                >
                  <RotateCcwIcon className="h-4 w-4" />
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
