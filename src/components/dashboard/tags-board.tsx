"use client";

import { useId, useMemo, useRef, useState } from "react";
import { createTagAction, deleteTagAction, renameTagAction } from "@/app/dashboard/students/tags/actions";
import { Button, buttonClass } from "./button";
import { CalendarClockIcon, PackageCheckIcon, PencilIcon, PlusIcon, SaveIcon, SearchIcon, TagIcon, TrashIcon, UsersIcon, XIcon } from "./icons";
import { INPUT_CLASS } from "./input";
import { ConfirmDialog, DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { StudentsSubnav } from "./students-subnav";
import { useAdminAction } from "./use-admin-action";

export type TagRow = { id: number; name: string; students: number };

const nf = new Intl.NumberFormat("pt-BR");
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function HelpCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** Nome da tag editável no lugar. Enter/blur salva; Esc cancela. */
function TagName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) onSave(next);
    else setDraft(name);
  };
  return (
    <span className="-mx-1 block w-fit min-w-0 max-w-full">
      {editing ? (
        <input
          type="text"
          autoFocus
          aria-label={`Renomear tag ${name}`}
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              done.current = true;
              setDraft(name);
              setEditing(false);
            }
          }}
          className="edicao-inline-input text-sm font-medium text-gray-900 ring-2 ring-brand-500/15"
        />
      ) : (
        <button
          type="button"
          title={name}
          aria-label={`Renomear tag ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            done.current = false;
            setDraft(name);
            setEditing(true);
          }}
          className="edicao-inline-botao group block w-fit max-w-full"
        >
          <span className="block w-fit max-w-full truncate text-sm font-medium text-gray-900">{name}</span>
        </button>
      )}
    </span>
  );
}

/** Modal "tag-form": título "Adicionando Tag" também ao editar. */
function TagFormDialog({ open, tag, onClose }: { open: boolean; tag: TagRow | null; onClose: () => void }) {
  const titleId = useId();
  const formId = useId();
  const { pending, error, setError, run } = useAdminAction();
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <PanelDialog open={open} onClose={close} labelledBy={titleId} widthClass="sm:max-w-md">
      <DialogHeader id={titleId} title="Adicionando Tag" onClose={close} />
      <div className="">
        {error ? (
          <div role="alert" className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
            {error}
          </div>
        ) : null}
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("tagNome") ?? "");
            if (tag) run(renameTagAction, { id: tag.id, name }, { onOk: close });
            else run(createTagAction, { name }, { onOk: close });
          }}
        >
          <div className="min-w-0">
            <div className="painel-linhas">
              <div className="p-5">
                <div className="mb-2 flex items-center gap-1.5">
                  <label htmlFor="tagNome" className="text-sm text-gray-700">
                    Nome <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="min-w-0">
                  <input
                    type="text"
                    name="tagNome"
                    id="tagNome"
                    autoFocus
                    required
                    maxLength={60}
                    placeholder="Ex: Turma A"
                    defaultValue={tag?.name ?? ""}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="flex gap-2">
          <button type="button" onClick={close} className={buttonClass("outline", "grow justify-center")}>
            Cancelar
          </button>
          <button type="submit" form={formId} disabled={pending} className={buttonClass("primary", "grow justify-center")}>
            {pending ? <Spinner /> : <SaveIcon className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}

const ITEMS = [
  {
    title: "Conteúdo programado",
    lines: ["Você agenda quando cada aula será", "liberada para os alunos desta tag."],
    Icon: CalendarClockIcon,
    box: "border-emerald-200/80 bg-emerald-50",
    icon: "text-emerald-500",
  },
  {
    title: "Entregas",
    lines: ["Você escolhe quais tags serão aplicadas", "aos alunos de cada entrega."],
    Icon: PackageCheckIcon,
    box: "border-amber-200/80 bg-amber-50",
    icon: "text-amber-500",
  },
  {
    title: "Alunos",
    lines: ["Ao receber uma tag, o aluno passa a receber", "o conteúdo programado nela."],
    Icon: UsersIcon,
    box: "border-blue-200/80 bg-blue-50",
    icon: "text-blue-500",
  },
] as const;

/** Modal "Como funcionam as Tags?": "Tags" ligada aos três cards. */
function HowItWorksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  return (
    <PanelDialog open={open} onClose={onClose} labelledBy={titleId} widthClass="sm:max-w-3xl">
      <DialogHeader id={titleId} title="Como funcionam as Tags?" onClose={onClose} />
      <div className="p-5">
        <div className="relative flex items-stretch gap-0">
          <div className="z-10 flex flex-shrink-0 items-center justify-end gap-3 pr-1">
            <div className="text-right">
              <span className="block text-sm font-semibold text-violet-700">Tags</span>
              <p className="mt-0.5 text-[11px] leading-normal text-gray-400">
                Conectam seu conteúdo programado
                <br />
                às entregas e aos alunos.
              </p>
            </div>
            <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-2 border-violet-300 bg-violet-100 shadow-sm shadow-violet-200/50">
              <span className="absolute inset-0 animate-ping rounded-full bg-violet-300/40" style={{ animationDuration: "2.5s" }} />
              <TagIcon className="h-6 w-6 text-violet-600" />
            </div>
          </div>
          <svg className="flex-shrink-0 overflow-visible" style={{ width: 100 }} fill="none" viewBox="0 0 100 300" preserveAspectRatio="none" aria-hidden>
            {[50, 150, 250].map((y) => (
              <path
                key={y}
                d={`M0 150 C 50 150, 50 ${y}, 100 ${y}`}
                stroke="currentColor"
                className="text-violet-200"
                strokeWidth={2}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="flex flex-1 flex-col justify-between gap-6 py-1">
            {ITEMS.map(({ title, lines, Icon, box, icon }) => (
              <div key={title} className="tag-item flex items-center gap-3">
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${box}`}>
                  <Icon className={`h-5 w-5 ${icon}`} />
                </div>
                <div>
                  <span className="block text-[13px] font-medium text-gray-700">{title}</span>
                  <p className="mt-0.5 text-[11px] leading-normal text-gray-400">
                    {lines[0]}
                    <br />
                    {lines[1]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PanelDialog>
  );
}

