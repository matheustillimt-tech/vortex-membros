import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/db";
import { AuthShell } from "@/components/auth/auth-shell";
import { authTipClass, authTitleClass } from "@/components/auth/styles";
import { isResetTokenValid } from "@/lib/auth/password-reset";
import { getCachedPlatformSettings } from "@/lib/settings";
import { ExpiredLink, ResetForm } from "./reset-form";

// Link do e-mail de recuperação. O token só é conferido (sem consumir); o envio do formulário o consome.
async function ResetPasswordContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection(); // banco e relógio: só na hora da requisição
  const db = getDb();
  const [settings, valid] = await Promise.all([getCachedPlatformSettings(db), isResetTokenValid(db, token)]);
  return (
    <AuthShell settings={settings}>
      {valid ? (
        <>
          <h4 className={authTitleClass}>Falta pouco</h4>
          <p className={authTipClass}>Defina sua nova senha abaixo</p>
          <ResetForm token={token} />
        </>
      ) : (
        <ExpiredLink />
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense>
      <ResetPasswordContent params={params} />
    </Suspense>
  );
}
