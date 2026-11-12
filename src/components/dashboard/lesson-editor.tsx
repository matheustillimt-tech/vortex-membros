"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminLessonEdit } from "@/lib/admin/content";
import { setLessonStatusAction } from "@/app/dashboard/content/product/[id]/actions";
import {
  createSiblingLessonAction,
  saveLessonAction,
  trashLessonAndLeaveAction,
} from "@/app/dashboard/content/product/[id]/lesson/[lessonId]/actions";
import { BlockEditor, type BlockEditorHandle } from "./block-editor";
import { Button, buttonClass } from "./button";
import { lessonThumbnailUrl, videoPosterUrl } from "@/lib/content/video";
import { ArrowLeftIcon, CheckIcon, EyeIcon, FileTextIcon, PlayListIcon, PlusIcon, RadioIcon, SaveIcon, TrashIcon } from "./icons";
import { useSaveState } from "./save-bar";
import { ImageUpload } from "./image-upload";
import { INPUT_CLASS } from "./input";
import { Modal, ModalFooter } from "./modal";
import { PRODUCT_STATUS, StatusSelo } from "./status-selo";
import { useAdminAction } from "./use-admin-action";

const SEG_ON =
  "flex h-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-hint font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 bg-brand-50 text-brand-700";
const SEG_OFF =
  "flex h-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-hint font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 text-gray-400 hover:text-gray-700";

/** Espera depois da última alteração antes do salvamento automático. */
const AUTOSAVE_MS = 1500;

/**
 * Editor de aula. "Prova" e "Vincular a uma aula existente" ficam de fora.
 * Salva sozinho 1,5s depois da última alteração, pelo botão Salvar ou ⌘/Ctrl+S;
 * "Voltar para as aulas" salva antes de sair. Link da Panda colado sem miniatura → usa a capa do vídeo.
 */
export function LessonEditor({ productId, lesson }: { productId: number; lesson: AdminLessonEdit }) {
  // Cada vez que a aula é aberta (link, "Voltar", menu) o editor começa do zero com o que está
  // gravado no banco. Sem isso o Next reaproveita a tela antiga, guardada escondida, e o texto
  // aparecia desatualizado até dar F5.
  const { bfcacheId } = useRouter();
  return <LessonEditorBody key={`${lesson.id}:${bfcacheId}`} productId={productId} lesson={lesson} />;
}

