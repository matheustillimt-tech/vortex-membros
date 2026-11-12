"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  authAlertClass, authButtonClass, authFooterLinkWrapClass, authInputClass, authLabelClass, authLinkClass, authNoticeClass,
} from "@/components/auth/styles";
import { forgotPasswordAction, type ForgotState } from "./actions";

const SENT = "Se este e-mail estiver cadastrado, você vai receber as instruções em instantes. Confira também a caixa de spam.";

// Textos: campo "E-mail", botão "Recuperar minha senha", "Voltar ao login".
export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPasswordAction, {});

  return (
    <form action={action} className="m-0 pt-6">
      {state.error && (
        <p role="alert" className={authAlertClass}>
          {state.error}
        </p>
      )}
      {state.sent ? (
        <p role="status" className={authNoticeClass}>
          {SENT}
        </p>
      ) : (
        <>
          <div className="pb-6">
            <label htmlFor="forgot-email" className={authLabelClass}>
              E-mail
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              autoFocus
              className={authInputClass}
            />
          </div>
          <div className="flex justify-center">
            <button type="submit" disabled={pending} aria-busy={pending} className={authButtonClass}>
              Recuperar minha senha
            </button>
          </div>
        </>
      )}

      <p className={authFooterLinkWrapClass}>
        <Link href="/auth/login" className={authLinkClass}>
          Voltar ao login
        </Link>
      </p>
    </form>
  );
}
