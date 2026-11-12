"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PasswordField } from "@/components/auth/password-field";
import { authAlertClass, authButtonClass, authFooterLinkWrapClass, authLinkClass } from "@/components/auth/styles";
import { resetPasswordAction, type ResetState } from "./actions";

export const LINK_EXPIRED = "Este link expirou ou já foi usado.";

export function ExpiredLink() {
  return (
    <div className="pt-6">
      <p role="alert" className={authAlertClass}>
        {LINK_EXPIRED}
      </p>
      <p className={authFooterLinkWrapClass}>
        <Link href="/auth/esqueci_minha_senha" className={authLinkClass}>
          Pedir novo link
        </Link>
      </p>
    </div>
  );
}

// Textos: "Nova senha", "Repita a senha" (com olho) e "Alterar senha".
export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  if (state.expired) return <ExpiredLink />;

  return (
    <form action={action} className="m-0 pt-6">
      {state.error && (
        <p role="alert" className={authAlertClass}>
          {state.error}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <div className="pb-6">
        <PasswordField id="reset-senha" name="senha" label="Nova senha" autoComplete="new-password" autoFocus />
      </div>
      <div className="pb-6">
        <PasswordField id="reset-senha-2" name="senha_2" label="Repita a senha" autoComplete="new-password" />
      </div>
      <div className="flex justify-center">
        <button type="submit" disabled={pending} aria-busy={pending} className={authButtonClass}>
          Alterar senha
        </button>
      </div>
    </form>
  );
}
