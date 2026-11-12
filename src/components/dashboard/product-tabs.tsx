"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminProductTree } from "@/lib/admin/content";
import { createModuleAction, publishAllAction, trashProductAndLeaveAction } from "@/app/dashboard/content/product/[id]/actions";
import {
  duplicateProductAction,
  renameProductAction,
  setProductStatusAction,
} from "@/app/dashboard/content/products/actions";
import { Button } from "./button";
import { Dropdown, MenuItem, MenuLink } from "./dropdown";
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CopyIcon,
  DotsIcon,
  PlayListIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from "./icons";
import { InlineName } from "./inline-name";
import { Input, Label } from "./input";
import { Modal, ModalFooter } from "./modal";
import { NewScheduleButton } from "./product-schedule";
import { PRODUCT_STATUS, StatusSelo } from "./status-selo";
import { useAdminAction } from "./use-admin-action";

const TAB =
  "nav-aba -mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-2.5 text-hint text-gray-600 transition-colors hover:text-gray-900";

const SETTINGS = [
  { slug: "general", label: "Geral" },
  { slug: "product-page", label: "Página do produto" },
  { slug: "lesson-page", label: "Página da aula" },
  { slug: "terms", label: "Termo de aceite" },
] as const;

/**
 * Cabeçalho do produto: voltar, nome editável, formato, ações do topo,
 * abas Aulas · Conteúdo programado · Configurações ▾ e, na aba Aulas, status + Excluir.
 * Provas/Relatórios/Certificado não existem aqui. O editor de aula tem cabeçalho próprio.
 */
