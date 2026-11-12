"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  removeAdministratorAction,
  resendAccessAction,
  setAdministratorPasswordAction,
  updateAdministratorAction,
} from "@/app/dashboard/settings/administrators/actions";
import { avatarColor, ErrorAlert, FieldRow, initial } from "./administrators-board";
import { buttonClass } from "./button";
import { ArrowLeftIcon, ChevronRightIcon, EyeIcon, EyeOffIcon, KeyIcon, PencilIcon, SaveIcon, SendIcon, TrashIcon, XIcon } from "./icons";
import { INPUT_CLASS } from "./input";
import { DialogHeader, PanelDialog, Spinner } from "./panel-dialog";
import { useAdminAction } from "./use-admin-action";

export type DateLabel = { long: string; relative: string; title: string };
export type AdministratorProfileData = {
  id: number;
  name: string;
  email: string;
  document: string | null;
  phone: string | null;
  roleLabel: string;
  lastAccess: DateLabel | null;
  created: DateLabel;
};

type Dialog = "edit" | "password" | "resend" | "delete" | null;

const ICON_BUTTON = "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors";
const ACTION_ROW =
  "group flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-hidden focus-visible:bg-gray-50";

function FormFooter({ formId, pending, onCancel }: { formId: string; pending: boolean; onCancel: () => void }) {
  return (
    <div className="border-t border-gray-100 px-5 py-4">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className={buttonClass("outline", "w-full justify-center")}>
          <XIcon className="h-4 w-4" />
          Cancelar
        </button>
        <button type="submit" form={formId} disabled={pending} className={buttonClass("primary", "w-full justify-center")}>
          {pending ? <Spinner /> : <SaveIcon className="h-4 w-4" />}
          Salvar
        </button>
      </div>
    </div>
  );
}

