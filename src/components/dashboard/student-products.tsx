"use client";

import { useId, useState } from "react";
import {
  deleteProgressAction,
  setAccessUntilAction,
  startAllAccessesAction,
  toggleReleaseAction,
} from "@/app/dashboard/student/[id]/actions";
import { buttonClass } from "./button";
import { Dropdown, MenuItem, MenuLink, MenuSeparator } from "./dropdown";
import { CalendarClockIcon, CalendarIcon, ClockIcon, DotsIcon, ExternalLinkIcon, InfinityIcon, MinusIcon, PlayIcon, PlusIcon, SaveIcon, TrashIcon, ZapIcon } from "./icons";
import { INPUT_CLASS } from "./input";
import { ConfirmDialog, DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { useAdminAction } from "./use-admin-action";

export type ProductRow = {
  productId: number;
  name: string;
  showcase: string;
  /** "Vitalício" ou "dd/mm/aaaa". */
  until: string;
  /** Texto do "Acesso atual: …" no modal. */
  current: string;
  completed: number;
  total: number;
  percent: number;
  immediate: boolean;
  scheduleName: string | null;
};

type TimeTarget = { row: ProductRow | null } | null;

function Stepper({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-fit items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
        <button type="button" aria-label="Diminuir" onClick={() => onChange(Math.max(0, value - 1))} className="flex w-9 items-center justify-center border-r border-gray-200 text-gray-500 transition-colors hover:bg-gray-50">
          <MinusIcon className="h-4 w-4" />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={value || ""}
          onChange={(e) => onChange(Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 0))}
          className="h-9 min-w-[3ch] bg-transparent text-center text-sm text-gray-900 outline-none placeholder-gray-400 [field-sizing:content]"
        />
        <button type="button" aria-label="Aumentar" onClick={() => onChange(Math.min(999, value + 1))} className="flex w-9 items-center justify-center border-l border-gray-200 text-gray-500 transition-colors hover:bg-gray-50">
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
      <label htmlFor={id} className="text-sm text-gray-700">
        {label}
      </label>
    </div>
  );
}

