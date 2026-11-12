"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/auth/current-user";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { acceptFirstAccessTerms, firstAccessTermsUrl } from "@/lib/catalog/first-access-terms";

/**
 * "Li e aceito" do termo de primeiro acesso: grava o aceite (aluno da sessão, versão `hash` que ele
 * viu) e segue para `next` (só caminho interno). Se o texto mudou nesse meio tempo, volta à tela do termo.
 */
export async function acceptFirstAccessTermsAction(fd: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session) redirect("/auth/login");
  const { user } = session;
  const hash = fd.get("hash");
  const next = safeRedirectPath(typeof fd.get("next") === "string" ? (fd.get("next") as string) : null);
  // Admin "entrando como o aluno" nunca dá o consentimento pelo aluno: segue sem gravar.
  if (session.impersonatedBy !== null) redirect(next);
  const ok = typeof hash === "string" && (await acceptFirstAccessTerms(getDb(), user, hash));
  redirect(ok ? next : firstAccessTermsUrl(next));
}