function LessonEditorBody({ productId, lesson }: { productId: number; lesson: AdminLessonEdit }) {
  const router = useRouter();
  const { pending, error, run } = useAdminAction();
  const form = useRef<HTMLFormElement>(null);
  const editor = useRef<BlockEditorHandle>(null);
  const [format, setFormat] = useState<AdminLessonEdit["format"]>(lesson.format);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [thumb, setThumb] = useState(lessonThumbnailUrl(lesson.thumbnailUrl, lesson.videoUrl));
  const [thumbKey, setThumbKey] = useState(0);
  // Conta as alterações: o salvamento automático espera a última, e um salvamento que terminou
  // com alterações novas no meio não marca a aula como salva.
  const [rev, setRev] = useState(0);
  const revRef = useRef(0);
  const { dirty, saved, markDirty, markSaved } = useSaveState(async () => {
    await save();
  });
  const back = `/dashboard/content/product/${productId}`;

  function touch() {
    revRef.current += 1;
    setRev(revRef.current);
    markDirty();
  }

  async function save(): Promise<boolean> {
    if (!form.current) return false;
    const startRev = revRef.current;
    const fd = new FormData(form.current);
    const data = await editor.current?.save();
    if (data) fd.set("blocks", JSON.stringify(data)); // editor não carregou → conteúdo fica como está
    return new Promise((resolve) =>
      run(saveLessonAction, fd, {
        onOk: () => {
          if (data) editor.current?.markSaved(data);
          if (revRef.current === startRev) markSaved();
          resolve(true);
        },
        onError: () => resolve(false),
      }),
    );
  }

  useEffect(() => {
    if (rev === 0) return;
    const t = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a contagem de alterações dispara
  }, [rev]);

  const saveButton = (
    <Button variant="ghost" disabled={pending || !dirty} onClick={() => void save()} aria-keyshortcuts="Meta+S Control+S">
      {saved && !dirty && !pending ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}
      {pending ? "Salvando…" : saved && !dirty ? "Salvo" : "Salvar"}
    </Button>
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="">
              <Link
                href={back}
                onClick={async (e) => {
                  if (!dirty) return;
                  e.preventDefault();
                  if (await save()) router.push(back);
                }}
                className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                Voltar para as aulas
              </Link>
            </div>
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">{lesson.title}</h1>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <div className="w-auto">
              <a href={`/area/conteudo/aula/${lesson.id}`} target="_blank" rel="noopener" className={buttonClass("outline", "flex-shrink-0")}>
                <EyeIcon className="h-4 w-4" />
                Pré-visualizar
              </a>
            </div>
            <div>
              <Button
                variant="brand"
                className="flex-shrink-0"
                disabled={pending}
                onClick={() =>
                  run(createSiblingLessonAction, { productId, id: lesson.id }, { onOk: (res) => res.id && router.push(`${back}/lesson/${res.id}`) })
                }
              >
                <PlusIcon className="h-4 w-4" />
                Criar nova aula
              </Button>
            </div>
          </div>
        </div>
      </div>

      <nav data-subnav="" className="relative z-30 my-6 border-b border-gray-200 has-[[aria-expanded=true]]:z-[31] max-sm:mb-4 max-sm:border-b-0">
        <div className="flex min-h-11 flex-wrap items-end justify-start gap-x-1">
          <div className="min-w-0 flex-1">
            <div className="relative">
              <div className="subnav-pista flex flex-wrap items-end gap-x-1 max-sm:flex-nowrap max-sm:gap-x-1.5 max-sm:overflow-x-auto max-sm:overscroll-x-contain">
                <Link
                  href={`${back}/lesson/${lesson.id}`}
                  data-nav="sub"
                  data-current=""
                  aria-current="page"
                  className="nav-aba -mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-2.5 text-hint text-gray-600 transition-colors hover:text-gray-900"
                >
                  <PlayListIcon className="nav-icone h-4 w-4 flex-shrink-0" />
                  Aula
                </Link>
              </div>
            </div>
          </div>
          <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
            {saveButton}
            <StatusSelo value={lesson.status} options={PRODUCT_STATUS} onChange={(status) => run(setLessonStatusAction, { id: lesson.id, status })} />
            <Button variant="dangerGhost" onClick={() => setConfirmTrash(true)}>
              <TrashIcon className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        </div>
      </nav>
      <div data-toolbar="" className="mb-6 flex flex-wrap items-center gap-2 lg:hidden">
        {saveButton}
        <StatusSelo value={lesson.status} options={PRODUCT_STATUS} onChange={(status) => run(setLessonStatusAction, { id: lesson.id, status })} />
        <Button variant="dangerGhost" onClick={() => setConfirmTrash(true)}>
          <TrashIcon className="h-4 w-4" />
          Excluir
        </Button>
      </div>

      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onChange={touch}
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="id" value={lesson.id} />
        <input type="hidden" name="format" value={format} />
        <fieldset className="m-0 grid grid-cols-1 gap-4 border-0 p-0 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="min-w-0 rounded-lg border border-gray-200 bg-white">
              <div className="painel-linhas">
                <div className="p-5">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <label htmlFor="titulo" className="text-sm text-gray-700">
                        Título <span className="text-red-500">*</span>
                      </label>
                    </div>
                    <input type="text" name="title" id="titulo" required maxLength={200} defaultValue={lesson.title} className={INPUT_CLASS} />
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-2 flex items-center gap-1.5">
                    <label htmlFor="video" className="text-sm text-gray-700">
                      Vídeo
                    </label>
                  </div>
                  <div className="min-w-0">
                    <input
                      type="text"
                      name="videoUrl"
                      id="video"
                      placeholder="Insira o link completo"
                      defaultValue={lesson.videoUrl ?? ""}
                      onChange={(e) => {
                        const poster = videoPosterUrl(e.target.value);
                        if (!thumb && poster) {
                          setThumb(poster);
                          setThumbKey((k) => k + 1);
                        }
                      }}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
              </div>
            </div>
            <BlockEditor
              ref={editor}
              initialBlocks={lesson.contentBlocks}
              initialHtml={lesson.contentHtml}
              placeholder="Escreva o conteúdo da aula… (use / para blocos)"
              onChange={touch}
            />
          </div>

          <div className="space-y-4">
            <div className="min-w-0 rounded-lg border border-gray-200 bg-white">
              <div className="painel-linhas">
                <div className="p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <span className="text-sm text-gray-700">Formato</span>
                      <div className="ml-auto inline-flex h-[38px] items-center rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Formato">
                        <button
                          type="button"
                          aria-pressed={format === "standard"}
                          onClick={() => {
                            setFormat("standard");
                            touch();
                          }}
                          className={format === "standard" ? SEG_ON : SEG_OFF}
                        >
                          <FileTextIcon className="h-4 w-4" />
                          Padrão
                        </button>
                        <button
                          type="button"
                          aria-pressed={format === "live"}
                          onClick={() => {
                            setFormat("live");
                            touch();
                          }}
                          className={format === "live" ? SEG_ON : SEG_OFF}
                        >
                          <RadioIcon className="h-4 w-4" />
                          Live
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {format === "live" ? (
                  <div className="p-5">
                    <div className="mb-2 flex items-center gap-1.5">
                      <label htmlFor="live" className="text-sm text-gray-700">
                        Link da live
                      </label>
                    </div>
                    <div className="min-w-0">
                      <input
                        type="url"
                        name="liveUrl"
                        id="live"
                        placeholder="https://"
                        defaultValue={lesson.liveUrl ?? ""}
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="p-5">
                  <div className="mb-2 flex items-center gap-1.5">
                    <label htmlFor="resumo" className="text-sm text-gray-700">
                      Resumo
                    </label>
                  </div>
                  <div className="min-w-0">
                    <div className="w-full">
                      <textarea
                        rows={4}
                        id="resumo"
                        name="summary"
                        maxLength={2000}
                        defaultValue={lesson.summary ?? ""}
                        placeholder="Breve descrição da aula…"
                        className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-hint text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                      />
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-sm text-gray-700">Miniatura</span>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <ImageUpload
                      key={thumbKey}
                      name="thumbnailUrl"
                      defaultValue={thumb}
                      boxClassName="w-44 h-28"
                      onChange={(url) => {
                        setThumb(url);
                        touch();
                      }}
                    />
                    <p className="text-hint text-gray-400">JPG, PNG, WebP ou GIF até 2 MB</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </fieldset>
      </form>

      <Modal
        open={confirmTrash}
        onClose={() => setConfirmTrash(false)}
        title="Excluir aula?"
        description={`"${lesson.title}" vai para a Lixeira do produto. Você pode restaurar depois.`}
      >
        <ModalFooter>
          <Button variant="outline" onClick={() => setConfirmTrash(false)}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => run(trashLessonAndLeaveAction, { productId, id: lesson.id })}>
            <TrashIcon className="h-4 w-4" />
            Excluir
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
