"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { importErrorsAction, restoreImportAction, trashImportAction, uploadImportAction } from "@/app/dashboard/students/imports/actions";
import type { StudentImportError } from "@/db/schema";
import { Button, buttonClass } from "./button";
import { Drawer } from "./drawer";
import { Dropdown, MenuItem, MenuSeparator } from "./dropdown";
import { AlertCircleIcon, DotsIcon, RotateCcwIcon, TrashIcon, UploadIcon } from "./icons";
import { ConfirmDialog, DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { StudentsSubnav } from "./students-subnav";
import { useAdminAction } from "./use-admin-action";

export type ImportRow = {
  id: number;
  name: string;
  status: "queued" | "processing" | "done" | "failed";
  total: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  createdAt: string;
};

/** Teto real do envio (corpo da requisição na Vercel); o texto continua "Máx 20MB". */
const MAX_BYTES = 4 * 1024 * 1024;
const nf = new Intl.NumberFormat("pt-BR");
const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`;
const STATUS: Record<ImportRow["status"], { label: string; tone: string }> = {
  queued: { label: "Na fila", tone: "neutral" },
  processing: { label: "Processando", tone: "info" },
  done: { label: "Concluída", tone: "success" },
  failed: { label: "Falhou", tone: "danger" },
};

/** Modal "Nova importação". */
function NewImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const { pending, error, setError, run } = useAdminAction();
  const close = () => {
    setFile(null);
    setError(null);
    onClose();
  };
  const pick = (f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return setError("Envie um arquivo XLSX.");
    if (f.size > MAX_BYTES) return setError("Arquivo maior que 4 MB.");
    setFile(f);
  };
  return (
    <PanelDialog open={open} onClose={close} labelledBy={titleId} widthClass="sm:max-w-sm">
      <DialogHeader id={titleId} title="Nova importação" onClose={close} />
      <div className="p-5">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Envie um arquivo XLSX com os dados dos alunos para importação em lote. Colunas obrigatórias: <span className="font-medium">status</span>,{" "}
            <span className="font-medium">produto_id</span> e <span className="font-medium">cliente_email</span>.
          </p>
          <div>
            <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <div
              role="button"
              tabIndex={0}
              onClick={() => input.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 transition-all duration-200 ${
                over ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${file ? "bg-brand-50 text-brand-500" : "bg-gray-100 text-gray-400"}`}>
                <UploadIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                {file ? (
                  <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
                ) : (
                  <p className="text-sm font-medium text-gray-500">
                    <span className="text-brand-500">Enviar</span> ou arraste
                  </p>
                )}
                <p className="text-xs text-gray-400">Arquivo XLSX. Máx 20MB e 5.000 registros.</p>
              </div>
            </div>
          </div>
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="flex gap-2">
          <button type="button" onClick={close} className={buttonClass("outline", "grow justify-center")}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending || !file}
            onClick={() => {
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              run(uploadImportAction, fd, { onOk: close });
            }}
            className={buttonClass("primary", "grow justify-center")}
          >
            {pending ? <Spinner /> : null}
            Enviar arquivo
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}

