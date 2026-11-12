"use client";

import { useState } from "react";
import { addNoteAction, deleteNoteAction } from "@/app/dashboard/student/[id]/actions";
import { ArrowUpIcon, StickyNoteIcon, TrashIcon } from "./icons";
import { ConfirmDialog, Spinner } from "./panel-dialog";
import { useAdminAction } from "./use-admin-action";

export type NoteRow = { id: number; body: string; author: string; initials: string; color: string; when: string; title: string };

/** Card "Notas" do Resumo: campo "Escreva uma nota...", lista e "Excluir nota". */
export function StudentNotes({
  studentId,
  notes,
  me,
}: {
  studentId: number;
  notes: NoteRow[];
  me: { initials: string; color: string };
}) {
  const { pending, error, setError, run } = useAdminAction();
  const [body, setBody] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  function add() {
    const text = body.trim();
    if (!text) return;
    run(addNoteAction, { id: studentId, body: text }, { onOk: () => setBody("") });
  }

  return (
    <div className="space-y-6">
      <div className="scroll-mt-24 rounded-lg border border-gray-200 bg-white p-6" id="notas">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Notas</h2>
          </div>
        </div>
        <div className="mt-4">
          <form
            className="mb-5 flex items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${me.color}`}>
              <span>{me.initials}</span>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
              <input
                id="nota-composer"
                type="text"
                value={body}
                maxLength={2000}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Escreva uma nota..."
                aria-label="Escreva uma nota..."
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none focus-visible:outline-none placeholder-gray-400"
              />
              <button
                type="submit"
                aria-label="Adicionar nota"
                disabled={pending || !body.trim()}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-brand-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? <Spinner /> : <ArrowUpIcon className="h-4 w-4" />}
              </button>
            </div>
          </form>
          {error && deleting === null ? (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
              {error}
            </div>
          ) : null}
          <div className="space-y-3">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                  <StickyNoteIcon className="h-5 w-5 text-gray-300" />
                </div>
                <p className="text-sm text-gray-400">Nenhuma nota registrada</p>
                <p className="mt-0.5 text-badge text-gray-300">Adicione notas internas sobre este aluno.</p>
              </div>
            ) : null}
            {notes.map((n) => (
              <div key={n.id} data-linha="nota" className="group flex gap-3 rounded-lg border border-gray-100 p-3">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${n.color}`}>
                  <span>{n.initials}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{n.author}</span>
                    <span className="flex-shrink-0 text-badge text-gray-400" title={n.title}>
                      {n.when}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-700">{n.body}</p>
                </div>
                <button
                  type="button"
                  aria-label="Excluir nota"
                  title="Excluir nota"
                  onClick={() => {
                    setError(null);
                    setDeleting(n.id);
                  }}
                  className="btn-icone flex-shrink-0 self-start text-gray-400 hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        tone="danger"
        icon={<TrashIcon className="h-5 w-5" />}
        title="Excluir nota"
        confirmLabel="Sim, excluir"
        pending={pending}
        error={error}
        onConfirm={() => deleting !== null && run(deleteNoteAction, { id: studentId, noteId: deleting }, { onOk: () => setDeleting(null) })}
      >
        Tem certeza que deseja excluir esta nota? Essa ação não pode ser desfeita.
      </ConfirmDialog>
    </div>
  );
}
