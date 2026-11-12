import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/db";
import { AuthShell } from "@/components/auth/auth-shell";
import { authTipClass, authTitleClass } from "@/components/auth/styles";
import { getCachedPlatformSettings } from "@/lib/settings";
import { ForgotForm } from "./forgot-form";

// Página pública (fora do matcher do proxy). URL: /auth/esqueci_minha_senha.
async function ForgotPasswordContent() {
  await connection(); // configurações vêm do banco: só na hora da requisição
  const settings = await getCachedPlatformSettings(getDb());
  return (
    <AuthShell settings={settings}>
      <h4 className={authTitleClass}>Esqueceu sua senha?</h4>
      <p className={authTipClass}>
        Preencha abaixo seu endereço de e-mail para receber as instruções necessárias e criar uma nova senha
      </p>
      <ForgotForm />
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordContent />
    </Suspense>
  );
}
