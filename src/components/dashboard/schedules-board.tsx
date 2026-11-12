"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  addScheduleProductAction,
  createScheduleAction,
  removeScheduleProductAction,
  renameScheduleAction,
  restoreScheduleAction,
  trashScheduleAction,
} from "@/app/dashboard/content/schedules/actions";
import { Button } from "./button";
import { Dropdown, MenuItem, MenuSeparator } from "./dropdown";
import {
  ArrowRightIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  DotsIcon,
  ImageIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./icons";
import { InlineName } from "./inline-name";
import { Combobox } from "./combobox";
import { Input, Label } from "./input";
import { Modal, ModalFooter } from "./modal";
import { TrashModal } from "./trash-modal";
import { useAdminAction } from "./use-admin-action";

export type ScheduleRow = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  products: { id: number; name: string; thumbnailUrl: string | null }[];
  ruleCount: number;
  deliveryCount: number;
};
export type ScheduleTrashRow = { id: number; name: string; deletedAt: string };

type Dialog =
  | { type: "new" }
  | { type: "rename"; row: ScheduleRow }
  | { type: "addProduct"; row: ScheduleRow }
  | { type: "trash"; row: ScheduleRow }
  | { type: "lixeira" }
  | null;

const TAB =
  "nav-aba -mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-2.5 text-hint text-gray-600 transition-colors hover:text-gray-900";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Conteúdo programado: busca, "Nova programação", lista com produtos expansíveis e Lixeira. */
