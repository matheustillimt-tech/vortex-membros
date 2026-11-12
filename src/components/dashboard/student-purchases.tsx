"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  addDeliveryAction,
  deletePurchaseAction,
  schedulePurchaseEndAction,
  setPurchaseActiveAction,
} from "@/app/dashboard/student/[id]/actions";
import { buttonClass } from "./button";
import { Combobox } from "./combobox";
import { Dropdown, MenuItem, MenuLink, MenuSeparator } from "./dropdown";
import { CalendarClockIcon, DotsIcon, ExternalLinkIcon, PlusIcon, SaveIcon, SearchIcon, TrashIcon } from "./icons";
import { INPUT_CLASS } from "./input";
import { ConfirmDialog, DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { useAdminAction, type Fields } from "./use-admin-action";

export type PurchaseRow = {
  deliveryId: number | null;
  saleRef: string | null;
  date: string;
  dateTitle: string;
  deliveryName: string;
  gatewayLabel: string;
  source: "sale" | "manual" | "import";
  amount: string | null;
  active: boolean;
  /** Fim atual em "AAAA-MM-DDTHH:MM" (São Paulo) para o "Programar encerramento"; "" = sem data. */
  endLocal: string;
};

const SOURCE_LABEL = { manual: "Acesso avulso", import: "Importação" } as const;

function ErrorBox({ error }: { error: string | null }) {
  return error ? (
    <div role="alert" className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
      {error}
    </div>
  ) : null;
}

/** Aba Compras: contador, "Buscar vendas", lista, selo Ativo/Inativo, menu e modais; "Adicionar entrega". */
export function StudentPurchases({
  studentId,
  email,
  rows,
  deliveries,
  openNew,
}: {
  studentId: number;
  email: string;
  rows: PurchaseRow[];
  deliveries: { value: string; label: string }[];
  openNew: boolean;
}) {
  const router = useRouter();
  const { pending, error, setError, run } = useAdminAction();
  const [newOpen, setNewOpen] = useState(openNew);
  const [closing, setClosing] = useState<PurchaseRow | null>(null);
  const [removing, setRemoving] = useState<PurchaseRow | null>(null);
  const [delivery, setDelivery] = useState("");
  const closingTitle = useId();
  const newTitle = useId();
  const keyOf = (r: PurchaseRow): Fields => ({ id: studentId, deliveryId: r.deliveryId ?? "", saleRef: r.saleRef ?? "" });

  const closeNew = () => {
    setNewOpen(false);
    if (openNew) router.replace(`/dashboard/student/${studentId}/purchases`);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-sm tabular-nums text-gray-500">
          {rows.length} {rows.length === 1 ? "compra" : "compras"}
        </p>
        <a href={`/dashboard/sales?q=${encodeURIComponent(email)}`} className={buttonClass("outline")}>
          <SearchIcon className="h-4 w-4" />
          Buscar vendas
        </a>
      </div>
      {error && !closing && !removing && !newOpen ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}
      <div role="table" style={{ "--lista-cols": "8rem minmax(0,1fr) 11rem 7rem 7rem 2.25rem", "--lista-acoes": 1 } as React.CSSProperties} className="lista lista--card">
        <div className="lista-cabecalho-envelope">
          <div role="row" className="lista-cabecalho">
            <div role="columnheader" className="lista-celula lista-th">Compra em</div>
            <div role="columnheader" className="lista-celula lista-th">Entrega</div>
            <div role="columnheader" className="lista-celula lista-th">Identificação</div>
            <div role="columnheader" className="lista-celula lista-th">Valor</div>
            <div role="columnheader" className="lista-celula lista-th lista-celula--centro">Status</div>
            <div role="columnheader" className="lista-celula lista-th lista-celula--fim">
              <span className="sr-only">Ações</span>
            </div>
          </div>
        </div>
        <div role="rowgroup" className="lista-corpo">
          {rows.length === 0 ? (
            <div role="row" className="lista-linha">
              <div role="cell" className="lista-celula text-sm text-gray-400" style={{ gridColumn: "1 / -1" }}>
                Nenhuma compra
              </div>
            </div>
          ) : null}
          {rows.map((r) => (
            <div key={`${r.deliveryId}|${r.saleRef}`} role="row" data-linha-menu="" className="lista-linha lista-linha--dividida">
              <div role="cell" data-papel="titulo" className="lista-celula whitespace-nowrap text-hint text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }} title={r.dateTitle}>
                {r.date}
              </div>
              <div role="cell" data-papel="secundario" className="lista-celula gap-3 text-sm font-medium text-gray-900">
                <span className="tooltip flex-shrink-0" title={r.gatewayLabel}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold text-gray-700" aria-label={r.gatewayLabel}>
                    {r.gatewayLabel.slice(0, 1).toUpperCase()}
                  </div>
                </span>
                <div className="min-w-0">
                  <span className="block truncate" title={r.deliveryName}>
                    {r.deliveryName}
                  </span>
                </div>
              </div>
              <div role="cell" data-papel="meta" className="lista-celula !block text-sm text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                <div className="truncate">
                  {r.source === "sale" && r.saleRef ? (
                    <>
                      <span className="text-hint text-gray-400">ID Venda</span>{" "}
                      <a href={`/dashboard/sales?field=order&q=${encodeURIComponent(r.saleRef)}`} title={r.saleRef} className="transition-colors hover:text-brand-600">
                        …{r.saleRef.slice(-8)}
                      </a>
                    </>
                  ) : (
                    <span className="text-hint text-gray-400">{r.source === "sale" ? "—" : SOURCE_LABEL[r.source]}</span>
                  )}
                </div>
              </div>
              <div role="cell" data-papel="meta" className="lista-celula !block text-sm text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                {r.amount ? <span className="font-medium text-emerald-600">{r.amount}</span> : <span className="text-gray-400">—</span>}
              </div>
              <div role="cell" data-papel="acao" className="lista-celula lista-celula--centro whitespace-nowrap">
                <span className="sr-only">Status</span>
                <span className="tooltip">
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={r.active ? "Clique para inativar a compra" : "Clique para ativar a compra"}
                    title={r.active ? "Clique para inativar a compra" : "Clique para ativar a compra"}
                    onClick={() => run(setPurchaseActiveAction, { ...keyOf(r), active: r.active ? "0" : "1" })}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-badge font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                      r.active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${r.active ? "bg-emerald-500" : "bg-gray-400"}`} aria-hidden="true" />
                    {r.active ? "Ativo" : "Inativo"}
                  </button>
                </span>
              </div>
              <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim">
                <Dropdown
                  trigger={(p) => (
                    <button type="button" {...p} aria-label={`Ações da compra ${r.deliveryName}`} data-row-menu-trigger="compra" className="btn-icone">
                      <DotsIcon className="h-4 w-4" />
                    </button>
                  )}
                >
                  {r.deliveryId !== null ? (
                    <MenuLink href={`/dashboard/sales/deliveries/${r.deliveryId}/edit`} icon={<ExternalLinkIcon className="h-4 w-4 flex-shrink-0" />}>
                      Abrir entrega
                    </MenuLink>
                  ) : null}
                  <MenuItem icon={<CalendarClockIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => { setError(null); setClosing(r); }}>
                    Programar encerramento
                  </MenuItem>
                  {r.source !== "sale" ? (
                    <>
                      <MenuSeparator />
                      <MenuItem tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => { setError(null); setRemoving(r); }}>
                        Excluir
                      </MenuItem>
                    </>
                  ) : null}
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      </div>

      <PanelDialog open={closing !== null} onClose={() => setClosing(null)} widthClass="sm:max-w-md" labelledBy={closingTitle}>
        <DialogHeader id={closingTitle} title="Programar encerramento" onClose={() => setClosing(null)} />
        <div>
          <ErrorBox error={error} />
          <form
            id="form-encerramento"
            action={(fd) => {
              if (!closing) return;
              for (const [k, v] of Object.entries(keyOf(closing))) fd.set(k, String(v));
              run(schedulePurchaseEndAction, fd, { onOk: () => setClosing(null) });
            }}
          >
            <div className="min-w-0">
              <div className="painel-linhas">
                <div className="p-5">
                  <div className="mb-2 flex items-center gap-1.5">
                    <label htmlFor="encerramentoData" className="text-sm text-gray-700">
                      Encerrar acesso em
                    </label>
                  </div>
                  <div className="min-w-0">
                    <input
                      key={closing ? `${closing.deliveryId}|${closing.saleRef}` : "x"}
                      type="datetime-local"
                      name="end"
                      id="encerramentoData"
                      defaultValue={closing?.endLocal ?? ""}
                      aria-describedby="encerramentoData-hint"
                      className={INPUT_CLASS}
                    />
                    <p id="encerramentoData-hint" className="mt-1.5 w-full text-hint text-gray-400">
                      Deixe em branco para acesso sem data de encerramento.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex grow gap-2">
              <button type="button" onClick={() => setClosing(null)} className={buttonClass("outline", "grow justify-center")}>
                Cancelar
              </button>
              <button type="submit" form="form-encerramento" disabled={pending} className={buttonClass("primary", "grow justify-center")}>
                {pending ? <Spinner /> : <SaveIcon className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      </PanelDialog>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        tone="danger"
        icon={<TrashIcon className="h-5 w-5" />}
        title="Excluir compra"
        confirmLabel="Sim, excluir"
        pending={pending}
        error={error}
        onConfirm={() => removing && run(deletePurchaseAction, keyOf(removing), { onOk: () => setRemoving(null) })}
      >
        Remover a compra avulsa &quot;{removing?.deliveryName}&quot;? O acesso do aluno a essa entrega será removido.
      </ConfirmDialog>

      <PanelDialog open={newOpen} onClose={closeNew} widthClass="sm:max-w-md" labelledBy={newTitle}>
        <DialogHeader id={newTitle} title="Adicionar entrega" onClose={closeNew} />
        <div>
          <ErrorBox error={error} />
          <form
            id="form-nova-compra"
            onSubmit={(e) => {
              e.preventDefault();
              if (!delivery) return;
              run(addDeliveryAction, { id: studentId, deliveryId: delivery }, { onOk: () => { setDelivery(""); closeNew(); } });
            }}
          >
            <div className="min-w-0">
              <div className="painel-linhas">
                <div className="p-5">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-sm text-gray-700">
                      Entrega <span className="text-red-500">*</span>
                    </span>
                  </div>
                  <div className="min-w-0">
                    <Combobox name="compraEntrega" options={deliveries} value={delivery} onChange={setDelivery} placeholder="Selecione a entrega…" required aria-label="Entrega" />
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex gap-2">
            <button type="button" onClick={closeNew} className={buttonClass("outline", "grow justify-center")}>
              Cancelar
            </button>
            <button type="submit" form="form-nova-compra" disabled={pending || !delivery} className={buttonClass("primary", "grow justify-center")}>
              {pending ? <Spinner /> : <PlusIcon className="h-4 w-4" />}
              Adicionar
            </button>
          </div>
        </div>
      </PanelDialog>
    </div>
  );
}
