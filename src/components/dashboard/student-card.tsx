"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { deleteStudentAction, resendWelcomeAction } from "@/app/dashboard/students/actions";
import {
  listAllTagsAction,
  setStudentPasswordAction,
  setStudentTagsAction,
  updateStudentAction,
} from "@/app/dashboard/student/[id]/actions";
import { buttonClass } from "./button";
import { Combobox, filterOptions } from "./combobox";
import { Drawer } from "./drawer";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  KeyIcon,
  LogInIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  SendIcon,
  ShoppingCartIcon,
  TagIcon,
  TrashIcon,
  WhatsappIcon,
  XIcon,
} from "./icons";
import { INPUT_CLASS } from "./input";
import { ConfirmDialog, DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { Row } from "./settings-form";
import { copyText, useToast } from "./toast";
import { useAdminAction } from "./use-admin-action";

export type DateLabel = { long: string; relative: string; title: string };
export type StudentCardData = {
  id: number;
  name: string;
  email: string;
  /** CPF/CNPJ com máscara. */
  document: string | null;
  documentRaw: string | null;
  phone: string | null;
  phoneDdi: string;
  phoneNumber: string;
  whatsapp: string | null;
  initials: string;
  color: string;
  tags: { id: number; name: string }[];
  lastAccess: DateLabel | null;
  firstAccess: DateLabel | null;
  created: DateLabel;
  loginLink: string;
};

type Dialog = "edit" | "password" | "resend" | "delete" | "tags" | null;

const ICON_BUTTON = "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors";
const ACTION_ROW =
  "group flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-hidden focus-visible:bg-gray-50";

function DateItem({ label, value, current, last }: { label: string; value: DateLabel | null; current?: boolean; last?: boolean }) {
  return (
    <li className="relative flex gap-3">
      <div className="flex w-3 flex-shrink-0 flex-col items-center">
        <span className="flex h-4 flex-shrink-0 items-center">
          <span className={`h-2 w-2 rounded-full ring-2 ring-white ${current ? "bg-brand-500" : "bg-gray-300"}`} />
        </span>
        {last ? null : <span className="mt-1 w-px flex-1 bg-gray-100" />}
      </div>
      <div className={`min-w-0 ${last ? "" : "pb-5"}`}>
        <div className="text-badge leading-4 text-gray-400">{label}</div>
        {value ? (
          <>
            <div className="mt-0.5 text-hint leading-snug text-gray-700" title={value.title}>
              {value.long}
            </div>
            <div className="text-badge text-gray-400">{value.relative}</div>
          </>
        ) : (
          <div className="mt-0.5 text-hint leading-snug text-gray-700">Nunca acessou</div>
        )}
      </div>
    </li>
  );
}

function PasswordInput({ id, name }: { id: string; name: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative w-full">
      <input name={name} id={id} required autoComplete="new-password" placeholder="••••••••" type={shown ? "text" : "password"} className={`${INPUT_CLASS} pr-10`} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 transition-colors hover:text-gray-600"
        aria-label={shown ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={shown}
      >
        {shown ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ErrorAlert({ error, className = "mx-5 mt-5" }: { error: string | null; className?: string }) {
  return error ? (
    <div role="alert" className={`${className} rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700`}>
      {error}
    </div>
  ) : null;
}

/** Gaveta "Editar aluno": Nome, Email, CPF ou CNPJ e Celular com DDI. */
function EditDrawer({ student, countries, onClose }: { student: StudentCardData; countries: { value: string; label: string }[]; onClose: () => void }) {
  const { pending, error, run } = useAdminAction();
  const [dirty, setDirty] = useState(false);
  const [ddi, setDdi] = useState(student.phoneDdi);
  const save = () => {
    const form = document.getElementById("form-editar-aluno") as HTMLFormElement | null;
    if (form) run(updateStudentAction, new FormData(form), { onOk: onClose });
  };
  return (
    <Drawer
      open
      name="edit-user"
      title="Editar aluno"
      widthClass="max-w-lg"
      dirty={dirty}
      onClose={onClose}
      onSaveAndExit={save}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={buttonClass("outline", "grow justify-center")}>
            <XIcon className="h-4 w-4" />
            Cancelar
          </button>
          <button type="button" disabled={pending} onClick={save} className={buttonClass("primary", "grow justify-center")}>
            {pending ? <Spinner /> : <SaveIcon className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      }
    >
      <form
        id="form-editar-aluno"
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <ErrorAlert error={error} />
        <input type="hidden" name="id" value={student.id} />
        <div className="min-w-0">
          <div className="painel-linhas">
            <Row label="Nome" required htmlFor="editNome">
              <input type="text" name="name" id="editNome" required maxLength={200} defaultValue={student.name} placeholder="Nome completo" className={INPUT_CLASS} />
            </Row>
            <Row label="Email" required htmlFor="editEmail">
              <input type="email" name="email" id="editEmail" required maxLength={254} defaultValue={student.email} placeholder="email@exemplo.com" className={INPUT_CLASS} />
            </Row>
            <Row label="CPF ou CNPJ" htmlFor="editDoc">
              <input type="text" name="document" id="editDoc" maxLength={20} defaultValue={student.document ?? ""} placeholder="000.000.000-00" className={INPUT_CLASS} />
            </Row>
            <Row label="Celular" htmlFor="editCelular">
              <div className="flex w-full gap-2">
                <div className="w-36 flex-shrink-0">
                  <Combobox
                    name="ddi"
                    options={countries}
                    value={ddi}
                    onChange={(v) => {
                      setDdi(v);
                      setDirty(true);
                    }}
                    aria-label="País do celular"
                  />
                </div>
                <input
                  type="tel"
                  name="phone"
                  id="editCelular"
                  maxLength={20}
                  defaultValue={student.phoneNumber}
                  placeholder={ddi === "55" ? "(11) 90000-0000" : ""}
                  className={INPUT_CLASS}
                />
              </div>
            </Row>
          </div>
        </div>
      </form>
    </Drawer>
  );
}

/** Gaveta "Gerenciar tags": busca e lista de tags com checkbox; "Salvar" troca o conjunto. */
function TagsDrawer({ student, onClose }: { student: StudentCardData; onClose: () => void }) {
  const { pending, error, run } = useAdminAction();
  const [all, setAll] = useState<{ id: number; name: string }[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [marked, setMarked] = useState<number[]>(student.tags.map((t) => t.id));
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let alive = true;
    void listAllTagsAction().then((res) => {
      if (!alive) return;
      if (res.ok) setAll(res.tags);
      else setLoadError(res.error);
    });
    return () => {
      alive = false;
    };
  }, []);
  const options = useMemo(() => (all ?? []).map((t) => ({ value: String(t.id), label: t.name })), [all]);
  const shown = filterOptions(options, query);
  const save = () => run(setStudentTagsAction, { id: student.id, tagIds: marked.join(",") }, { onOk: onClose });
  return (
    <Drawer
      open
      name="manage-tags"
      title="Gerenciar tags"
      dirty={dirty}
      onClose={onClose}
      onSaveAndExit={save}
      bodyClassName="p-5"
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={buttonClass("outline", "grow justify-center")}>
            Cancelar
          </button>
          <button type="button" disabled={pending || all === null} onClick={save} className={buttonClass("primary", "grow justify-center")}>
            {pending ? <Spinner /> : <SaveIcon className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      }
    >
      <ErrorAlert error={error ?? loadError} className="mb-4" />
      <div className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-hint transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
        <SearchIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar..." aria-label="Buscar..." className="h-full min-w-0 flex-1 bg-transparent text-hint text-gray-900 outline-none focus-visible:outline-none placeholder-gray-400" />
      </div>
      {all === null && !loadError ? (
        <div className="space-y-2 py-1" aria-hidden="true">
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
        </div>
      ) : null}
      <div className="space-y-0.5">
        {shown.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-hint text-gray-700 transition-colors hover:bg-gray-50">
            <input
              type="checkbox"
              checked={marked.includes(Number(o.value))}
              onChange={(e) => {
                setDirty(true);
                setMarked((m) => (e.target.checked ? [...m, Number(o.value)] : m.filter((v) => v !== Number(o.value))));
              }}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30"
            />
            <span className="min-w-0 flex-1 break-words">{o.label}</span>
          </label>
        ))}
        {all && all.length === 0 ? <p className="px-1.5 py-1.5 text-hint text-gray-400">Sem opções</p> : null}
        {all && all.length > 0 && shown.length === 0 ? <p className="px-1.5 py-1.5 text-center text-hint text-gray-400">Nenhum resultado</p> : null}
      </div>
    </Drawer>
  );
}

/**
 * Cartão do perfil do aluno: Voltar, Excluir/Editar, avatar de iniciais,
 * nome, e-mail, CPF, WhatsApp, Expandir (Origem, Tags + Gerenciar, datas), link de login automático
 * e AÇÕES (Adicionar entrega, Entrar como o aluno, Reenviar boas-vindas, Alterar senha).
 */
export function StudentCard({ student, countries }: { student: StudentCardData; countries: { value: string; label: string }[] }) {
  const router = useRouter();
  const { pending, error, setError, run } = useAdminAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [expanded, setExpanded] = useState(false);
  const toast = useToast();
  const passwordTitle = useId();
  const open = (d: Dialog) => {
    setError(null);
    setDialog(d);
  };
  const close = () => setDialog(null);
  const copyLink = () => void copyText(student.loginLink).then((ok) => ok && toast.show("Copiado!"));

  return (
    <aside className="space-y-6">
      <div className="relative rounded-lg border border-gray-200 bg-white p-6">
        <Link
          href="/dashboard/students"
          className="absolute left-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-hint font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Voltar
        </Link>
        <div className="absolute right-3 top-3 flex items-center gap-1">
          <span className="tooltip">
            <button type="button" onClick={() => open("delete")} aria-label="Excluir aluno" title="Excluir aluno" className={`${ICON_BUTTON} border-transparent text-red-600 hover:bg-red-50 hover:text-red-700`}>
              <TrashIcon className="h-4 w-4" />
            </button>
          </span>
          <span className="tooltip">
            <button type="button" data-open-sheet="edit-user" onClick={() => open("edit")} aria-label="Editar perfil" title="Editar perfil" className={`${ICON_BUTTON} border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900`}>
              <PencilIcon className="h-4 w-4" />
            </button>
          </span>
        </div>
        <div className="flex flex-col items-center pt-8 text-center">
          <div className={`flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full text-2xl font-semibold ${student.color}`}>
            <span>{student.initials}</span>
          </div>
          <h2 className="mt-4 text-lg font-semibold leading-snug text-gray-900">{student.name}</h2>
          <p className="mt-1.5 break-all text-hint text-gray-400">{student.email}</p>
          {student.document ? (
            <p className="mt-1 text-hint text-gray-400" style={{ fontVariantNumeric: "tabular-nums" }}>
              {student.document}
            </p>
          ) : null}
          {student.whatsapp && student.phone ? (
            <a
              href={student.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chamar Whatsapp"
              title="Chamar Whatsapp"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-emerald-500/60 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <WhatsappIcon className="h-4 w-4 flex-shrink-0 text-emerald-600" />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{student.phone}</span>
            </a>
          ) : null}
        </div>
        <div className="relative mt-6">
          <div className="border-t border-gray-100" />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher" : "Expandir"}
            title={expanded ? "Recolher" : "Expandir"}
            className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 outline-none transition-colors hover:border-gray-300 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform duration-200${expanded ? " rotate-180" : ""}`} />
          </button>
        </div>
        {expanded ? (
          <div className="mt-5 space-y-3.5">
            <div>
              <div className="text-label font-medium uppercase tracking-wider text-gray-400">Origem</div>
              <div className="mt-0.5 text-sm text-gray-900">---</div>
            </div>
            <div>
              <div className="text-label font-medium uppercase tracking-wider text-gray-400">Tags</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {student.tags.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-badge font-medium text-gray-700">
                    <TagIcon className="h-3 w-3 text-gray-400" />
                    {t.name}
                  </span>
                ))}
                <button
                  type="button"
                  data-open-sheet="manage-tags"
                  onClick={() => open("tags")}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-badge font-medium text-gray-500 transition-colors hover:border-brand-500/60 hover:text-brand-500"
                >
                  <PlusIcon className="h-3 w-3" />
                  Gerenciar
                </button>
              </div>
            </div>
            <ol className="mt-5 border-t border-gray-100 pt-5">
              <DateItem label="Último acesso" value={student.lastAccess} current />
              <DateItem label="Primeiro acesso" value={student.firstAccess} />
              <DateItem label="Cadastrado em" value={student.created} last />
            </ol>
          </div>
        ) : null}
        <div className="mt-5">
          <span className="tooltip inline-flex" title="Link rápido para o aluno acessar a plataforma sem digitar a senha.">
            <div className="inline-flex cursor-help items-center gap-1 text-label font-medium uppercase tracking-wider text-gray-400">
              Link de login automático
              <InfoIcon className="h-3 w-3" />
            </div>
          </span>
          <div className="mt-1.5">
            <div className="relative w-full">
              <div className="flex h-9 items-center rounded-lg border border-gray-200 bg-gray-50">
                <input
                  readOnly
                  value={student.loginLink}
                  aria-label="Link de login automático"
                  type="text"
                  onClick={copyLink}
                  className="w-full cursor-pointer bg-transparent px-3 text-hint text-gray-600 outline-none"
                />
                <span className="tooltip flex-shrink-0">
                  <button
                    type="button"
                    aria-label="Copiar"
                    title="Copiar"
                    onClick={copyLink}
                    className="flex h-9 w-10 flex-shrink-0 items-center justify-center rounded-r-[calc(var(--radius-lg)-1px)] border-l border-gray-200 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <CopyIcon className="h-4 w-4" />
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 px-1 text-label font-semibold uppercase tracking-wider text-gray-400">Ações</h3>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="divide-y divide-gray-100">
            <Link href={`/dashboard/student/${student.id}/purchases?new=1`} className={ACTION_ROW}>
              <ShoppingCartIcon className="h-4 w-4 flex-shrink-0 text-gray-400 transition-colors group-hover:text-gray-600" />
              <span className="truncate">Adicionar entrega</span>
              <span className="ml-auto flex">
                <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
              </span>
            </Link>
            {/* POST da mesma origem (a rota recusa GET e outros sites); abre a área em outra aba. */}
            <form method="post" action={`/dashboard/student/${student.id}/login-as`} target="_blank">
              <button type="submit" className={ACTION_ROW}>
                <LogInIcon className="h-4 w-4 flex-shrink-0 text-gray-400 transition-colors group-hover:text-gray-600" />
                <span className="truncate">Entrar como o aluno</span>
                <span className="ml-auto flex">
                  <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                </span>
              </button>
            </form>
            {[
              { label: "Reenviar boas-vindas", Icon: SendIcon, d: "resend" as const },
              { label: "Alterar senha", Icon: KeyIcon, d: "password" as const },
            ].map(({ label, Icon, d }) => (
              <button key={d} type="button" onClick={() => open(d)} className={ACTION_ROW}>
                <Icon className="h-4 w-4 flex-shrink-0 text-gray-400 transition-colors group-hover:text-gray-600" />
                <span className="truncate">{label}</span>
                <span className="ml-auto flex">
                  <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {dialog === "edit" ? <EditDrawer student={student} countries={countries} onClose={close} /> : null}
      {dialog === "tags" ? <TagsDrawer student={student} onClose={close} /> : null}

      <PanelDialog open={dialog === "password"} onClose={close} labelledBy={passwordTitle}>
        <DialogHeader id={passwordTitle} title="Alterar senha" onClose={close} />
        <form id="form-aluno-senha" action={(fd) => run(setStudentPasswordAction, fd, { onOk: close })}>
          <ErrorAlert error={error} />
          <input type="hidden" name="id" value={student.id} />
          <div className="min-w-0">
            <div className="painel-linhas">
              <div className="p-5">
                <div className="mb-2 flex items-center gap-1.5">
                  <label htmlFor="aluno-senha" className="text-sm text-gray-700">
                    Nova senha <span className="text-red-500">*</span>
                  </label>
                </div>
                <PasswordInput id="aluno-senha" name="password" />
              </div>
              <div className="p-5">
                <div className="mb-2 flex items-center gap-1.5">
                  <label htmlFor="aluno-senha2" className="text-sm text-gray-700">
                    Repita a nova senha <span className="text-red-500">*</span>
                  </label>
                </div>
                <PasswordInput id="aluno-senha2" name="password2" />
              </div>
            </div>
          </div>
        </form>
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex gap-2">
            <button type="button" onClick={close} className={buttonClass("outline", "grow justify-center")}>
              Cancelar
            </button>
            <button type="submit" form="form-aluno-senha" disabled={pending} className={buttonClass("primary", "grow justify-center")}>
              {pending ? <Spinner /> : <SaveIcon className="h-4 w-4" />}
              Salvar
            </button>
          </div>
        </div>
      </PanelDialog>

      <ConfirmDialog
        open={dialog === "resend"}
        onClose={close}
        tone="brand"
        icon={<SendIcon className="h-5 w-5" />}
        title="Reenviar boas-vindas"
        confirmLabel="Sim, reenviar"
        pending={pending}
        error={error}
        onConfirm={() => run(resendWelcomeAction, { id: student.id }, { onOk: close })}
      >
        Uma nova senha será gerada e enviada para {student.email}. A senha atual deixará de funcionar.
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onClose={close}
        tone="danger"
        icon={<TrashIcon className="h-5 w-5" />}
        title="Excluir aluno"
        confirmLabel="Sim, excluir"
        pending={pending}
        error={error}
        onConfirm={() => run(deleteStudentAction, { id: student.id }, { onOk: () => router.push("/dashboard/students") })}
      >
        Tem certeza que deseja excluir &quot;{student.name}&quot;? O aluno perderá o acesso à plataforma.
      </ConfirmDialog>
      {toast.node}
    </aside>
  );
}
