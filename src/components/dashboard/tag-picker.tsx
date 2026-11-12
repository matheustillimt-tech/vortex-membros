"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createTagAction } from "@/app/dashboard/sales/deliveries/actions";
import { buttonClass } from "./button";
import { PlusIcon, SaveIcon, SearchIcon, TagIcon, XIcon } from "./icons";
import { INPUT_CLASS } from "./input";
import { DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { useAdminAction } from "./use-admin-action";

export type TagOption = { id: number; name: string };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Modal "Adicionando Tag". */
function CreateTagDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (tag: TagOption) => void }) {
  const titleId = useId();
  const formId = useId();
  const [name, setName] = useState("");
  const { pending, error, setError, run } = useAdminAction();
  const close = () => {
    setName("");
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
            const typed = name.trim();
            run(createTagAction, { name: typed }, {
              onOk: (res) => {
                if (res.id) onCreated({ id: res.id, name: typed });
                close();
              },
            });
          }}
        >
          <div className="min-w-0">
            <div className="painel-linhas">
              <div className="p-5">
                <div className="mb-2 flex items-center gap-1.5">
                  <label htmlFor="novaTagNome" className="text-sm text-gray-700">
                    Nome <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="min-w-0">
                  <input
                    type="text"
                    name="novaTagNome"
                    id="novaTagNome"
                    autoFocus
                    required
                    placeholder="Ex: Turma A"
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
            Criar
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}

/**
 * Tags da entrega: pílulas com X, "Nenhuma tag adicionada.", botão
 * "Adicionar tag" com busca ("Buscar tag…"), "Nenhuma tag encontrada." e "Criar tag".
 */
export function TagPicker({
  tags,
  selected,
  onChange,
  onTagCreated,
}: {
  tags: TagOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
  onTagCreated: (tag: TagOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chosen = selected.map((id) => tags.find((t) => t.id === id)).filter((t): t is TagOption => !!t);
  const available = tags.filter((t) => !selected.includes(t.id) && (!q.trim() || fold(t.name).includes(fold(q.trim()))));

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {chosen.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-brand-500 bg-brand-500/10 py-1 pl-2.5 pr-1.5 text-badge font-medium text-brand-600">
            <span>{t.name}</span>
            <button type="button" aria-label={`Remover tag ${t.name}`} onClick={() => onChange(selected.filter((id) => id !== t.id))} className="rounded-full p-0.5 transition-colors hover:bg-brand-500/20">
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {chosen.length === 0 ? <span className="text-hint text-gray-400">Nenhuma tag adicionada.</span> : null}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-badge font-medium text-gray-500 transition-colors hover:border-brand-500/60 hover:text-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-3 w-3" /> Adicionar tag
        </button>
      </div>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg md:left-auto md:right-0">
          <div className="relative mb-1.5">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar tag…"
              aria-label="Buscar tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            />
          </div>
          <div className="scroll-fino max-h-56 space-y-0.5 overflow-y-auto">
            {available.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChange([...selected, t.id]);
                  setOpen(false);
                  setQ("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <TagIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                <span className="truncate">{t.name}</span>
              </button>
            ))}
            {available.length === 0 ? <p className="px-2 py-1.5 text-sm text-gray-400">Nenhuma tag encontrada.</p> : null}
          </div>
          <div className="mt-1.5 border-t border-gray-100 pt-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-brand-600 transition-colors hover:bg-brand-500/10"
            >
              <PlusIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Criar tag</span>
            </button>
          </div>
        </div>
      ) : null}
      <CreateTagDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(tag) => {
          onTagCreated(tag);
          if (!selected.includes(tag.id)) onChange([...selected, tag.id]);
        }}
      />
    </div>
  );
}
