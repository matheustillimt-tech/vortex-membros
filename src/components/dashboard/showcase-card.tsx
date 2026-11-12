"use client";

import type { AdminProductRow, AdminShowcaseNode } from "@/lib/admin/content";
import { buttonClass } from "./button";
import { Dropdown, MenuItem, MenuSeparator } from "./dropdown";
import { ChevronDownIcon, ChevronUpIcon, CopyIcon, DotsIcon, FolderIcon, FolderPlusIcon, GripIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { InlineName } from "./inline-name";
import { ProductRow, type ProductRowHandlers } from "./product-row";
import { SortableList, type SortableMove } from "./sortable-list";
import { SHOWCASE_STATUS, StatusSelo } from "./status-selo";

export type ShowcaseHandlers = {
  toggle: (id: number) => void;
  rename: (id: number, name: string) => void;
  editName: (node: AdminShowcaseNode) => void;
  setStatus: (id: number, status: AdminShowcaseNode["status"]) => void;
  duplicate: (id: number) => void;
  trash: (node: AdminShowcaseNode) => void;
  newSubshowcase: (node: AdminShowcaseNode) => void;
  newProduct: (node: AdminShowcaseNode) => void;
  step: (node: AdminShowcaseNode, delta: -1 | 1) => void;
  moveShowcase: (move: SortableMove) => void;
  moveProduct: (move: SortableMove) => void;
  product: ProductRowHandlers;
};

export type Visibility = {
  isOpen: (id: number) => boolean;
  showcaseVisible: (id: number) => boolean;
  productVisible: (p: AdminProductRow) => boolean;
  dragDisabled: boolean;
  /** Uma action em andamento: menus ficam desativados. */
  busy: boolean;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const R_XL_T = "rounded-t-[calc(var(--radius-xl)-1px)] [[data-nested]_&]:rounded-t-[calc(var(--radius-lg)-1px)]";
const R_XL_B = "rounded-b-[calc(var(--radius-xl)-1px)] [[data-nested]_&]:rounded-b-[calc(var(--radius-lg)-1px)]";

/** Card de vitrine recolhível. Subvitrines aparecem dentro, com `data-nested`. */
export function ShowcaseCard({
  node,
  index,
  siblings,
  on,
  view,
}: {
  node: AdminShowcaseNode;
  index: number;
  siblings: number;
  on: ShowcaseHandlers;
  view: Visibility;
}) {
  const open = view.isOpen(node.id);
  return (
    <div
      data-id={node.id}
      className={`rounded-xl border border-gray-200 bg-white [[data-nested]_&]:rounded-lg [[data-nested]_&]:border-gray-100${view.showcaseVisible(node.id) ? "" : " hidden"}`}
    >
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button,a,input,[role=menu]")) return;
          on.toggle(node.id);
        }}
        className={`flex cursor-pointer items-center gap-3 ${R_XL_T} ${open ? "" : R_XL_B} bg-gray-50/70 px-4 py-3 transition-colors hover:bg-gray-100/60`}
      >
        <span className="flex items-center gap-1">
          <button type="button" className={`handle alca-arrastar${view.dragDisabled ? " alca-arrastar--off" : ""}`} aria-label="Arrastar para reordenar">
            <GripIcon className="h-4 w-4" />
          </button>
          <span className="hidden flex-col sm:flex">
            <span className="tooltip">
              <button
                type="button"
                aria-label="Mover para cima"
                disabled={index === 0}
                onClick={() => on.step(node, -1)}
                className="btn-icone !h-4 !w-5 !rounded !p-0 !text-gray-300 enabled:hover:!text-gray-600 disabled:!opacity-30"
              >
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </button>
            </span>
            <span className="tooltip">
              <button
                type="button"
                aria-label="Mover para baixo"
                disabled={index === siblings - 1}
                onClick={() => on.step(node, 1)}
                className="btn-icone !h-4 !w-5 !rounded !p-0 !text-gray-300 enabled:hover:!text-gray-600 disabled:!opacity-30"
              >
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          </span>
        </span>
        <div className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-gray-200/60 sm:flex">
          <FolderIcon className="h-5 w-5 text-gray-300" />
        </div>
        <div className="linha-info">
          <div className="w-full min-w-0 sm:col-start-1 sm:row-start-1">
            <InlineName label="Nome da vitrine" value={node.name} onSave={(name) => on.rename(node.id, name)} />
          </div>
          <div className="linha-meta">
            <span className="linha-meta-texto">{node.parentId === null ? "Vitrine" : "Subvitrine"}</span>
            <span className="linha-meta-ponto">·</span>
            <span className="linha-meta-texto">{plural(node.products.length, "produto", "produtos")}</span>
          </div>
          <StatusSelo value={node.status} options={SHOWCASE_STATUS} onChange={(s) => on.setStatus(node.id, s)} />
        </div>
        <span className="flex flex-shrink-0 items-center gap-2">
          <Dropdown
            trigger={(p) => (
              <button type="button" {...p} aria-label="Ações da vitrine" data-row-menu-trigger="vitrine" className="btn-icone btn-linha-acao">
                <DotsIcon className="h-4 w-4" />
              </button>
            )}
          >
            <MenuItem disabled={view.busy} icon={<PencilIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => on.editName(node)}>
              Editar
            </MenuItem>
            <MenuItem disabled={view.busy} icon={<CopyIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => on.duplicate(node.id)}>
              Duplicar
            </MenuItem>
            <MenuItem disabled={view.busy} icon={<FolderPlusIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => on.newSubshowcase(node)}>
              Nova subvitrine
            </MenuItem>
            <MenuSeparator />
            <MenuItem disabled={view.busy} tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => on.trash(node)}>
              Excluir
            </MenuItem>
          </Dropdown>
          <span className="tooltip">
            <button
              type="button"
              aria-label={open ? "Recolher" : "Expandir"}
              aria-expanded={open}
              onClick={() => on.toggle(node.id)}
              className="btn-linha-acao outline-none hover:text-gray-400 focus:outline-none"
            >
              <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200${open ? " rotate-180" : ""}`} />
            </button>
          </span>
        </span>
      </div>
      <div className="revelar" data-aberto={open ? "true" : undefined}>
        <div>
          <div className={`${node.products.length || node.children.length ? "border-t border-gray-100 " : ""}bg-white ${R_XL_B}`}>
            <div className="divide-y divide-gray-100">
              <SortableList
                group="produto"
                type="produto"
                parentId={node.id}
                nested
                disabled={view.dragDisabled}
                onMove={on.moveProduct}
                className="divide-y divide-gray-100"
              >
                {node.products.map((p) => (
                  <ProductRow key={p.id} product={p} hidden={!view.productVisible(p)} busy={view.busy} on={on.product} />
                ))}
              </SortableList>
              {node.children.length > 0 ? (
                <SortableList
                  group={`vitrine-${node.id}`}
                  type="vitrine"
                  parentId={node.id}
                  nested
                  disabled={view.dragDisabled}
                  onMove={on.moveShowcase}
                  className="space-y-3 px-4 py-3"
                >
                  {node.children.map((child, i) => (
                    <ShowcaseCard key={child.id} node={child} index={i} siblings={node.children.length} on={on} view={view} />
                  ))}
                </SortableList>
              ) : null}
            </div>
            <div
              className={`flex flex-wrap items-center justify-end gap-2 ${R_XL_B} border-t border-gray-100 bg-gray-50/70 px-4 py-3`}
            >
              <button type="button" onClick={() => on.newProduct(node)} className={buttonClass("brand")}>
                <PlusIcon className="h-4 w-4" />
                Novo produto
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
