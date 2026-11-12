"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminProductRow } from "@/lib/admin/content";
import { Dropdown, MenuItem, MenuSeparator } from "./dropdown";
import { ArrowRightIcon, CameraIcon, CopyIcon, CopyToIcon, DotsIcon, GripIcon, ImageIcon, PencilIcon, TrashIcon } from "./icons";
import { InlineName } from "./inline-name";
import { PRODUCT_STATUS, StatusSelo } from "./status-selo";

export type ProductRowHandlers = {
  rename: (id: number, name: string) => void;
  setStatus: (id: number, status: AdminProductRow["status"]) => void;
  editImage: (product: AdminProductRow) => void;
  duplicate: (id: number) => void;
  duplicateTo: (product: AdminProductRow) => void;
  trash: (product: AdminProductRow) => void;
};

export function productHref(id: number) {
  return `/dashboard/content/product/${id}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Linha de produto. */
export function ProductRow({
  product,
  hidden,
  busy,
  on,
}: {
  product: AdminProductRow;
  hidden: boolean;
  busy: boolean;
  on: ProductRowHandlers;
}) {
  const router = useRouter();
  const href = productHref(product.id);
  const pendencias = [!product.thumbnailUrl && "imagem", product.lessonCount === 0 && "aulas"].filter(Boolean).join(" ");

  return (
    <div
      data-id={product.id}
      data-status={product.status}
      data-pendencias={pendencias}
      data-linha-abrir=""
      className={`linha-lista cursor-pointer${hidden ? " hidden" : ""}`}
      onClick={(e) => {
        // Clique na linha abre o produto (menos em botões, links e campos).
        if ((e.target as HTMLElement).closest("button,a,input,[role=menu]")) return;
        router.push(href);
      }}
    >
      <button type="button" className="handle alca-arrastar" aria-label="Arrastar para reordenar">
        <GripIcon className="h-4 w-4" />
      </button>
      <span className="tooltip flex-shrink-0">
        <button
          type="button"
          aria-label="Editar imagem"
          onClick={() => on.editImage(product)}
          className="group/thumb relative block h-11 w-11 overflow-hidden rounded-lg"
        >
          <div className="relative h-11 w-11 overflow-hidden rounded-lg bg-gray-200/60">
            {product.thumbnailUrl ? (
              <div className="absolute inset-0">
                <img
                  src={product.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={88}
                  height={88}
                  className="relative h-full w-full object-cover duration-500"
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-5 w-5 text-gray-300" />
              </div>
            )}
          </div>
          <span className="thumb-overlay thumb-overlay--camera">
            <CameraIcon className="h-4 w-4 text-white" />
          </span>
        </button>
      </span>
      <div className="linha-info">
        <div className="w-full min-w-0 sm:col-start-1 sm:row-start-1">
          <InlineName label="Nome do produto" value={product.name} onSave={(name) => on.rename(product.id, name)} />
        </div>
        <div className="linha-meta">
          <span className="linha-meta-texto">Cursos</span>
          <span className="linha-meta-ponto">·</span>
          {product.lessonCount === 0 ? (
            <span className="linha-meta-texto !text-brand-600">Nenhuma aula neste produto</span>
          ) : (
            <span className="linha-meta-texto">{plural(product.lessonCount, "aula", "aulas")}</span>
          )}
          {product.isFree ? (
            <>
              <span className="linha-meta-ponto">·</span>
              <span className="selo selo--neutral">Gratuito</span>
            </>
          ) : null}
        </div>
        <StatusSelo value={product.status} options={PRODUCT_STATUS} onChange={(s) => on.setStatus(product.id, s)} />
      </div>
      <Dropdown
        trigger={(p) => (
          <button type="button" {...p} aria-label="Ações do produto" data-row-menu-trigger="produto" className="btn-icone btn-linha-acao">
            <DotsIcon className="h-4 w-4" />
          </button>
        )}
      >
        <MenuItem disabled={busy} icon={<ArrowRightIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => router.push(href)}>
          Abrir
        </MenuItem>
        <MenuItem disabled={busy} icon={<PencilIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => on.editImage(product)}>
          Editar imagem
        </MenuItem>
        <MenuItem disabled={busy} icon={<CopyIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => on.duplicate(product.id)}>
          Duplicar
        </MenuItem>
        <MenuItem disabled={busy} icon={<CopyToIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => on.duplicateTo(product)}>
          Duplicar para…
        </MenuItem>
        <MenuSeparator />
        <MenuItem disabled={busy} tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => on.trash(product)}>
          Excluir
        </MenuItem>
      </Dropdown>
      <Link href={href} aria-label="Abrir produto" className="btn-icone btn-abrir" data-abrir="">
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}