/** Gaveta "Ver erros": as linhas da planilha que não entraram e o motivo. */
function ErrorsDrawer({ row, onClose }: { row: ImportRow | null; onClose: () => void }) {
  const [state, setState] = useState<{ id: number; errors: StudentImportError[] | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!row) return;
    let alive = true;
    importErrorsAction(row.id).then(
      (res) => alive && setState({ id: row.id, errors: res.ok ? res.errors : null, error: res.ok ? null : res.error }),
      () => alive && setState({ id: row.id, errors: null, error: "Não foi possível carregar." }),
    );
    return () => {
      alive = false;
    };
  }, [row]);
  const current = row && state?.id === row.id ? state : null;
  return (
    <Drawer open={!!row} onClose={onClose} title="Erros da importação" bodyClassName="p-5">
      {row ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-900">{row.name}</span> · {plural(row.failed, "linha com erro", "linhas com erro")}
            {row.failed > 200 ? " (mostrando as 200 primeiras)" : ""}
          </p>
          {!current ? (
            <div className="flex justify-center py-6 text-gray-400">
              <Spinner />
            </div>
          ) : current.error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
              {current.error}
            </div>
          ) : current.errors && current.errors.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma linha com erro.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {current.errors?.map((e, i) => (
                <li key={`${e.row}-${i}`} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="w-20 flex-shrink-0 whitespace-nowrap font-mono text-xs leading-5 text-gray-400">Linha {e.row}</span>
                  <span className="text-sm text-gray-700">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

type Dialog = { type: "new" } | { type: "delete"; row: ImportRow } | { type: "errors"; row: ImportRow } | null;

/** Importações: "Nova importação", Lixeira / "Sair da lixeira", lista e modais. */
export function ImportsBoard({ rows, trash }: { rows: ImportRow[]; trash: ImportRow[] }) {
  const router = useRouter();
  const [inTrash, setInTrash] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const { pending, error, setError, run } = useAdminAction();
  const close = () => {
    setError(null);
    setDialog(null);
  };
  const list = inTrash ? trash : rows;

  // Enquanto houver importação na fila/processando, atualiza a lista: 3 s e, sem progresso, 10 s e
  // depois 30 s (uma importação parada não fica recarregando a tela a cada 3 s).
  const active = rows.some((r) => r.status === "queued" || r.status === "processing");
  const progress = rows.reduce((s, r) => s + r.created + r.updated + r.failed, 0);
  const idle = useRef({ progress, polls: 0 });
  useEffect(() => {
    if (!active) return;
    if (idle.current.progress !== progress) idle.current = { progress, polls: 0 };
    const n = idle.current.polls;
    const t = setTimeout(() => {
      idle.current.polls++;
      router.refresh();
    }, n < 10 ? 3000 : n < 20 ? 10_000 : 30_000);
    return () => clearTimeout(t);
  }, [active, progress, rows, router]);

  const lixeira = (
    <Button variant="ghost" className="flex-shrink-0 !px-2.5 !py-1.5" onClick={() => setInTrash((v) => !v)}>
      {inTrash ? <RotateCcwIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
      {inTrash ? "Sair da lixeira" : "Lixeira"}
    </Button>
  );
  const newButton = (extra = "") => (
    <Button className={extra} onClick={() => setDialog({ type: "new" })}>
      Nova importação
    </Button>
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Importações</h1>
            <p className="mt-1 text-sm text-gray-500">Importe alunos em massa via arquivo XLSX</p>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            {newButton("flex-shrink-0")}
          </div>
        </div>
      </div>

      <StudentsSubnav
        current="/dashboard/students/imports"
        actions={
          <div data-context-actions="" className="flex flex-shrink-0 items-center gap-2 py-1 max-lg:hidden">
            {lixeira}
          </div>
        }
      />
      <div data-toolbar="" className="mb-6 flex flex-wrap items-center justify-end gap-2 lg:hidden">
        {lixeira}
      </div>

      {error && dialog?.type !== "delete" ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      <div className={`transition-opacity${pending ? " opacity-60" : ""}`}>
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              {inTrash ? <TrashIcon className="h-8 w-8 text-gray-300" /> : <UploadIcon className="h-8 w-8 text-gray-300" />}
            </div>
            <h2 className="mb-1 text-lg font-medium text-gray-700">{inTrash ? "Nenhuma importação excluída" : "Nenhuma importação enviada"}</h2>
            <p className="max-w-md text-sm text-gray-400">{inTrash ? "Importações excluídas aparecerão aqui." : "Envie um arquivo XLSX para importar alunos em massa."}</p>
            {inTrash ? null : <div className="mt-4">{newButton()}</div>}
          </div>
        ) : (
          <div role="table" style={{ "--lista-cols": "minmax(0,1fr) 7rem 10rem 8rem 6.75rem", "--lista-acoes": 3 } as React.CSSProperties} className="lista lista--card">
            <div className="lista-cabecalho-envelope">
              <div role="row" className="lista-cabecalho">
                <div role="columnheader" className="lista-celula lista-th">
                  Arquivo
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  Registros
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  Data
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
              {list.map((r) => {
                const st = STATUS[r.status];
                const busy = r.status === "queued" || r.status === "processing";
                return (
                  <div key={r.id} role="row" className="lista-linha lista-linha--dividida">
                    <div role="cell" data-papel="titulo" className="lista-celula !block min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900" title={r.name}>
                        {r.name}
                      </p>
                      <p className="truncate text-hint text-gray-400">
                        {plural(r.created, "criado", "criados")} · {plural(r.updated, "atualizado", "atualizados")} · {nf.format(r.failed)} com erro
                      </p>
                    </div>
                    <div role="cell" data-papel="secundario" className="lista-celula">
                      <span className="text-sm tabular-nums text-gray-700">{nf.format(r.total)}</span>
                    </div>
                    <div role="cell" data-papel="meta" className="lista-celula">
                      <span className="text-sm text-gray-500">{r.createdAt}</span>
                    </div>
                    <div role="cell" data-papel="meta" className="lista-celula lista-celula--centro">
                      <span className={`selo selo--${st.tone}`} title={busy ? `${nf.format(r.created + r.updated + r.failed)} de ${nf.format(r.total)}` : undefined}>
                        {busy ? <Spinner /> : null}
                        {st.label}
                      </span>
                    </div>
                    <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim gap-1">
                      <Dropdown
                        trigger={(p) => (
                          <button type="button" {...p} aria-label={`Ações da importação ${r.name}`} data-row-menu-trigger="importacao" className="btn-icone">
                            <DotsIcon className="h-4 w-4" />
                          </button>
                        )}
                      >
                        <MenuItem icon={<AlertCircleIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "errors", row: r })}>
                          Ver erros
                        </MenuItem>
                        <MenuSeparator />
                        {inTrash ? (
                          <MenuItem disabled={pending} icon={<RotateCcwIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => run(restoreImportAction, { id: r.id })}>
                            Restaurar
                          </MenuItem>
                        ) : (
                          <MenuItem tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setDialog({ type: "delete", row: r })}>
                            Excluir
                          </MenuItem>
                        )}
                      </Dropdown>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <NewImportDialog open={dialog?.type === "new"} onClose={close} />
      <ErrorsDrawer row={dialog?.type === "errors" ? dialog.row : null} onClose={close} />
      <ConfirmDialog
        open={dialog?.type === "delete"}
        onClose={close}
        tone="danger"
        icon={<TrashIcon className="h-5 w-5" />}
        title="Excluir importação"
        confirmLabel="Sim, excluir"
        pending={pending}
        error={dialog?.type === "delete" ? error : null}
        onConfirm={() => dialog?.type === "delete" && run(trashImportAction, { id: dialog.row.id }, { onOk: close })}
      >
        Tem certeza que deseja excluir a importação &quot;{dialog?.type === "delete" ? dialog.row.name : ""}&quot;?
      </ConfirmDialog>
    </div>
  );
}
