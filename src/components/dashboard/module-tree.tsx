"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminLessonRow, AdminModuleNode } from "@/lib/admin/content";
import {
  createLessonAction,
  moveLessonAction,
  renameLessonAction,
  renameModuleAction,
  reorderTreeAction,
  restoreLessonAction,
  restoreModuleAction,
  setLessonStatusAction,
  setLessonThumbnailAction,
  setModuleCoverAction,
  setModuleStatusAction,
  trashLessonAction,
  trashModuleAction,
} from "@/app/dashboard/content/product/[id]/actions";
import { Button, buttonClass } from "./button";
import { Dropdown, MenuItem, MenuSeparator } from "./dropdown";
import {
  ArrowRightIcon,
  CameraIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  DotsIcon,
  GripIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "./icons";
import { ImageModal } from "./image-modal";
import { InlineName } from "./inline-name";
import { Input, Label } from "./input";
import { Modal, ModalFooter } from "./modal";
import { SortableList, type SortableMove } from "./sortable-list";
import { PRODUCT_STATUS, StatusSelo, type StatusOption } from "./status-selo";
import { TrashModal } from "./trash-modal";
import { useAdminAction } from "./use-admin-action";

type TrashRow = { id: number; name: string; deletedAt: string; detail?: string };
type Dialog =
  | { type: "newLesson"; module: AdminModuleNode }
  | { type: "moduleImage"; module: AdminModuleNode }
  | { type: "lessonImage"; lesson: AdminLessonRow }
  | { type: "trash"; kind: "module" | "lesson"; id: number; name: string }
  | { type: "lixeira" }
  | null;

const STATUS: StatusOption<"published" | "hidden">[] = PRODUCT_STATUS;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ORDER_BTN = "btn-icone !h-4 !w-5 !rounded !p-0 !text-gray-300 hover:!text-gray-600 disabled:!opacity-30";

function moveIn<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Miniatura 44px com overlay de câmera (thumb). */
function Thumb({ url, alt, onClick, label }: { url: string | null; alt: string; onClick: () => void; label: string }) {
  return (
    <span className="tooltip flex-shrink-0">
      <button type="button" aria-label={label} onClick={onClick} className="group/thumb relative block h-11 w-11 overflow-hidden rounded-lg">
        <div className="relative h-11 w-11 overflow-hidden rounded-lg bg-gray-200/60">
          {url ? (
            <div className="absolute inset-0">
              <img src={url} alt={alt} loading="lazy" decoding="async" width={88} height={88} className="relative h-full w-full object-cover transition-opacity duration-500" />
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
  );
}

/** Aba Aulas do produto: módulos recolhíveis com aulas, arrastar e lixeira. */
export function ModuleTree({
  productId,
  modules: serverModules,
  trash,
}: {
  productId: number;
  modules: AdminModuleNode[];
  trash: { modules: TrashRow[]; lessons: TrashRow[] };
}) {
  const router = useRouter();
  // Estado local para a ordem otimista; volta a seguir o servidor quando a página é revalidada.
  const [modules, setModules] = useState(serverModules);
  const [synced, setSynced] = useState(serverModules);
  if (synced !== serverModules) {
    setSynced(serverModules);
    setModules(serverModules);
  }
  // Os módulos começam abertos: guarda só os que foram recolhidos.
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const { pending, error, run } = useAdminAction();
  const close = () => setDialog(null);
  const revert = () => setModules(serverModules);

  const anyOpen = modules.some((m) => !closed.has(m.id));
  const toggle = (id: number) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function reorderModules(from: number, to: number) {
    if (pending || to < 0 || to >= modules.length) return;
    const next = moveIn(modules, from, to);
    setModules(next);
    run(reorderTreeAction, { kind: "module", parentId: productId, ids: next.map((m) => m.id).join(",") }, { onError: revert });
  }

  function onMoveLesson(m: SortableMove) {
    if (pending || m.fromParent === null || m.toParent === null) return;
    const source = modules.find((x) => x.id === m.fromParent);
    const lesson = source?.lessons.find((l) => l.id === m.id);
    if (!source || !lesson) return;
    if (m.fromParent === m.toParent) {
      const next = moveIn(source.lessons, m.oldIndex, m.newIndex);
      setModules(modules.map((x) => (x.id === source.id ? { ...x, lessons: next } : x)));
      run(reorderTreeAction, { kind: "lesson", parentId: source.id, ids: next.map((l) => l.id).join(",") }, { onError: revert });
      return;
    }
    const to = m.toParent;
    setModules(
      modules.map((x) => {
        if (x.id === source.id) return { ...x, lessons: x.lessons.filter((l) => l.id !== m.id) };
        if (x.id === to) {
          const lessons = x.lessons.slice();
          lessons.splice(m.newIndex, 0, { ...lesson, moduleId: to });
          return { ...x, lessons };
        }
        return x;
      }),
    );
    run(moveLessonAction, { id: m.id, moduleId: to, position: m.newIndex }, { onError: revert });
  }

  const lessonHref = (id: number) => `/dashboard/content/product/${productId}/lesson/${id}`;
  const entries = [
    ...trash.modules.map((t) => ({
      key: `m-${t.id}`,
      name: t.name,
      kindLabel: "Módulo",
      deletedAt: t.deletedAt,
      onRestore: () => run(restoreModuleAction, { id: t.id }),
    })),
    ...trash.lessons.map((t) => ({
      key: `l-${t.id}`,
      name: t.name,
      kindLabel: "Aula",
      detail: t.detail,
      deletedAt: t.deletedAt,
      onRestore: () => run(restoreLessonAction, { id: t.id }),
    })),
  ];

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h2 className="text-lg font-semibold text-gray-900">Módulos</h2>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <div className="flex-shrink-0">
              <Button variant="outline" disabled={modules.length === 0} onClick={() => setClosed(anyOpen ? new Set(modules.map((m) => m.id)) : new Set())}>
                <span className="inline-flex items-center gap-2">
                  {anyOpen ? <ChevronsDownUpIcon className="h-4 w-4" /> : <ChevronsUpDownIcon className="h-4 w-4" />}
                  {anyOpen ? "Recolher tudo" : "Expandir tudo"}
                </span>
              </Button>
            </div>
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

      {modules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Nenhum módulo ainda</p>
          <p className="mt-1 text-hint text-gray-500">Use &quot;Novo módulo&quot; para começar.</p>
        </div>
      ) : null}

      <div className={`transition-opacity${pending ? " opacity-60" : ""}`}>
        <SortableList
          group={`secao-${productId}`}
          type="secao"
          parentId={productId}
          disabled={pending}
          onMove={(m) => reorderModules(m.oldIndex, m.newIndex)}
          className="space-y-6"
        >
          {modules.map((mod, i) => {
            const isOpen = !closed.has(mod.id);
            const selo = <StatusSelo value={mod.status} options={STATUS} onChange={(status) => run(setModuleStatusAction, { id: mod.id, status })} />;
            return (
              <div key={mod.id} data-id={mod.id}>
                <div className="rounded-lg border border-gray-200 bg-white [[data-nested]_&]:border-gray-100">
                  <div
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button,a,input,[role=menu]")) return;
                      toggle(mod.id);
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-t-[calc(var(--radius-lg)-1px)] bg-gray-50/70 px-4 py-4 transition-colors hover:bg-gray-100/60${isOpen ? "" : " rounded-b-[calc(var(--radius-lg)-1px)]"}`}
                  >
                    <span className="flex flex-shrink-0 items-center gap-1">
                      <button type="button" className={`handle alca-arrastar${pending ? " alca-arrastar--off" : ""}`} aria-label="Arrastar para reordenar">
                        <GripIcon className="h-4 w-4" />
                      </button>
                      <span className="hidden flex-col sm:flex">
                        <span className="tooltip">
                          <button type="button" aria-label="Mover para cima" disabled={i === 0} onClick={() => reorderModules(i, i - 1)} className={ORDER_BTN}>
                            <ChevronUpIcon className="h-3.5 w-3.5" />
                          </button>
                        </span>
                        <span className="tooltip">
                          <button
                            type="button"
                            aria-label="Mover para baixo"
                            disabled={i === modules.length - 1}
                            onClick={() => reorderModules(i, i + 1)}
                            className={ORDER_BTN}
                          >
                            <ChevronDownIcon className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </span>
                    </span>
                    <span className="hidden sm:flex">
                      <Thumb url={mod.coverUrl} alt={mod.title} label="Editar imagem do módulo" onClick={() => setDialog({ type: "moduleImage", module: mod })} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <InlineName label="Título do módulo" value={mod.title} onSave={(title) => run(renameModuleAction, { id: mod.id, title })} />
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-badge text-gray-400">
                        <span>{plural(mod.lessons.length, "aula", "aulas")}</span>
                        <span className="sm:hidden">{selo}</span>
                      </div>
                    </div>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <span className="hidden items-center sm:flex">{selo}</span>
                      <Dropdown
                        trigger={(p) => (
                          <button type="button" {...p} aria-label="Ações do módulo" data-row-menu-trigger="modulo" className="btn-icone">
                            <DotsIcon className="h-4 w-4" />
                          </button>
                        )}
                      >
                        <MenuItem disabled={pending} icon={<PlusIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "newLesson", module: mod })}>
                          Adicionar aula
                        </MenuItem>
                        <MenuItem disabled={pending} icon={<PencilIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "moduleImage", module: mod })}>
                          Editar imagem
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          disabled={pending}
                          tone="danger"
                          icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />}
                          onSelect={() => setDialog({ type: "trash", kind: "module", id: mod.id, name: mod.title })}
                        >
                          Excluir
                        </MenuItem>
                      </Dropdown>
                    </span>
                    <button
                      type="button"
                      aria-label={isOpen ? "Recolher módulo" : "Expandir módulo"}
                      aria-expanded={isOpen}
                      onClick={() => toggle(mod.id)}
                      className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-400 outline-none transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-brand-500/40"
                    >
                      <ChevronRightIcon className={`h-4 w-4 transition-transform duration-200${isOpen ? " rotate-90" : ""}`} />
                    </button>
                  </div>
                  <div className="revelar" data-aberto={isOpen ? "true" : undefined}>
                    <div>
                      <div className="rounded-b-[calc(var(--radius-lg)-1px)] border-t border-gray-100 bg-white">
                        <SortableList
                          group={`aula-${productId}`}
                          type="aula"
                          parentId={mod.id}
                          nested
                          disabled={pending}
                          onMove={onMoveLesson}
                          className="divide-y divide-gray-100 px-4"
                        >
                          {mod.lessons.map((l) => (
                            <div
                              key={l.id}
                              data-id={l.id}
                              data-linha-abrir=""
                              className="-mx-4 linha-lista cursor-pointer"
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest("button,a,input,[role=menu]")) return;
                                router.push(lessonHref(l.id));
                              }}
                            >
                              <button type="button" className="handle alca-arrastar" aria-label="Arrastar para reordenar">
                                <GripIcon className="h-4 w-4" />
                              </button>
                              <Thumb url={l.thumbnailUrl} alt="" label="Editar imagem da aula" onClick={() => setDialog({ type: "lessonImage", lesson: l })} />
                              <div className="linha-info gap-x-0">
                                <div className="w-full min-w-0 sm:col-start-1">
                                  <InlineName label="Título da aula" value={l.title} onSave={(title) => run(renameLessonAction, { id: l.id, title })} />
                                </div>
                                <span className="inline-flex items-center sm:col-start-2 sm:row-start-1">
                                  <StatusSelo value={l.status} options={STATUS} onChange={(status) => run(setLessonStatusAction, { id: l.id, status })} />
                                </span>
                              </div>
                              <Dropdown
                                trigger={(p) => (
                                  <button type="button" {...p} aria-label="Ações da aula" data-row-menu-trigger="aula" className="btn-icone">
                                    <DotsIcon className="h-4 w-4" />
                                  </button>
                                )}
                              >
                                <MenuItem icon={<ArrowRightIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => router.push(lessonHref(l.id))}>
                                  Abrir
                                </MenuItem>
                                <MenuItem disabled={pending} icon={<PencilIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "lessonImage", lesson: l })}>
                                  Editar imagem
                                </MenuItem>
                                <MenuSeparator />
                                <MenuItem
                                  disabled={pending}
                                  tone="danger"
                                  icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />}
                                  onSelect={() => setDialog({ type: "trash", kind: "lesson", id: l.id, name: l.title })}
                                >
                                  Excluir
                                </MenuItem>
                              </Dropdown>
                              <span className="tooltip">
                                <Link href={lessonHref(l.id)} prefetch={false} aria-label="Abrir aula" className="btn-icone btn-abrir" data-abrir="">
                                  <ArrowRightIcon className="h-4 w-4" />
                                </Link>
                              </span>
                            </div>
                          ))}
                        </SortableList>
                        {mod.lessons.length === 0 ? (
                          <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-400">Nenhuma aula neste módulo</div>
                        ) : null}
                        <div className="flex justify-end rounded-b-[calc(var(--radius-lg)-1px)] border-t border-gray-100 bg-gray-50/70 px-4 py-3">
                          <button type="button" onClick={() => setDialog({ type: "newLesson", module: mod })} className={buttonClass("brand")}>
                            <PlusIcon className="h-4 w-4" />
                            Adicionar aula
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </SortableList>
      </div>

      {/* ---------- modais ---------- */}

      <Modal
        open={dialog?.type === "newLesson"}
        onClose={close}
        title="Adicionar aula"
        description={dialog?.type === "newLesson" ? `No módulo "${dialog.module.title}"` : undefined}
      >
        {dialog?.type === "newLesson" ? (
          <form
            action={(fd) =>
              run(createLessonAction, fd, {
                onOk: () => {
                  setClosed((prev) => {
                    const next = new Set(prev);
                    next.delete(dialog.module.id);
                    return next;
                  });
                  close();
                },
              })
            }
            className="space-y-6"
          >
            <input type="hidden" name="moduleId" value={dialog.module.id} />
            <div>
              <Label htmlFor="lesson-title">Título da aula</Label>
              <Input id="lesson-title" name="title" required maxLength={200} autoFocus />
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Adicionar aula
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>

      <ImageModal
        open={dialog?.type === "moduleImage"}
        onClose={close}
        title="Imagem do módulo"
        id={dialog?.type === "moduleImage" ? dialog.module.id : null}
        field="coverUrl"
        value={dialog?.type === "moduleImage" ? dialog.module.coverUrl : null}
        pending={pending}
        onSubmit={(fd) => run(setModuleCoverAction, fd, { onOk: close })}
      />
      <ImageModal
        open={dialog?.type === "lessonImage"}
        onClose={close}
        title="Imagem da aula"
        id={dialog?.type === "lessonImage" ? dialog.lesson.id : null}
        field="thumbnailUrl"
        value={dialog?.type === "lessonImage" ? dialog.lesson.thumbnailUrl : null}
        pending={pending}
        onSubmit={(fd) => run(setLessonThumbnailAction, fd, { onOk: close })}
      />

      <Modal
        open={dialog?.type === "trash"}
        onClose={close}
        title={dialog?.type === "trash" && dialog.kind === "module" ? "Excluir módulo?" : "Excluir aula?"}
        description={
          dialog?.type === "trash"
            ? `"${dialog.name}" vai para a Lixeira${dialog.kind === "module" ? " com as aulas dele" : ""}. Você pode restaurar depois.`
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
              onClick={() => run(dialog.kind === "module" ? trashModuleAction : trashLessonAction, { id: dialog.id }, { onOk: close })}
            >
              <TrashIcon className="h-4 w-4" />
              Excluir
            </Button>
          </ModalFooter>
        ) : null}
      </Modal>

      <TrashModal
        open={dialog?.type === "lixeira"}
        onClose={close}
        description="Módulos e aulas excluídos deste produto."
        entries={entries}
        pending={pending}
      />
    </div>
  );
}
