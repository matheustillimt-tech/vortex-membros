"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { Address } from "@/db/schema";
import { alertClass, primaryButtonClass as buttonClass, statusClass } from "@/components/area/form-styles";
import { FingerprintIcon, UploadIcon } from "@/components/area/icons";
import { changePasswordAction, removeAvatarAction, updateProfileAction, uploadAvatarAction, type ProfileState } from "./actions";

export type ProfileFormProps = {
  values: { name: string; email: string; document: string; phone: string; address: Address };
  canEditNameAndDocument: boolean;
  canEditEmail: boolean;
  showDocument: boolean;
  showAddress: boolean;
  showPhone: boolean;
  /** Coluna da esquerda do bloco de dados (foto). */
  aside?: React.ReactNode;
};

function Feedback({ state }: { state: ProfileState }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className={statusClass}>
      {state.message}
    </p>
  ) : (
    <p role="alert" className={alertClass}>
      {state.error}
    </p>
  );
}

function Field(props: {
  label: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
  type?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  prefix?: React.ReactNode;
}) {
  const { label, className, prefix, ...input } = props;
  return (
    <label className={`vx-conta-field ${className ?? ""}`}>
      <span>{label}</span>
      <span className="relative block">
        {prefix}
        <input {...input} type={input.type ?? "text"} className={prefix ? "vx-conta-input--dial" : undefined} />
      </span>
    </label>
  );
}

/**
 * Dados e endereço. Não há botão: cada campo salva ao sair dele
 * (evento change do formulário), com um aviso discreto no canto.
 */
export function ProfileForm(p: ProfileFormProps) {
  const [state, setState] = useState<ProfileState>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const v = p.values;
  const a = v.address;

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const save = () => {
      const data = new FormData(form);
      startTransition(async () => setState(await updateProfileAction(null, data)));
    };
    form.addEventListener("change", save);
    return () => form.removeEventListener("change", save);
  }, []);

  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => setState(null), 2500);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} aria-busy={pending}>
      {state && !state.ok && (
        <div className="mb-6">
          <Feedback state={state} />
        </div>
      )}
      <div className="vx-conta-split">
        <div className="vx-conta-aside text-center">{p.aside}</div>
        <div className="vx-conta-main vx-conta-stack">
          <Field label="Nome" name="name" autoComplete="name" defaultValue={v.name} disabled={!p.canEditNameAndDocument} />
          <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={v.email} disabled={!p.canEditEmail} />
          {(p.showDocument || p.showPhone) && (
            <div className="vx-conta-cols">
              {p.showDocument && (
                <Field label="CPF ou CNPJ" name="document" inputMode="numeric" autoComplete="off" defaultValue={v.document} disabled={!p.canEditNameAndDocument} />
              )}
              {p.showPhone && (
                <Field
                  label="Celular"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  defaultValue={v.phone}
                  placeholder="Não Informado"
                  prefix={
                    <span aria-hidden className="vx-conta-dial">
                      <svg viewBox="0 0 20 14" className="vx-conta-flag">
                        <rect width="20" height="14" fill="#009c3b" />
                        <path d="M10 1.6 18.2 7 10 12.4 1.8 7z" fill="#ffdf00" />
                        <circle cx="10" cy="7" r="3.2" fill="#002776" />
                      </svg>
                      +55
                      <span className="vx-conta-dial-arrow" />
                    </span>
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
      {p.showAddress && (
        <>
          <hr className="vx-conta-hr vx-conta-hr--wide" />
          <div className="vx-conta-split">
            <div className="vx-conta-aside">
              <h2 className="vx-conta-subtitle">Meu endereço</h2>
            </div>
            <div className="vx-conta-main vx-conta-main--offset vx-conta-stack">
              <div className="vx-conta-grid">
                <Field className="vx-c4-md" label="CEP" name="address.cep" inputMode="numeric" autoComplete="postal-code" defaultValue={a.cep} />
              </div>
              <div className="vx-conta-grid">
                <Field className="vx-c8" label="Endereço" name="address.street" autoComplete="address-line1" defaultValue={a.street} />
                <Field className="vx-c4" label="Número" name="address.number" autoComplete="off" defaultValue={a.number} />
              </div>
              <div className="vx-conta-grid">
                <Field className="vx-c6" label="Complemento" name="address.complement" autoComplete="address-line2" defaultValue={a.complement} />
                <Field className="vx-c6" label="Referência" name="address.reference" autoComplete="off" defaultValue={a.reference} />
              </div>
              <div className="vx-conta-grid">
                <Field className="vx-c5" label="Bairro" name="address.district" autoComplete="address-level3" defaultValue={a.district} />
                <Field className="vx-c5" label="Cidade" name="address.city" autoComplete="address-level2" defaultValue={a.city} />
                <Field className="vx-c2" label="Estado" name="address.state" autoComplete="address-level1" defaultValue={a.state} />
              </div>
            </div>
          </div>
        </>
      )}
      {state?.ok && (
        <p role="status" className="vx-conta-toast">
          {state.message}
        </p>
      )}
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(changePasswordAction, null);
  const [mismatch, setMismatch] = useState(false);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        if (fd.get("next") !== fd.get("confirm")) {
          e.preventDefault(); // não chama o servidor
          setMismatch(true);
        } else setMismatch(false);
      }}
      className="vx-conta-stack"
    >
      {mismatch ? (
        <p role="alert" className={alertClass}>
          As senhas não conferem.
        </p>
      ) : (
        state && !state.ok && <Feedback state={state} />
      )}
      <label className="vx-conta-field">
        <span>Senha atual</span>
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label className="vx-conta-field">
        <span>Nova senha</span>
        <input name="next" type="password" autoComplete="new-password" minLength={6} required />
      </label>
      <label className="vx-conta-field">
        <span>Confirmar nova senha</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={6} required />
      </label>
      <button type="submit" disabled={pending} className={`${buttonClass} w-fit`}>
        {pending ? "Alterando..." : "Alterar senha"}
      </button>
    </form>
  );
}

/** "Alterar senha" no topo do cartão: abre uma janela com o formulário. */
export function PasswordDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [round, setRound] = useState(0);
  const [saved, setSaved] = useState(false);
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className="vx-conta-btn" onClick={() => { setSaved(false); setRound((r) => r + 1); ref.current?.showModal(); }}>
        <FingerprintIcon className="size-[13px]" />
        Alterar senha
      </button>
      <dialog ref={ref} className="vx-conta-dialog" aria-labelledby="alterar-senha-titulo" onClick={(e) => e.target === ref.current && close()}>
        <div className="vx-conta-head">
          <h2 id="alterar-senha-titulo">Alterar senha</h2>
          <button type="button" onClick={close} aria-label="Fechar" className="vx-conta-btn vx-conta-btn--icon">
            ×
          </button>
        </div>
        <hr className="vx-conta-hr" />
        <PasswordForm key={round} onDone={() => { setSaved(true); close(); }} />
      </dialog>
      {saved && (
        <p role="status" className="vx-conta-toast">
          Senha alterada.
        </p>
      )}
    </>
  );
}