/** Modal "Alterar tempo de acesso": data, Vitalício ou somar tempo; "Aplicar a todos os cursos do aluno". */
function TimeDialog({ studentId, target, onClose }: { studentId: number; target: ProductRow | null; onClose: () => void }) {
  const titleId = useId();
  const { pending, error, run } = useAdminAction();
  const [mode, setMode] = useState<"date" | "lifetime" | null>(null);
  const [date, setDate] = useState("");
  const [add, setAdd] = useState({ days: 0, weeks: 0, months: 0, years: 0 });
  const [all, setAll] = useState(target === null);
  const adding = Object.values(add).some((n) => n > 0);
  const ready = mode === "lifetime" || (mode === "date" && date !== "") || (mode === null && adding);
  const set = (k: keyof typeof add) => (n: number) => {
    setMode(null);
    setAdd((a) => ({ ...a, [k]: n }));
  };
  function save() {
    const productId = all || !target ? "all" : target.productId;
    const fields = mode === "lifetime" ? { mode } : mode === "date" ? { mode, date } : { mode: "add", ...add };
    run(setAccessUntilAction, { id: studentId, productId, ...fields }, { onOk: onClose });
  }
  return (
    <PanelDialog open onClose={onClose} widthClass="sm:max-w-md" labelledBy={titleId}>
      <DialogHeader id={titleId} title="Alterar tempo de acesso" onClose={onClose} />
      <div className="p-5">
        <form
          className="space-y-4 text-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) save();
          }}
        >
          {target ? <p className="text-sm text-gray-500">{target.name}</p> : null}
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-hint text-red-700">
              {error}
            </div>
          ) : null}
          {target ? (
            <div>
              <div className="mx-auto flex w-fit items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-left text-sm text-sky-800">
                <div className="min-w-0 flex-1">Acesso atual: {target.current}</div>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600" role="group" aria-label="Alterar tempo de acesso">
            <span className="inline-flex items-center">
              {mode === "date" ? (
                <input type="datetime-local" value={date} autoFocus onChange={(e) => setDate(e.target.value)} aria-label="Escolha uma data" className={`${INPUT_CLASS} w-auto`} />
              ) : (
                <button type="button" aria-pressed={false} onClick={() => setMode("date")} className={buttonClass("outline")}>
                  <CalendarIcon className="h-4 w-4" />
                  Escolha uma data
                </button>
              )}
              <span>,</span>
            </span>
            <span>libere como</span>
            <button
              type="button"
              aria-pressed={mode === "lifetime"}
              onClick={() => setMode(mode === "lifetime" ? null : "lifetime")}
              className={buttonClass(mode === "lifetime" ? "brand" : "outline")}
            >
              <InfinityIcon className="h-4 w-4" />
              Vitalício
            </button>
            <span>ou adicione:</span>
          </div>
          <div>
            <div className="mx-auto w-fit space-y-2">
              <Stepper id="tempo-day" label="dia" value={add.days} onChange={set("days")} />
              <Stepper id="tempo-week" label="semana" value={add.weeks} onChange={set("weeks")} />
              <Stepper id="tempo-month" label="mês" value={add.months} onChange={set("months")} />
              <Stepper id="tempo-year" label="ano" value={add.years} onChange={set("years")} />
            </div>
          </div>
          {target ? (
            <label className="mx-auto flex w-fit items-center gap-3 text-left text-sm text-gray-700" title="A mesma duração vale para cada curso, contada a partir do início de cada um.">
              <button
                type="button"
                role="switch"
                aria-checked={all}
                onClick={() => setAll((v) => !v)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/15 focus:ring-offset-2 ${all ? "bg-brand-500" : "bg-gray-300"}`}
              >
                <span aria-hidden="true" className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${all ? "translate-x-5" : "translate-x-0"}`} />
              </button>
              <span>Aplicar a todos os cursos do aluno</span>
            </label>
          ) : null}
        </form>
      </div>
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={buttonClass("outline", "grow justify-center")}>
            Cancelar
          </button>
          <button type="button" disabled={!ready || pending} onClick={save} className={buttonClass("primary", "grow justify-center")}>
            {pending ? <Spinner /> : <SaveIcon className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}

/** Aba Produtos: contador, "Iniciar todos os acessos", lista (Nome, Liberado até, Progresso, Liberação) e modais. */
export function StudentProducts({ studentId, rows }: { studentId: number; rows: ProductRow[] }) {
  const { pending, error, setError, run } = useAdminAction();
  const [time, setTime] = useState<TimeTarget>(null);
  const [schedule, setSchedule] = useState<ProductRow | null>(null);
  const [progress, setProgress] = useState<ProductRow | null>(null);
  const scheduleTitle = useId();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-sm tabular-nums text-gray-500">
          {rows.length} {rows.length === 1 ? "produto" : "produtos"}
        </p>
        <button
          type="button"
          disabled={pending || rows.length === 0}
          onClick={() => run(startAllAccessesAction, { id: studentId })}
          title="Cria o registro de acesso de cada curso que o aluno ainda não abriu: prazo e progresso passam a contar já."
          className={buttonClass("outline", "!gap-1.5 !px-2.5 !py-1.5")}
        >
          {pending ? <Spinner /> : <PlayIcon className="h-4 w-4" />}
          Iniciar todos os acessos
        </button>
      </div>
      {error && !progress ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}
      <div role="table" style={{ "--lista-cols": "minmax(0,1fr) 10rem 8rem 11rem 2.25rem", "--lista-acoes": 1 } as React.CSSProperties} className="lista lista--card">
        <div className="lista-cabecalho-envelope">
          <div role="row" className="lista-cabecalho">
            <div role="columnheader" className="lista-celula lista-th">Nome</div>
            <div role="columnheader" className="lista-celula lista-th lista-celula--centro">Liberado até</div>
            <div role="columnheader" className="lista-celula lista-th lista-celula--centro">Progresso</div>
            <div role="columnheader" className="lista-celula lista-th lista-celula--centro">Liberação</div>
            <div role="columnheader" className="lista-celula lista-th lista-celula--fim">
              <span className="sr-only">Ações</span>
            </div>
          </div>
        </div>
        <div role="rowgroup" className="lista-corpo">
          {rows.length === 0 ? (
            <div role="row" className="lista-linha">
              <div role="cell" className="lista-celula text-sm text-gray-400" style={{ gridColumn: "1 / -1" }}>
                Nenhum produto
              </div>
            </div>
          ) : null}
          {rows.map((r) => (
            <div key={r.productId} role="row" data-linha-menu="" className="lista-linha lista-linha--dividida">
              <div role="cell" data-papel="titulo" className="lista-celula !block min-w-0">
                <div className="truncate text-sm font-medium text-gray-900" title={r.name}>
                  {r.name}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-hint font-normal text-gray-400">{r.showcase}</span>
                </div>
              </div>
              <div role="cell" data-papel="acao" className="lista-celula lista-celula--centro whitespace-nowrap text-sm text-gray-500">
                <span className="sr-only">Liberado até</span>
                <button
                  type="button"
                  aria-label="Alterar tempo de acesso"
                  onClick={() => { setError(null); setTime({ row: r }); }}
                  className="underline-offset-2 transition-colors hover:text-gray-900 hover:underline focus:outline-hidden focus-visible:underline"
                >
                  <ClockIcon className="h-3.5 w-3.5 flex-shrink-0 sm:hidden" />
                  {r.until}
                </button>
              </div>
              <div role="cell" data-papel="oculto" className="lista-celula lista-celula--centro lista-celula--oculta !block">
                <span className="tooltip block w-full" title={`${r.completed} de ${r.total} ${r.total === 1 ? "aula concluída" : "aulas concluídas"}`}>
                  <span className="flex flex-col items-center gap-1 rounded px-1.5 py-1">
                    <span className="block h-1.5 w-full self-stretch overflow-hidden rounded-full bg-gray-100">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${r.percent}%` }} />
                    </span>
                    <span className="text-label font-medium text-gray-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {r.percent}%
                    </span>
                  </span>
                </span>
              </div>
              <div role="cell" data-papel="acao" className="lista-celula lista-celula--centro whitespace-nowrap">
                <span className="sr-only">Liberação</span>
                <span className="tooltip">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(toggleReleaseAction, { id: studentId, productId: r.productId, immediate: r.immediate ? "0" : "1" })}
                    aria-label={r.immediate ? "Clique para restaurar a programação de liberação" : "Clique para remover a programação de liberação"}
                    title={r.immediate ? "Clique para restaurar a programação de liberação" : "Clique para remover a programação de liberação"}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-badge font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                      r.immediate ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    {r.immediate ? <ZapIcon className="h-3.5 w-3.5" /> : <CalendarClockIcon className="h-3.5 w-3.5" />}
                    {r.immediate ? "Imediata" : "Programada"}
                  </button>
                </span>
              </div>
              <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim">
                <Dropdown
                  trigger={(p) => (
                    <button type="button" {...p} aria-label={`Ações do produto ${r.showcase} - ${r.name}`} data-row-menu-trigger="curso" className="btn-icone">
                      <DotsIcon className="h-4 w-4" />
                    </button>
                  )}
                >
                  <MenuLink href={`/dashboard/content/product/${r.productId}`} icon={<ExternalLinkIcon className="h-4 w-4 flex-shrink-0" />}>
                    Abrir produto
                  </MenuLink>
                  <MenuItem icon={<ClockIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => { setError(null); setTime({ row: r }); }}>
                    Alterar tempo de acesso
                  </MenuItem>
                  <MenuItem icon={<CalendarClockIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => setSchedule(r)}>
                    Alterar cronograma de liberação
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem tone="danger" icon={<TrashIcon className="h-4 w-4 flex-shrink-0" />} onSelect={() => { setError(null); setProgress(r); }}>
                    Excluir progresso
                  </MenuItem>
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      </div>

      {time ? <TimeDialog key={time.row?.productId ?? "all"} studentId={studentId} target={time.row} onClose={() => setTime(null)} /> : null}

      <PanelDialog open={schedule !== null} onClose={() => setSchedule(null)} widthClass="sm:max-w-md" labelledBy={scheduleTitle}>
        <DialogHeader id={scheduleTitle} title="Alterar cronograma de liberação" onClose={() => setSchedule(null)} />
        <div>
          <p className="px-5 pt-5 text-sm text-gray-500">{schedule?.name}</p>
          <p className="px-5 pb-5 pt-3 text-sm text-gray-500">
            {schedule?.scheduleName
              ? `Este produto segue o cronograma "${schedule.scheduleName}". Para liberar tudo agora só para este aluno, use o selo de liberação.`
              : "Não há cronogramas de liberação neste produto. Cadastre um cronograma no produto para poder escolhê-lo aqui."}
          </p>
        </div>
        <div className="border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={() => setSchedule(null)} className={buttonClass("outline", "w-full justify-center")}>
            Fechar
          </button>
        </div>
      </PanelDialog>

      <ConfirmDialog
        open={progress !== null}
        onClose={() => setProgress(null)}
        tone="danger"
        icon={<TrashIcon className="h-5 w-5" />}
        title="Excluir progresso"
        confirmLabel="Sim, excluir"
        pending={pending}
        error={error}
        onConfirm={() => progress && run(deleteProgressAction, { id: studentId, productId: progress.productId }, { onOk: () => setProgress(null) })}
      >
        Remover todo o progresso do aluno em &quot;{progress?.name}&quot;? Esta ação não pode ser desfeita.
      </ConfirmDialog>
    </div>
  );
}
