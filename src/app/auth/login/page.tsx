import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/db";
import { AuthShell } from "@/components/auth/auth-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getCachedPlatformSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";

type SP = { [key: string]: string | string[] | undefined };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function LoginContent({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const login_token = first(sp.login_token);
  const redirectParam = first(sp.redirect);

  // Link antigo enviado por e-mail: /auth/login?login_token=... continua funcionando
  if (login_token) {
    const qs = new URLSearchParams({ login_token });
    if (redirectParam) qs.set("redirect", redirectParam);
    redirect(`/auth/token?${qs.toString()}`);
  }

  const target = safeRedirectPath(redirectParam);
  await connection(); // configurações e sessão vêm do banco: só na hora da requisição
  const [user, settings] = await Promise.all([getCurrentUser(), getCachedPlatformSettings(getDb())]);
  if (user) redirect(target);

  return (
    <AuthShell settings={settings}>
      <LoginForm
        redirectTo={target}
        linkInvalido={first(sp.link) === "invalido"}
        senhaRedefinida={first(sp.senha) === "redefinida"}
      />
    </AuthShell>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