function PasswordInput({ id, name }: { id: string; name: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative w-full">
      <input
        name={name}
        id={id}
        required
        autoComplete="new-password"
        placeholder="••••••••"
        type={shown ? "text" : "password"}
        className={`${INPUT_CLASS} pr-10`}
      />
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

function ConfirmDialog({
  open,
  onClose,
  tone,
  title,
  children,
  confirmLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  tone: "brand" | "danger";
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const danger = tone === "danger";
  return (
    <PanelDialog open={open} onClose={onClose} labelledBy={titleId}>
      <div className="p-5">
        <div className="flex gap-4">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-50" : "bg-brand-50"}`}>
            {danger ? <TrashIcon className="h-5 w-5 text-red-500" /> : <SendIcon className="h-5 w-5 text-brand-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="mb-1 text-base font-semibold text-gray-900">
              {title}
            </h3>
            <p className="text-sm text-gray-500">{children}</p>
          </div>
        </div>
        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-hint text-red-700">
            {error}
          </div>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className={buttonClass("outline", "w-full justify-center")}>
            <XIcon className="h-4 w-4" />
            Não, cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={
              danger
                ? "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-red-500 px-4 py-2 text-hint font-medium text-white shadow-sm transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                : buttonClass("primary", "w-full justify-center")
            }
          >
            {pending ? <Spinner /> : danger ? <TrashIcon className="h-4 w-4" /> : <SendIcon className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </PanelDialog>
  );
}

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
          <div className="mt-0.5 text-hint leading-snug text-gray-700">Nunca</div>
        )}
      </div>
    </li>
  );
}

/** Página do administrador: cartão do perfil, "Ações" e os modais. */
export function AdministratorProfile({ admin }: { admin: AdministratorProfileData }) {
  const router = useRouter();
  const { pending, error, setError, run } = useAdminAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const open = (d: Dialog) => {
    setError(null);
    setDialog(d);
  };
  const close = () => setDialog(null);
  const editTitle = useId();
  const passwordTitle = useId();
  const color = avatarColor(admin.email);

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 sm:mt-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div>
          <aside className="space-y-6">
            <div className="relative rounded-lg border border-gray-200 bg-white p-6">
              <Link
                href="/dashboard/settings/administrators"
                data-navega=""
                className="absolute left-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-hint font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Voltar
              </Link>
              <div className="absolute right-3 top-3 flex items-center gap-1">
                <span className="tooltip">
                  <button
                    type="button"
                    onClick={() => open("delete")}
                    aria-label="Excluir administrador"
                    title="Excluir administrador"
                    className={`${ICON_BUTTON} border-transparent text-red-600 hover:bg-red-50 hover:text-red-700`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </span>
                <span className="tooltip">
                  <button
                    type="button"
                    data-open-modal="admin-edit"
                    onClick={() => open("edit")}
                    aria-label="Editar perfil"
                    title="Editar perfil"
                    className={`${ICON_BUTTON} border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900`}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                </span>
              </div>
              <div className="flex flex-col items-center pt-8 text-center">
                <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-full bg-gray-200/60">
                  <div className="flex h-full w-full items-center justify-center">
                    <div className={`flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full text-2xl font-semibold ${color}`}>
                      <span>{initial(admin.name)}</span>
                    </div>
                  </div>
                </div>
                <h2 className="mt-4 text-lg font-semibold leading-snug text-gray-900">{admin.name}</h2>
                <p className="mt-1.5 break-all text-hint text-gray-400">{admin.email}</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="selo selo--brand">{admin.roleLabel}</span>
                </div>
              </div>
              <ol className="mt-6 border-t border-gray-100 pt-5">
                <DateItem label="Último acesso" value={admin.lastAccess} current />
                <DateItem label="Criado em" value={admin.created} last />
              </ol>
            </div>
            <div>
              <h3 className="mb-2 px-1 text-label font-semibold uppercase tracking-wider text-gray-400">Ações</h3>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="divide-y divide-gray-100">
                  {[
                    { label: "Alterar senha", Icon: KeyIcon, d: "password" as const },
                    { label: "Reenviar acesso", Icon: SendIcon, d: "resend" as const },
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
          </aside>
        </div>
      </div>

      <PanelDialog open={dialog === "edit"} onClose={close} widthClass="sm:max-w-md" labelledBy={editTitle}>
        <DialogHeader id={editTitle} title="Editar perfil" onClose={close} />
        <form id="form-admin-edit" action={(fd) => run(updateAdministratorAction, fd, { onOk: close })}>
          <ErrorAlert error={error} />
          <input type="hidden" name="id" value={admin.id} />
          <div className="min-w-0">
            <div className="painel-linhas">
              <FieldRow label="Nome" required htmlFor="admin-nome">
                <input type="text" name="name" id="admin-nome" required maxLength={200} defaultValue={admin.name} placeholder="Nome completo" className={INPUT_CLASS} />
              </FieldRow>
              <FieldRow label="E-mail" required htmlFor="admin-email">
                <input type="email" name="email" id="admin-email" required maxLength={254} defaultValue={admin.email} placeholder="email@exemplo.com" className={INPUT_CLASS} />
              </FieldRow>
              <FieldRow label="CPF" htmlFor="admin-doc">
                <input type="text" name="document" id="admin-doc" maxLength={50} defaultValue={admin.document ?? ""} placeholder="Opcional" className={INPUT_CLASS} />
              </FieldRow>
              <FieldRow label="Celular" htmlFor="admin-celular">
                <input type="text" name="phone" id="admin-celular" maxLength={50} defaultValue={admin.phone ?? ""} placeholder="Opcional" className={INPUT_CLASS} />
              </FieldRow>
            </div>
          </div>
        </form>
        <FormFooter formId="form-admin-edit" pending={pending} onCancel={close} />
      </PanelDialog>

      <PanelDialog open={dialog === "password"} onClose={close} labelledBy={passwordTitle}>
        <DialogHeader id={passwordTitle} title="Alterar senha" onClose={close} />
        <form id="form-admin-password" action={(fd) => run(setAdministratorPasswordAction, fd, { onOk: close })}>
          <ErrorAlert error={error} />
          <input type="hidden" name="id" value={admin.id} />
          <div className="min-w-0">
            <div className="painel-linhas">
              <FieldRow label="Nova senha" required htmlFor="admin-senha">
                <PasswordInput id="admin-senha" name="password" />
              </FieldRow>
              <FieldRow label="Repita a nova senha" required htmlFor="admin-senha2">
                <PasswordInput id="admin-senha2" name="password2" />
              </FieldRow>
            </div>
          </div>
        </form>
        <FormFooter formId="form-admin-password" pending={pending} onCancel={close} />
      </PanelDialog>

      <ConfirmDialog
        open={dialog === "resend"}
        onClose={close}
        tone="brand"
        title="Reenviar acesso"
        confirmLabel="Reenviar"
        pending={pending}
        error={error}
        onConfirm={() => run(resendAccessAction, { id: admin.id }, { onOk: close })}
      >
        Gerar uma nova senha para <strong>{admin.name}</strong> e enviá-la por e-mail? A senha atual deixará de funcionar.
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onClose={close}
        tone="danger"
        title="Excluir administrador"
        confirmLabel="Sim, excluir"
        pending={pending}
        error={error}
        onConfirm={() =>
          run(removeAdministratorAction, { id: admin.id }, { onOk: () => router.push("/dashboard/settings/administrators") })
        }
      >
        Tem certeza que deseja remover <strong>{admin.name}</strong>? Ele perderá imediatamente o acesso à plataforma.
      </ConfirmDialog>
    </div>
  );
}