export function SchedulesBoard({
  rows,
  trash,
  freeProducts,
}: {
  rows: ScheduleRow[];
  trash: ScheduleTrashRow[];
  freeProducts: { id: number; name: string }[];
}) {
  const router = useRouter();
  const { pending, error, run } = useAdminAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const close = () => setDialog(null);

  const visible = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("pt-BR");
    if (!term) return rows;
    return rows.filter((r) => r.name.toLocaleLowerCase("pt-BR").includes(term) || r.products.some((p) => p.name.toLocaleLowerCase("pt-BR").includes(term)));
  }, [rows, q]);

  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Conteúdo programado</h1>
            <p className="mt-1 text-sm text-gray-500">Crie programações e defina quando as aulas ficam disponíveis para os alunos.</p>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <div className="w-full sm:w-72">
              <form className="flex" role="search" onSubmit={(e) => e.preventDefault()}>
                <div
                  data-busca-caixa=""
                  className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg border border-gray-200 bg-white text-hint transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15"
                >
                  <input
                    type="text"
                    aria-label="Buscar programações"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-hint text-gray-900 outline-none placeholder-gray-400"
                    placeholder="Buscar programações"
                  />
                  <button
                    type="submit"
                    aria-label="Buscar"
                    className="flex h-full w-9 flex-shrink-0 items-center justify-center rounded-r-lg border-l border-gray-200 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                  >
                    <SearchIcon className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
            <Button className="flex-shrink-0" onClick={() => setDialog({ type: "new" })}>
              <PlusIcon className="h-4 w-4" />
              Nova programação
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
                  { href: "/dashboard/content/products", label: "Produtos", Icon: PackageIcon, current: false },
                  { href: "/dashboard/content/schedules", label: "Conteúdo programado", Icon: CalendarClockIcon, current: true },
                  { href: "/dashboard/content/banners", label: "Banners", Icon: ImageIcon, current: false },
                ].map(({ href, label, Icon, current }) => (
                  <Link key={href} href={href} data-nav="sub" data-current={current ? "" : undefined} aria-current={current ? "page" : undefined} className={TAB}>
                    <Icon className="nav-icone h-4 w-4 flex-shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
            {lixeira}
          </div>
        </div>
      </nav>
      <div data-toolbar="" className="mb-6 flex flex-wrap items-center justify-end gap-2 lg:hidden">
        {lixeira}
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <CalendarClockIcon className="h-8 w-8 text-gray-300" />
          </div>
          <h2 className="mb-1 text-lg font-medium text-gray-700">Nenhuma programação ainda</h2>
          <p className="max-w-md text-sm text-gray-400">Sem programação, todas as aulas abrem assim que o aluno recebe o acesso.</p>
          <div className="mt-4">
            <Button onClick={() => setDialog({ type: "new" })}>
              <PlusIcon className="h-4 w-4" />
              Nova programação
            </Button>
          </div>
        </div>
      ) : (
        <div className={`transition-opacity${pending ? " opacity-60" : ""}`}>
          <div role="table" style={{ "--lista-cols": "minmax(0,1fr) 8rem 9rem 10rem 4.5rem" } as React.CSSProperties} className="lista lista--card">
            <div className="lista-cabecalho-envelope">
              <div role="row" className="lista-cabecalho">
                <div role="columnheader" className="lista-celula lista-th">
                  Programação
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  Produtos
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  Uso
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  Atualizado em
                </div>
                <div role="columnheader" className="lista-celula lista-th lista-celula--fim">
                  <span className="sr-only">Ações</span>
                </div>
              </div>
            </div>
            <div role="rowgroup" className="lista-corpo">
              {visible.length === 0 ? <div className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma programação encontrada</div> : null}
              {visible.map((row) => {
                const isOpen = open.has(row.id);
                return (
                  <div key={row.id} className="border-b border-gray-100 last:border-0">
                    <div role="row" className="lista-linha cursor-pointer" onClick={() => toggle(row.id)}>
                      <div role="cell" data-papel="titulo" className="lista-celula gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                          <CalendarClockIcon className="h-5 w-5" />
                        </div>
                        <span onClick={(e) => e.stopPropagation()} className="min-w-0">
                          <InlineName
                            label="Nome da programação"
                            value={row.name}
                            textClassName="text-sm font-medium text-gray-900 block w-fit max-w-full truncate"
                            onSave={(name) => run(renameScheduleAction, { id: row.id, name })}
                          />
                        </span>
                      </div>
                      <div role="cell" data-papel="secundario" className="lista-celula">
                        <span className="text-sm text-gray-700" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {plural(row.products.length, "produto", "produtos")}
                        </span>
                      </div>
                      <div role="cell" data-papel="meta" className="lista-celula">
                        {row.deliveryCount === 0 ? (
                          <span className="text-sm text-gray-400">Não utilizada</span>
                        ) : (
                          <span className="text-sm text-gray-700">{plural(row.deliveryCount, "entrega", "entregas")}</span>
                        )}
                      </div>
                      <div role="cell" data-papel="meta" className="lista-celula">
                        <span className="text-sm text-gray-500">{row.updatedAt}</span>
                      </div>
                      <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim gap-1" onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                          trigger={(p) => (
                            <button type="button" {...p} aria-label="Ações da programação" data-row-menu-trigger="programacao" className="btn-icone">
                              <DotsIcon className="h-4 w-4" />
                            </button>
                          )}
                        >
                          <MenuItem icon={<PlusIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "addProduct", row })}>
                            Adicionar produto
                          </MenuItem>
                          <MenuItem icon={<PencilIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "rename", row })}>
                            Renomear
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "trash", row })}>
                            Excluir
                          </MenuItem>
                        </Dropdown>
                        <button type="button" aria-label={isOpen ? "Recolher" : "Expandir"} className="btn-icone btn-abrir" aria-expanded={isOpen} onClick={() => toggle(row.id)}>
                          <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200${isOpen ? " rotate-180" : ""}`} />
                        </button>
                      </div>
                    </div>
                    <div className="revelar" data-aberto={isOpen ? "true" : undefined}>
                      <div>
                        <div className="border-t border-gray-100 bg-gray-50/70">
                          <div className="divide-y divide-gray-100">
                            {row.products.map((p) => (
                              <div
                                key={p.id}
                                data-linha-abrir=""
                                onClick={() => router.push(`/dashboard/content/product/${p.id}/schedule`)}
                                className="flex cursor-pointer items-center justify-between gap-3 py-2 pl-4 pr-4 transition-colors hover:bg-white sm:pl-17"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-gray-200/60">
                                    {p.thumbnailUrl ? (
                                      <img src={p.thumbnailUrl} alt="" loading="lazy" decoding="async" width={80} height={80} className="relative h-full w-full object-cover" />
                                    ) : (
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <ImageIcon className="h-5 w-5 text-gray-300" />
                                      </div>
                                    )}
                                  </div>
                                  <span className="truncate text-sm font-medium text-gray-900">{p.name}</span>
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Dropdown
                                    trigger={(t) => (
                                      <button type="button" {...t} aria-label="Ações do produto" data-row-menu-trigger="produto-programacao" className="btn-icone">
                                        <DotsIcon className="h-4 w-4" />
                                      </button>
                                    )}
                                  >
                                    <MenuItem
                                      tone="danger"
                                      disabled={pending}
                                      icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />}
                                      onSelect={() => run(removeScheduleProductAction, { scheduleId: row.id, productId: p.id })}
                                    >
                                      Remover da programação
                                    </MenuItem>
                                  </Dropdown>
                                  <Link href={`/dashboard/content/product/${p.id}/schedule`} aria-label="Abrir" className="btn-icone btn-abrir" data-abrir="">
                                    <ArrowRightIcon className="h-4 w-4" />
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex min-h-14 items-center border-t border-gray-100 py-2 pl-4 pr-4 sm:pl-17">
                            <button
                              type="button"
                              disabled={freeProducts.length === 0}
                              onClick={() => setDialog({ type: "addProduct", row })}
                              className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-badge font-medium text-gray-500 transition-colors hover:border-brand-500/60 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <PlusIcon className="h-3 w-3" />
                              Adicionar produto
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Modal open={dialog?.type === "new"} onClose={close} title="Nova programação">
        {dialog?.type === "new" ? (
          <form action={(fd) => run(createScheduleAction, fd, { onOk: close })} className="space-y-6">
            <div>
              <Label htmlFor="schedule-name">Nome da programação</Label>
              <Input id="schedule-name" name="name" required maxLength={200} autoFocus />
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Criar programação
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal open={dialog?.type === "rename"} onClose={close} title="Renomear programação">
        {dialog?.type === "rename" ? (
          <form action={(fd) => run(renameScheduleAction, fd, { onOk: close })} className="space-y-6">
            <input type="hidden" name="id" value={dialog.row.id} />
            <div>
              <Label htmlFor="schedule-rename">Nome da programação</Label>
              <Input id="schedule-rename" name="name" required maxLength={200} defaultValue={dialog.row.name} autoFocus />
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

      <Modal open={dialog?.type === "addProduct"} onClose={close} title="Adicionar produto" description="Cada produto fica em uma programação por vez.">
        {dialog?.type === "addProduct" ? (
          freeProducts.length === 0 ? (
            <p className="text-hint text-gray-500">Todos os produtos já estão em alguma programação.</p>
          ) : (
            <form action={(fd) => run(addScheduleProductAction, fd, { onOk: close })} className="space-y-6">
              <input type="hidden" name="scheduleId" value={dialog.row.id} />
              <div>
                <Label htmlFor="schedule-product">Produto</Label>
                <Combobox
                  id="schedule-product"
                  name="productId"
                  required
                  options={freeProducts.map((p) => ({ value: String(p.id), label: p.name }))}
                />
              </div>
              <ModalFooter>
                <Button variant="outline" onClick={close}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  Adicionar
                </Button>
              </ModalFooter>
            </form>
          )
        ) : null}
      </Modal>

      <Modal
        open={dialog?.type === "trash"}
        onClose={close}
        title="Excluir programação?"
        description={dialog?.type === "trash" ? `"${dialog.row.name}" vai para a Lixeira e as aulas dos produtos dela abrem sem espera. Você pode restaurar depois.` : undefined}
      >
        <ModalFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => dialog?.type === "trash" && run(trashScheduleAction, { id: dialog.row.id }, { onOk: close })}
          >
            <TrashIcon className="h-4 w-4" />
            Excluir
          </Button>
        </ModalFooter>
      </Modal>

      <TrashModal
        open={dialog?.type === "lixeira"}
        onClose={close}
        description="Programações excluídas."
        pending={pending}
        entries={trash.map((t) => ({
          key: String(t.id),
          name: t.name,
          kindLabel: "Programação",
          deletedAt: t.deletedAt,
          onRestore: () => run(restoreScheduleAction, { id: t.id }),
        }))}
      />
    </div>
  );
}