type Dialog = { type: "form"; tag: TagRow | null } | { type: "delete"; tag: TagRow } | { type: "help" } | null;

/** Tags: busca, "Nova Tag", lista ID/TAG/ALUNOS/AÇÕES, renomear no lugar e os três modais. */
export function TagsBoard({ rows }: { rows: TagRow[] }) {
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const { pending, error, setError, run } = useAdminAction();
  const close = () => {
    setError(null);
    setDialog(null);
  };

  const visible = useMemo(() => {
    const term = fold(q.trim());
    return term ? rows.filter((r) => fold(r.name).includes(term)) : rows;
  }, [rows, q]);

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Tags</h1>
            <div className="mt-1 text-sm text-gray-500">
              Organize seus alunos com tags{" "}
              <button
                type="button"
                onClick={() => setDialog({ type: "help" })}
                className="ml-1 inline-flex items-baseline gap-1 align-baseline text-gray-500 underline decoration-dotted underline-offset-2 transition-colors hover:text-gray-700"
              >
                <HelpCircleIcon className="h-3.5 w-3.5 self-center" />
                Como funciona?
              </button>
            </div>
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
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-hint text-gray-900 outline-none placeholder-gray-400"
                    placeholder="Buscar por nome…"
                    aria-label="Buscar por nome…"
                  />
                  {q ? (
                    <button
                      type="button"
                      aria-label="Limpar pesquisa"
                      onClick={() => setQ("")}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-gray-600"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    aria-label="Pesquisar"
                    className="flex h-full w-9 flex-shrink-0 items-center justify-center rounded-r-lg border-l border-gray-200 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                  >
                    <SearchIcon className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
            <Button className="flex-shrink-0" onClick={() => setDialog({ type: "form", tag: null })}>
              <PlusIcon className="h-4 w-4" />
              Nova Tag
            </Button>
          </div>
        </div>
      </div>

      <StudentsSubnav current="/dashboard/students/tags" />

      {error && dialog?.type !== "delete" ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      <div className={`transition-opacity${pending ? " opacity-60" : ""}`}>
        <div role="table" style={{ "--lista-cols": "5rem minmax(0,1fr) 7rem 4.5rem", "--lista-acoes": 2 } as React.CSSProperties} className="lista lista--card">
          <div className="lista-cabecalho-envelope">
            <div role="row" className="lista-cabecalho">
              <div role="columnheader" className="lista-celula lista-th">
                ID
              </div>
              <div role="columnheader" className="lista-celula lista-th">
                Tag
              </div>
              <div role="columnheader" className="lista-celula lista-th">
                Alunos
              </div>
              <div role="columnheader" className="lista-celula lista-th lista-celula--fim">
                <span className="sr-only">Ações</span>
              </div>
            </div>
          </div>
          <div role="rowgroup" className="lista-corpo">
            {visible.length === 0 ? (
              <div role="row" className="lista-linha">
                <div role="cell" className="lista-celula text-sm text-gray-400">
                  Nenhuma tag encontrada
                </div>
              </div>
            ) : null}
            {visible.map((row) => (
              <div
                key={row.id}
                role="row"
                data-linha-abrir=""
                className="lista-linha lista-linha--dividida lista-linha--clicavel"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a,button,input")) return;
                  setDialog({ type: "form", tag: row });
                }}
              >
                <div role="cell" data-papel="oculto" className="lista-celula lista-celula--oculta font-mono text-xs text-gray-400">
                  #{row.id}
                </div>
                <div role="cell" data-papel="titulo" className="lista-celula gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                    <TagIcon className="h-5 w-5" />
                  </div>
                  <TagName name={row.name} onSave={(name) => run(renameTagAction, { id: row.id, name })} />
                </div>
                <div role="cell" data-papel="meta" className="lista-celula">
                  {row.students > 0 ? (
                    <span className="text-sm text-gray-700" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {nf.format(row.students)}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-300">—</span>
                  )}
                </div>
                <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim gap-1">
                  <button
                    type="button"
                    aria-label={`Excluir tag ${row.name}`}
                    onClick={() => setDialog({ type: "delete", tag: row })}
                    className="btn-icone btn-icone--danger hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    data-abrir=""
                    aria-label={`Editar tag ${row.name}`}
                    onClick={() => setDialog({ type: "form", tag: row })}
                    className="btn-icone btn-abrir"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <TagFormDialog
        key={dialog?.type === "form" ? (dialog.tag?.id ?? "new") : "closed"}
        open={dialog?.type === "form"}
        tag={dialog?.type === "form" ? dialog.tag : null}
        onClose={close}
      />

      <ConfirmDialog
        open={dialog?.type === "delete"}
        onClose={close}
        tone="danger"
        icon={<TrashIcon className="h-5 w-5" />}
        title="Excluir tag"
        confirmLabel="Sim, excluir"
        pending={pending}
        error={dialog?.type === "delete" ? error : null}
        onConfirm={() => dialog?.type === "delete" && run(deleteTagAction, { id: dialog.tag.id }, { onOk: close })}
      >
        Tem certeza que deseja excluir a tag &quot;{dialog?.type === "delete" ? dialog.tag.name : ""}&quot;? Os alunos não serão excluídos, apenas o vínculo deixa de valer.
      </ConfirmDialog>

      <HowItWorksDialog open={dialog?.type === "help"} onClose={close} />
    </div>
  );
}
