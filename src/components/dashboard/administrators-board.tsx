"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createAdministratorAction, restoreAdministratorAction } from "@/app/dashboard/settings/administrators/actions";
import { buttonClass } from "./button";
import { Combobox } from "./combobox";
import { Drawer } from "./drawer";
import { ArrowLeftIcon, ChevronRightIcon, PlusIcon, SaveIcon, SearchIcon, TrashIcon } from "./icons";
import { INPUT_CLASS } from "./input";
import { TrashModal } from "./trash-modal";
import { useAdminAction } from "./use-admin-action";

export type AdministratorListRow = { id: number; name: string; email: string; roleLabel: string; lastAccess: string };
export type AdministratorTrashRow = { id: number; name: string; email: string; removedAt: string };

/** Nível de acesso: só Super Admin por enquanto (outros níveis podem ser adicionados depois). */
export const ROLE_OPTIONS = [{ value: "root", label: "Super Admin" }];

// Avatares de iniciais coloridos por hash.
const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initial(name: string): string {
  return ([...name.trim()][0] ?? "?").toLocaleUpperCase("pt-BR");
}

/** Linha de formulário da gaveta/modais (`painel-linhas` > `p-5`). */
export function FieldRow({ label, required, htmlFor, children }: { label: string; required?: boolean; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="p-5">
      <div className="mb-2 flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-sm text-gray-700">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </label>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ErrorAlert({ error }: { error: string | null }) {
  return error ? (
    <div role="alert" className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
      {error}
    </div>
  ) : null;
}

const FORM_ID = "form-admin-novo";

/** Gaveta "Novo administrador". */
function NewAdministratorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { pending, error, setError, run } = useAdminAction();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const dirty = name !== "" || email !== "";

  function close() {
    setName("");
    setEmail("");
    setError(null);
    onClose();
  }

  function submit(fd: FormData) {
    run(createAdministratorAction, fd, {
      onOk: (res) => {
        close();
        if (res.id) router.push(`/dashboard/settings/administrators/${res.id}`);
      },
    });
  }

  return (
    <Drawer
      name="admin-new"
      open={open}
      onClose={close}
      title="Novo administrador"
      dirty={dirty}
      onSaveAndExit={() => (document.getElementById(FORM_ID) as HTMLFormElement | null)?.requestSubmit()}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={close} className={buttonClass("outline", "grow justify-center")}>
            Cancelar
          </button>
          <button type="submit" form={FORM_ID} disabled={pending} className={buttonClass("primary", "grow justify-center")}>
            {pending ? (
              <svg aria-hidden className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" />
              </svg>
            ) : (
              <SaveIcon className="h-4 w-4" />
            )}
            Salvar e enviar senha
          </button>
        </div>
      }
    >
      <form id={FORM_ID} action={submit}>
        <ErrorAlert error={error} />
        <div className="min-w-0">
          <div className="painel-linhas">
            <FieldRow label="Nome" required htmlFor="novoNome">
              <input
                type="text"
                name="name"
                id="novoNome"
                required
                maxLength={200}
                placeholder="Nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT_CLASS}
              />
            </FieldRow>
            <FieldRow label="E-mail" required htmlFor="novoEmail">
              <input
                type="email"
                name="email"
                id="novoEmail"
                required
                maxLength={254}
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
              />
            </FieldRow>
            <FieldRow label="Nível de acesso" required htmlFor="novoPapel">
              <Combobox id="novoPapel" name="role" options={ROLE_OPTIONS} defaultValue="root" required />
            </FieldRow>
          </div>
        </div>
      </form>
    </Drawer>
  );
}

