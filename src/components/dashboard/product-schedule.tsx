"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminModuleNode } from "@/lib/admin/content";
import type { AdminRule } from "@/lib/admin/schedules";
import { createScheduleAction, setScheduleRuleAction } from "@/app/dashboard/content/schedules/actions";
import { Button } from "./button";
import { CalendarClockIcon, PlusIcon } from "./icons";
import { INPUT_CLASS, Input, Label } from "./input";
import { Modal, ModalFooter } from "./modal";
import { Combobox } from "./combobox";
import { useAdminAction } from "./use-admin-action";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Rótulo da regra: "Liberado no acesso", "7 dias após o acesso", "Em 25/12/2026". */
function ruleLabel(rule: AdminRule | undefined): string | null {
  if (!rule) return null;
  if (rule.mode === "fixed_date") return rule.date ? `Em ${dateFmt.format(new Date(rule.date))}` : null;
  if (rule.days === 0) return "Liberado no acesso";
  return `${plural(rule.days ?? 0, "dia", "dias")} após o acesso`;
}

/** Botão "Nova programação" (cabeçalho e estado vazio): cria já com este produto. */
export function NewScheduleButton({ productId, className = "" }: { productId: number; className?: string }) {
  const { pending, error, run } = useAdminAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <PlusIcon className="h-4 w-4" />
        Nova programação
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova programação" description="O produto entra nesta programação; depois defina quando cada módulo ou aula fica disponível.">
        {open ? (
          <form action={(fd) => run(createScheduleAction, fd, { onOk: () => setOpen(false) })} className="space-y-6">
            <input type="hidden" name="productId" value={productId} />
            <div>
              <Label htmlFor="new-schedule-name">Nome da programação</Label>
              <Input id="new-schedule-name" name="name" required maxLength={200} autoFocus />
            </div>
            {error ? (
              <p role="alert" className="text-hint text-red-600">
                {error}
              </p>
            ) : null}
            <ModalFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Criar programação
              </Button>
            </ModalFooter>
          </form>
        ) : null}
      </Modal>
    </>
  );
}

type Target = { type: "module" | "lesson"; id: number; title: string; rule: AdminRule | undefined; inherited: string | null };

