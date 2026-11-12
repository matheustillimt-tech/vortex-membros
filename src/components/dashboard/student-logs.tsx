"use client";

import { useState } from "react";
import { listLogsAction, type LogRow } from "@/app/dashboard/student/[id]/actions";
import { buttonClass } from "./button";
import { ChevronDownIcon, DownloadIcon } from "./icons";
import { ConfirmDialog, Spinner } from "./panel-dialog";
import { downloadFrom } from "./toast";

/** Aba Logs: contador, "Exportar logs" (com confirmação) e a lista Data/Evento/IP/Dispositivo. */
export function StudentLogs({ studentId, rows: initial, total, nextCursor: initialCursor }: { studentId: number; rows: LogRow[]; total: number; nextCursor: number | null }) {
  const [rows, setRows] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  async function loadMore() {
    if (cursor === null) return;
    setLoading(true);
    const fd = new FormData();
    fd.set("id", String(studentId));
    fd.set("cursor", String(cursor));
    const res = await listLogsAction(fd);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setRows((r) => [...r, ...res.rows]);
    setCursor(res.nextCursor);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-sm tabular-nums text-gray-500">
          {total.toLocaleString("pt-BR")} {total === 1 ? "log" : "logs"}
        </p>
        <button type="button" onClick={() => setExportOpen(true)} className={buttonClass("outline")}>
          <DownloadIcon className="h-4 w-4" />
          Exportar logs
        </button>
      </div>
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}
      <div role="table" style={{ "--lista-cols": "8rem minmax(0,1fr) 11rem 16rem", "--lista-acoes": 1 } as React.CSSProperties} className="lista lista--card">
        <div className="lista-cabecalho-envelope">
          <div role="row" className="lista-cabecalho">
            <div role="columnheader" className="lista-celula lista-th">Data</div>
            <div role="columnheader" className="lista-celula lista-th">Evento</div>
            <div role="columnheader" className="lista-celula lista-th">IP</div>
            <div role="columnheader" className="lista-celula lista-th">Dispositivo</div>
          </div>
        </div>
        <div role="rowgroup" className="lista-corpo">
          {rows.length === 0 ? (
            <div role="row" className="lista-linha">
              <div role="cell" className="lista-celula text-sm text-gray-400" style={{ gridColumn: "1 / -1" }}>
                Nenhum log
              </div>
            </div>
          ) : null}
          {rows.map((r) => (
            <div key={r.id} role="row" className="lista-linha lista-linha--dividida">
              <div role="cell" data-papel="titulo" className="lista-celula">
                <span className="whitespace-nowrap text-hint text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }} title={r.title}>
                  {r.date}
                </span>
              </div>
              <div role="cell" data-papel="secundario" className="lista-celula text-sm font-medium text-gray-900">
                {r.label}
              </div>
              <div role="cell" data-papel="meta" className="lista-celula text-sm text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                <span className="tooltip max-w-full" title={r.ip}>
                  <span className="block min-w-0 truncate">{r.ip || "—"}</span>
                </span>
              </div>
              <div role="cell" data-papel="meta" className="lista-celula text-sm text-gray-500">
                <span className="tooltip max-w-full" title={r.userAgent}>
                  <span className="block min-w-0 truncate">{r.userAgent || "—"}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {cursor !== null ? (
        <div className="mt-4 flex items-center justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={loadMore}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
          >
            {loading ? <Spinner /> : <ChevronDownIcon className="h-4 w-4" />}
            <span>{loading ? "Carregando…" : "Carregar mais resultados"}</span>
          </button>
        </div>
      ) : null}
      <ConfirmDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tone="brand"
        icon={<DownloadIcon className="h-5 w-5" />}
        title="Exportar logs"
        confirmLabel="Sim, exportar"
        pending={false}
        onConfirm={() => {
          setExportOpen(false);
          downloadFrom(`/dashboard/student/${studentId}/logs/export`);
        }}
      >
        A exportação gera um arquivo com todos os logs deste aluno.
      </ConfirmDialog>
    </div>
  );
}