/** Administradores: busca, "Novo administrador" e a lista. */
export function AdministratorsBoard({ rows, search, trash }: { rows: AdministratorListRow[]; search: string; trash: AdministratorTrashRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const restore = useAdminAction();

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="">
              <Link
                href="/dashboard/settings#access"
                data-navega=""
                className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                Voltar para Configurações
              </Link>
            </div>
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Administradores</h1>
            <p className="mt-1 text-sm text-gray-500">Quem entra no painel e o que pode fazer</p>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <div className="w-full sm:w-72">
              <Form action="/dashboard/settings/administrators" className="flex">
                <div
                  data-busca-caixa=""
                  className="flex h-[38px] min-w-0 flex-1 items-center rounded-lg border border-gray-200 bg-white text-hint transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15"
                >
                  <input
                    type="text"
                    name="busca"
                    defaultValue={search}
                    aria-label="Buscar por nome ou e-mail"
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-hint text-gray-900 outline-none placeholder-gray-400 read-only:cursor-progress"
                    placeholder="Buscar por nome ou e-mail…"
                  />
                  <button
                    type="submit"
                    aria-label="Buscar"
                    className="flex h-full w-9 flex-shrink-0 items-center justify-center rounded-r-lg border-l border-gray-200 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:cursor-wait disabled:hover:bg-transparent"
                  >
                    <SearchIcon className="h-4 w-4" />
                  </button>
                </div>
              </Form>
            </div>
            <button type="button" data-open-sheet="admin-new" onClick={() => setCreating(true)} className={buttonClass("primary")}>
              <PlusIcon className="h-4 w-4" />
              Novo administrador
            </button>
          </div>
        </div>
      </div>

      <div data-header-traco="" className="my-6 border-b border-gray-200" />

      <div className="mb-6 flex justify-end">
        <button type="button" onClick={() => setTrashOpen(true)} className={buttonClass("outline")}>
          <TrashIcon className="h-4 w-4" />
          Lixeira
        </button>
      </div>
      {restore.error ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
          {restore.error}
        </div>
      ) : null}

      <div className="transition-opacity">
        <div className="rounded-lg border border-gray-200 bg-white">
          <div
            role="table"
            style={{ "--lista-cols": "minmax(0,1fr) 18rem 8rem 10rem 3rem", "--lista-acoes": 1 } as React.CSSProperties}
            className="lista text-sm"
          >
            <div className="lista-cabecalho-envelope">
              <div role="row" className="lista-cabecalho">
                <div role="columnheader" className="lista-celula lista-th">
                  Nome
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  E-mail
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  Perfil
                </div>
                <div role="columnheader" className="lista-celula lista-th">
                  Último acesso
                </div>
                <div role="columnheader" className="lista-celula lista-th lista-celula--fim">
                  <span className="sr-only">Ações</span>
                </div>
              </div>
            </div>
            <div role="rowgroup" className="lista-corpo">
              {rows.length === 0 ? (
                <div role="row" className="lista-linha">
                  <div role="cell" className="lista-celula text-gray-400">
                    Nenhum administrador encontrado
                  </div>
                </div>
              ) : null}
              {rows.map((row) => {
                const href = `/dashboard/settings/administrators/${row.id}`;
                return (
                  <div
                    key={row.id}
                    role="row"
                    data-linha-abrir=""
                    className="lista-linha lista-linha--dividida lista-linha--clicavel"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button")) return;
                      router.push(href);
                    }}
                  >
                    <div role="cell" data-papel="titulo" className="lista-celula gap-3">
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${avatarColor(row.email)}`}>
                        <span>{initial(row.name)}</span>
                      </div>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{row.name}</span>
                      </span>
                    </div>
                    <div role="cell" data-papel="secundario" className="lista-celula !block min-w-0">
                      <div className="truncate text-gray-500">{row.email}</div>
                    </div>
                    <div role="cell" data-papel="meta" className="lista-celula">
                      <span className="selo selo--brand">{row.roleLabel}</span>
                    </div>
                    <div role="cell" data-papel="meta" className="lista-celula text-gray-500">
                      {row.lastAccess}
                    </div>
                    <div role="cell" data-papel="acoes" className="lista-celula lista-celula--fim">
                      <Link href={href} aria-label={`Abrir ${row.name}`} className="btn-icone btn-abrir" data-abrir="">
                        <ChevronRightIcon className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <NewAdministratorDrawer open={creating} onClose={() => setCreating(false)} />
      <TrashModal
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        description="Administradores excluídos. Ao restaurar, a pessoa volta a ser Super Admin com a mesma senha."
        pending={restore.pending}
        entries={trash.map((t) => ({
          key: String(t.id),
          name: t.name,
          kindLabel: "Administrador",
          detail: t.email,
          deletedAt: t.removedAt,
          onRestore: () => restore.run(restoreAdministratorAction, { id: t.id }, { onOk: () => setTrashOpen(false) }),
        }))}
      />
    </div>
  );
}