/** Aba "Conteúdo programado" do produto. */
export function ProductSchedule({
  productId,
  schedule,
  modules,
  rules,
}: {
  productId: number;
  schedule: { id: number; name: string } | null;
  modules: AdminModuleNode[];
  rules: Record<string, AdminRule>;
}) {
  const { pending, error, run } = useAdminAction();
  const [editing, setEditing] = useState<Target | null>(null);
  const [mode, setMode] = useState<"none" | "days_after_access" | "fixed_date">("none");

  if (!schedule) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <CalendarClockIcon className="h-8 w-8 text-gray-300" />
        </div>
        <h2 className="mb-1 text-lg font-medium text-gray-700">Este produto não está em nenhuma programação</h2>
        <p className="max-w-md text-sm text-gray-400">Sem programação, todas as aulas abrem assim que o aluno recebe o acesso.</p>
        <div className="mt-4">
          <NewScheduleButton productId={productId} />
        </div>
      </div>
    );
  }

  function edit(t: Target) {
    setMode(t.rule?.mode ?? "none");
    setEditing(t);
  }
  const close = () => setEditing(null);

  return (
    <div>
      {error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400">
            <CalendarClockIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{schedule.name}</p>
            <p className="text-badge text-gray-400">Sem regra, a aula abre assim que o aluno recebe o acesso. A regra da aula vence a do módulo.</p>
          </div>
        </div>
        <Link href="/dashboard/content/schedules" className="text-hint text-brand-600 hover:underline">
          Gerenciar programações
        </Link>
      </div>

      {modules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900">Nenhum módulo ainda</p>
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity${pending ? " opacity-60" : ""}`}>
          {modules.map((m) => {
            const moduleRule = rules[`module:${m.id}`];
            const moduleText = ruleLabel(moduleRule);
            return (
              <div key={m.id} className="rounded-lg border border-gray-200 bg-white">
                <div className={`flex items-center gap-3 rounded-t-[calc(var(--radius-lg)-1px)] bg-gray-50/70 px-4 py-4${m.lessons.length ? "" : " rounded-b-[calc(var(--radius-lg)-1px)]"}`}>
                  <div className="min-w-0 flex-1">
                    <span className="edicao-inline-texto block truncate">{m.title}</span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-badge text-gray-400">
                      <span>{plural(m.lessons.length, "aula", "aulas")}</span>
                    </div>
                  </div>
                  <RuleButton
                    label={moduleText ?? "Sem regra"}
                    active={!!moduleText}
                    onClick={() => edit({ type: "module", id: m.id, title: m.title, rule: moduleRule, inherited: null })}
                  />
                </div>
                {m.lessons.length ? (
                  <div className="divide-y divide-gray-100 rounded-b-[calc(var(--radius-lg)-1px)] border-t border-gray-100 px-4">
                    {m.lessons.map((l) => {
                      const own = rules[`lesson:${l.id}`];
                      const ownText = ruleLabel(own);
                      return (
                        <div key={l.id} className="-mx-4 linha-lista">
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{l.title}</span>
                          <RuleButton
                            label={ownText ?? (moduleText ? `Segue o módulo · ${moduleText}` : "Sem regra")}
                            active={!!ownText}
                            onClick={() => edit({ type: "lesson", id: l.id, title: l.title, rule: own, inherited: moduleText })}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={editing?.type === "module" ? "Liberação do módulo" : "Liberação da aula"}
        description={editing?.title}
      >
        {editing ? (
          <form
            action={(fd) => run(setScheduleRuleAction, fd, { onOk: close })}
            className="space-y-6"
          >
            <input type="hidden" name="scheduleId" value={schedule.id} />
            <input type="hidden" name="targetType" value={editing.type} />
            <input type="hidden" name="targetId" value={editing.id} />
            <div>
              <Label htmlFor="rule-mode">Quando fica disponível</Label>
              <Combobox
                id="rule-mode"
                name="mode"
                value={mode}
                onChange={(v) => setMode(v as typeof mode)}
                options={[
                  {
                    value: "none",
                    label:
                      editing.type === "lesson"
                        ? editing.inherited
                          ? `Seguir o módulo (${editing.inherited})`
                          : "Seguir o módulo"
                        : "Sem regra (abre no acesso)",
                  },
                  { value: "days_after_access", label: "Dias após o acesso" },
                  { value: "fixed_date", label: "Data fixa" },
                ]}
              />
            </div>
            {mode === "days_after_access" ? (
              <div>
                <Label htmlFor="rule-days">Dias após o início do acesso</Label>
                <input
                  id="rule-days"
                  type="number"
                  name="days"
                  min={0}
                  max={3650}
                  required
                  defaultValue={editing.rule?.mode === "days_after_access" ? (editing.rule.days ?? 0) : 7}
                  className={INPUT_CLASS}
                />
              </div>
            ) : null}
            {mode === "fixed_date" ? (
              <div>
                <Label htmlFor="rule-date">Data de liberação</Label>
                <input
                  id="rule-date"
                  type="date"
                  name="date"
                  required
                  defaultValue={editing.rule?.mode === "fixed_date" && editing.rule.date ? isoDay.format(new Date(editing.rule.date)) : ""}
                  className={INPUT_CLASS}
                />
              </div>
            ) : null}
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
    </div>
  );
}

function RuleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-badge font-medium transition-colors ${
        active ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "border border-dashed border-gray-300 text-gray-500 hover:border-brand-500/60 hover:text-brand-500"
      }`}
    >
      <CalendarClockIcon className="h-3 w-3" />
      {label}
    </button>
  );
}