export function ProductTabs({ product, hasSchedule }: { product: AdminProductTree["product"]; hasSchedule: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { pending, error, run } = useAdminAction();
  const [dialog, setDialog] = useState<"newModule" | "trash" | null>(null);
  const base = `/dashboard/content/product/${product.id}`;
  const onLessons = pathname === base;
  const onSchedule = pathname === `${base}/schedule`;
  const currentSetting = SETTINGS.find((s) => pathname === `${base}/${s.slug}`);
  // Telas com cabeçalho "Voltar para as aulas" + h1 da tela + nome do produto (04–08).
  const subpage = currentSetting ?? (onSchedule ? { slug: "schedule", label: "Conteúdo programado" } : null);

  if (pathname.startsWith(`${base}/lesson/`)) return null;

  const close = () => setDialog(null);
  const statusAndDelete = (
    <>
      <StatusSelo value={product.status} options={PRODUCT_STATUS} onChange={(status) => run(setProductStatusAction, { id: product.id, status })} />
      <Button variant="dangerGhost" onClick={() => setDialog("trash")}>
        <TrashIcon className="h-4 w-4" />
        Excluir
      </Button>
    </>
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            {subpage ? (
              // Telas de configurações (04–07): "Voltar para as aulas", h1 = tela, p = nome do produto.
              <>
                <div data-backlink="">
                  <Link href={base} className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
                    <ArrowLeftIcon className="h-3.5 w-3.5" />
                    Voltar para as aulas
                  </Link>
                </div>
                <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">{subpage.label}</h1>
                <p className="mt-1 text-sm text-gray-500">{product.name}</p>
              </>
            ) : (
              <>
                <div data-backlink="">
                  <Link
                    href="/dashboard/content/products"
                    className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600"
                  >
                    <ArrowLeftIcon className="h-3.5 w-3.5" />
                    Voltar para Produtos
                  </Link>
                </div>
                <div className="py-1.5">
                  <InlineName
                    label="Nome do produto"
                    value={product.name}
                    textClassName="text-xl font-semibold text-gray-900"
                    onSave={(name) => run(renameProductAction, { id: product.id, name })}
                  />
                </div>
                <div className="mt-1 text-sm text-gray-500">Cursos</div>
              </>
            )}
          </div>
          {onSchedule && !hasSchedule ? (
            <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
              <NewScheduleButton productId={product.id} className="flex-shrink-0" />
            </div>
          ) : null}
          {onLessons ? (
            <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
              <div className="w-auto">
                <Dropdown
                  trigger={(p) => (
                    <button
                      type="button"
                      {...p}
                      aria-label="Mais ações"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                    >
                      <DotsIcon className="h-4 w-4" />
                    </button>
                  )}
                >
                  <MenuItem disabled={pending} icon={<CheckCircleIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => run(publishAllAction, { productId: product.id })}>
                    Publicar tudo
                  </MenuItem>
                  <MenuItem
                    disabled={pending}
                    icon={<CopyIcon className="h-4 w-4 flex-shrink-0" />}
                    onSelect={() =>
                      run(duplicateProductAction, { id: product.id }, { onOk: (res) => res.id && router.push(`/dashboard/content/product/${res.id}`) })
                    }
                  >
                    Duplicar
                  </MenuItem>
                </Dropdown>
              </div>
              <Button className="flex-shrink-0" onClick={() => setDialog("newModule")}>
                <PlusIcon className="h-4 w-4" />
                Novo módulo
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <nav data-subnav="" className="relative z-30 my-6 border-b border-gray-200 has-[[aria-expanded=true]]:z-[31] max-sm:mb-4 max-sm:border-b-0">
        <div className="flex min-h-11 flex-wrap items-end justify-start gap-x-1">
          <div className="min-w-0 flex-1">
            <div className="relative">
              <div className="subnav-pista flex flex-wrap items-end gap-x-1 max-sm:flex-nowrap max-sm:gap-x-1.5 max-sm:overflow-x-auto max-sm:overscroll-x-contain">
                <Link href={base} data-nav="sub" data-current={onLessons ? "" : undefined} aria-current={onLessons ? "page" : undefined} className={TAB}>
                  <PlayListIcon className="nav-icone h-4 w-4 flex-shrink-0" />
                  Aulas
                </Link>
                <Link
                  href={`${base}/schedule`}
                  data-nav="sub"
                  data-current={onSchedule ? "" : undefined}
                  aria-current={onSchedule ? "page" : undefined}
                  className={TAB}
                >
                  <CalendarClockIcon className="nav-icone h-4 w-4 flex-shrink-0" />
                  Conteúdo programado
                </Link>
                <div className="relative flex-shrink-0">
                  <Dropdown
                    align="start"
                    trigger={(p) => (
                      <button type="button" {...p} data-nav="sub" data-current={currentSetting ? "" : undefined} className={`${TAB} cursor-pointer`}>
                        <SettingsIcon className="nav-icone h-4 w-4 flex-shrink-0" />
                        Configurações
                        <ChevronDownIcon
                          className={`h-3 w-3 flex-shrink-0 text-gray-400 transition-transform duration-200${p["aria-expanded"] ? " rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  >
                    {SETTINGS.map((s) => (
                      <MenuLink key={s.slug} href={`${base}/${s.slug}`} active={currentSetting?.slug === s.slug}>
                        {s.label}
                      </MenuLink>
                    ))}
                  </Dropdown>
                </div>
              </div>
            </div>
          </div>
          {onLessons ? (
            <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
              {statusAndDelete}
            </div>
          ) : null}
        </div>
      </nav>

      {onLessons ? (
        <div data-toolbar="" className="mb-6 flex flex-wrap items-center gap-2 lg:hidden">
          {statusAndDelete}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      <Modal open={dialog === "newModule"} onClose={close} title="Novo módulo">
        {dialog === "newModule" ? (
          <form action={(fd) => run(createModuleAction, fd, { onOk: close })} className="space-y-6">
            <input type="hidden" name="productId" value={product.id} />
            <div>
              <Label htmlFor="module-title">Título do módulo</Label>
              <Input id="module-title" name="title" required maxLength={200} autoFocus />
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Criar módulo
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={dialog === "trash"}
        onClose={close}
        title="Excluir produto?"
        description={`"${product.name}" vai para a Lixeira da tela Produtos. Você pode restaurar depois.`}
      >
        <ModalFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => run(trashProductAndLeaveAction, { id: product.id })}
          >
            <TrashIcon className="h-4 w-4" />
            Excluir
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
