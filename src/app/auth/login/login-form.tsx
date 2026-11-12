"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PasswordField } from "@/components/auth/password-field";
import {
  authAlertClass, authButtonClass, authFooterLinkWrapClass, authInputClass, authLabelClass, authLinkClass, authNoticeClass,
} from "@/components/auth/styles";
import { loginAction, newLoginLinkAction, type LoginState } from "./actions";

const LINK_EXPIRED = "Seu link expirou. Entre com e-mail e senha ou peça um novo link.";
const PASSWORD_RESET = "Senha alterada. Entre com a nova senha.";

// Um só estado para os dois botões: "Entrar" e, com o link vencido, "Enviar novo link".
function submit(prev: LoginState, formData: FormData): Promise<LoginState> {
  return formData.get("intent") === "novo-link" ? newLoginLinkAction(prev, formData) : loginAction(prev, formData);
}

export function LoginForm({
  redirectTo,
  linkInvalido,
  senhaRedefinida,
}: {
  redirectTo: string;
  linkInvalido: boolean;
  senhaRedefinida: boolean;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(submit, {});
  const touched = state.error !== undefined || state.notice !== undefined;
  const error = state.error ?? (!touched && linkInvalido ? LINK_EXPIRED : null);
  const notice = state.notice ?? (!touched && senhaRedefinida ? PASSWORD_RESET : null);
  const offerNewLink = linkInvalido && state.notice === undefined;

  return (
    <form action={action} className="m-0 pt-6">
      {error && (
        <p role="alert" className={authAlertClass}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={authNoticeClass}>
          {notice}
        </p>
      )}
      <input type="hidden" name="redirect" value={redirectTo} />

      <div>
        <label htmlFor="login-email" className={authLabelClass}>
          E-mail
        </label>
        <input
          // key força o React a aplicar o novo defaultValue após uma tentativa com erro
          key={state.email ?? ""}
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          required
          defaultValue={state.email ?? ""}
          className={authInputClass}
        />
      </div>

      <div className="py-6">
        <PasswordField id="login-password" name="password" label="Senha" autoComplete="current-password" />
      </div>

      <div className="flex justify-center pb-6">
        <label className="flex min-h-[30px] cursor-pointer items-end gap-[5px] text-[12px] leading-[18px] text-[#c1c1c1]">
          <span className="relative mb-px flex size-5 shrink-0">
            <input
              name="remember"
              type="checkbox"
              className="peer m-0 size-5 cursor-pointer appearance-none rounded-[4px] border border-solid border-[#1f2223] bg-[#111213] checked:border-accent checked:bg-accent"
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 m-auto hidden size-3 peer-checked:block"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          Lembrar de mim
        </label>
      </div>

      <div className="flex justify-center">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={authButtonClass}
        >
          Entrar
        </button>
      </div>

      {offerNewLink && (
        <p className={authFooterLinkWrapClass}>
          <button
            type="submit"
            name="intent"
            value="novo-link"
            formNoValidate
            disabled={pending}
            className={`${authLinkClass} cursor-pointer border-0 bg-transparent p-0 disabled:cursor-wait`}
          >
            Enviar novo link
          </button>
        </p>
      )}

      <p className={authFooterLinkWrapClass}>
        <Link href="/auth/esqueci_minha_senha" className={authLinkClass}>
          Esqueceu sua senha?
        </Link>
      </p>
    </form>
  );
}
