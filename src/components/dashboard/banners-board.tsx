"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createBannerAction,
  reorderBannersAction,
  restoreBannerAction,
  setBannerStatusAction,
  trashBannerAction,
} from "@/app/dashboard/content/banners/actions";
import { Button } from "./button";
import { Dropdown, MenuItem, MenuSeparator } from "./dropdown";
import { ArrowRightIcon, CalendarClockIcon, DotsIcon, GripIcon, ImageIcon, PackageIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Input, Label } from "./input";
import { Modal, ModalFooter } from "./modal";
import { SortableList, type SortableMove } from "./sortable-list";
import { PRODUCT_STATUS, StatusSelo } from "./status-selo";
import { TrashModal } from "./trash-modal";
import { useAdminAction } from "./use-admin-action";

export type BannerRow = { id: number; name: string; status: "published" | "hidden"; imageUrl: string | null };
export type BannerTrashRow = { id: number; name: string; deletedAt: string };

type Dialog = { type: "new" } | { type: "trash"; row: BannerRow } | { type: "lixeira" } | null;

const TAB =
  "nav-aba -mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-2.5 text-hint text-gray-600 transition-colors hover:text-gray-900";

/** Subnav do conteúdo (Produtos · Conteúdo programado · Banners) com ações à direita. */
export function ContentSubnav({ current, actions }: { current: "banners" | null; actions: React.ReactNode }) {
  return (
    <>
      <nav data-subnav="" className="relative z-30 my-6 border-b border-gray-200 has-[[aria-expanded=true]]:z-[31] max-sm:mb-4 max-sm:border-b-0">
        <div className="flex min-h-11 flex-wrap items-end justify-start gap-x-1">
          <div className="min-w-0 flex-1">
            <div className="relative">
              <div className="subnav-pista flex flex-wrap items-end gap-x-1 max-sm:flex-nowrap max-sm:gap-x-1.5 max-sm:overflow-x-auto max-sm:overscroll-x-contain">
                {[
                  { href: "/dashboard/content/products", label: "Produtos", Icon: PackageIcon, on: false },
                  { href: "/dashboard/content/schedules", label: "Conteúdo programado", Icon: CalendarClockIcon, on: false },
                  { href: "/dashboard/content/banners", label: "Banners", Icon: ImageIcon, on: current === "banners" },
                ].map(({ href, label, Icon, on }) => (
                  <Link key={href} href={href} data-nav="sub" data-current={on ? "" : undefined} aria-current={on ? "page" : undefined} className={TAB}>
                    <Icon className="nav-icone h-4 w-4 flex-shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
            {actions}
          </div>
        </div>
      </nav>
      <div data-toolbar="" className="mb-6 flex flex-wrap items-center justify-end gap-2 lg:hidden">
        {actions}
      </div>
    </>
  );
}

function moveIn<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Banners: lista arrastável com status, "Novo Banner" e Lixeira. */
export function BannersBoard({ rows: serverRows, trash }: { rows: BannerRow[]; trash: BannerTrashRow[] }) {
  const router = useRouter();
  const { pending, error, run } = useAdminAction();
  // Estado local para reordenação otimista; volta a seguir o servidor quando a página é revalidada.
  const [rows, setRows] = useState(serverRows);
  const [synced, setSynced] = useState(serverRows);
  if (synced !== serverRows) {
    setSynced(serverRows);
    setRows(serverRows);
  }
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  function onMove(m: SortableMove) {
    const next = moveIn(rows, m.oldIndex, m.newIndex);
    setRows(next);
    run(reorderBannersAction, { ids: next.map((r) => r.id).join(",") }, { onError: () => setRows(serverRows) });
  }

  const lixeira = (
    <Button variant="ghost" className="flex-shrink-0 !px-2.5 !py-1.5" onClick={() => setDialog({ type: "lixeira" })}>
      <TrashIcon className="h-4 w-4" />
      Lixeira
    </Button>
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Banners</h1>
            <p className="mt-1 text-sm text-gray-500">Gerencie os banners da plataforma</p>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <Button onClick={() => setDialog({ type: "new" })}>
              <PlusIcon className="h-4 w-4" />
              Novo Banner
            </Button>
          </div>
        </div>
      </div>

      <ContentSubnav current="banners" actions={lixeira} />

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <ImageIcon className="h-8 w-8 text-gray-300" />
          </div>
          <h2 className="mb-1 text-lg font-medium text-gray-700">Nenhum banner ainda</h2>
          <p className="max-w-md text-sm text-gray-400">O primeiro banner publicado com imagem aparece no topo da home da área do aluno.</p>
          <div className="mt-4">
            <Button onClick={() => setDialog({ type: "new" })}>
              <PlusIcon className="h-4 w-4" />
              Novo Banner
            </Button>
          </div>
        </div>
      ) : (
        <div className={`transition-opacity${pending ? " opacity-60" : ""}`}>
          <div role="table" style={{ "--lista-cols": "3rem minmax(0,1fr) 7rem 4.5rem", "--lista-acoes": 2 } as React.CSSProperties} className="lista lista--card">
            <div className="lista-cabecalho-envelope">
              <div role="row" className="lista-cabecalho">
                <div role="columnheader" className="lista-celula lista-th">
                  <span className="sr-only">Ordem</span>
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  Nome
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
              <SortableList group="banners" parentId={0} type="banner" onMove={onMove} disabled={pending}>
                {rows.map((row) => {
                  const href = `/dashboard/content/banners/${row.id}`;
                  return (
                    <div
                      key={row.id}
                      data-id={row.id}
                      role="row"
                      data-linha-abrir=""
                      className="lista-linha lista-linha--dividida lista-linha--clicavel"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button,a,input,[role=menu]")) return;
                        router.push(href);
                      }}
                    >
                      <div role="cell" data-papel="ordem" className="lista-celula">
                        <button type="button" className="handle alca-arrastar" aria-label="Arrastar para reordenar">
                          <GripIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div role="cell" data-papel="titulo" className="lista-celula">
                        <Link href={href} className="group/name flex min-w-0 items-center gap-3 text-left">
                          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-gray-200/60">
                            {row.imageUrl ? (
                              <div className="absolute inset-0">
                                <img
                                  src={row.imageUrl}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  width={88}
                                  height={88}
                                  className="relative h-full w-full object-cover transition-opacity duration-500"
                                />
                              </div>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <ImageIcon className="h-5 w-5 text-gray-300" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 transition-colors group-hover/name:text-brand-500 sm:truncate">{row.name}</div>
                            <div className="flex flex-wrap items-center gap-1.5 text-micro text-gray-400">
                              <span>Banner completo</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                      <div role="cell" data-papel="meta" className="lista-celula lista-celula--centro">
                        <StatusSelo value={row.status} options={PRODUCT_STATUS} onChange={(status) => run(setBannerStatusAction, { id: row.id, status })} />
                      </div>
                      <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim gap-1">
                        <Dropdown
                          trigger={(p) => (
                            <button type="button" {...p} aria-label="Ações do banner" data-row-menu-trigger="banner" className="btn-icone">
                              <DotsIcon className="h-4 w-4" />
                            </button>
                          )}
                        >
                          <MenuItem icon={<PencilIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => router.push(href)}>
                            Editar
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "trash", row })}>
                            Excluir
                          </MenuItem>
                        </Dropdown>
                        <Link href={href} aria-label="Abrir" className="btn-icone btn-abrir" data-abrir="">
                          <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </SortableList>
            </div>
          </div>
        </div>
      )}

      <Modal open={dialog?.type === "new"} onClose={close} title="Novo Banner">
        {dialog?.type === "new" ? (
          <form
            action={(fd) => run(createBannerAction, fd, { onOk: (res) => (res.id ? router.push(`/dashboard/content/banners/${res.id}`) : close()) })}
            className="space-y-6"
          >
            <div>
              <Label htmlFor="banner-name">Nome</Label>
              <Input id="banner-name" name="name" required maxLength={200} placeholder="Ex.: Banner de lançamento" autoFocus />
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Criar banner
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={dialog?.type === "trash"}
        onClose={close}
        title="Excluir banner?"
        description={dialog?.type === "trash" ? `"${dialog.row.name}" vai para a Lixeira e sai da área do aluno. Você pode restaurar depois.` : undefined}
      >
        <ModalFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => dialog?.type === "trash" && run(trashBannerAction, { id: dialog.row.id }, { onOk: close })}>
            <TrashIcon className="h-4 w-4" />
            Excluir
          </Button>
        </ModalFooter>
      </Modal>

      <TrashModal
        open={dialog?.type === "lixeira"}
        onClose={close}
        description="Banners excluídos."
        pending={pending}
        entries={trash.map((t) => ({
          key: String(t.id),
          name: t.name,
          kindLabel: "Banner",
          deletedAt: t.deletedAt,
          onRestore: () => run(restoreBannerAction, { id: t.id }),
        }))}
      />
    </div>
  );
}