/** Foto de Minha conta: "Enviar" (JPEG ou PNG até 1 MB) e, com foto, a imagem redonda e "Remover". */
export function AvatarUpload({ url }: { url: string | null }) {
  const [current, setCurrent] = useState(url);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const send = (file: File) => {
    if (file.size > 1024 * 1024) return setError("Arquivo maior que 1 MB.");
    const data = new FormData();
    data.set("avatar", file);
    startTransition(async () => {
      const r = await uploadAvatarAction(data);
      if (r.ok) { setCurrent(r.url); setError(null); } else setError(r.error);
    });
  };
  const remove = () =>
    startTransition(async () => {
      const r = await removeAvatarAction();
      if (r.ok) { setCurrent(null); setError(null); } else setError(r.error);
    });
  return (
    <div className="inline-flex flex-col items-center" aria-busy={pending}>
      {current && <img src={current} alt="Sua foto" className="vx-conta-photo" />}
      <div className="flex justify-center gap-2 py-4">
        <label className={`vx-conta-btn relative ${pending ? "opacity-60" : ""}`}>
          <UploadIcon className="size-[13px]" />
          {pending ? "Enviando..." : "Enviar"}
          <input
            type="file"
            accept="image/jpeg,image/png"
            disabled={pending}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) send(f); }}
          />
        </label>
        {current && (
          <button type="button" onClick={remove} disabled={pending} className="vx-conta-btn">
            Remover
          </button>
        )}
      </div>
      <small className="vx-conta-hint">
        até <b>1mb</b>, formatos aceitos: <b>jpeg</b> ou <b>png</b>
      </small>
      {error && (
        <p role="alert" className="mt-2 text-fine text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
