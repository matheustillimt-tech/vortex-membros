"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/auth/current-user";
import { blockedByFirstAccessTerms, firstAccessTermsUrl } from "@/lib/catalog/first-access-terms";
import { acceptTerms, termsNextPath } from "@/lib/catalog/terms";

/**
 * "Li e aceito": grava o aceite do aluno da sessão (nunca de um id do form) e volta ao destino
 * (`next`, só caminho interno via safeRedirectPath). Sem termo pendente, só segue para o destino.
 */
export async function acceptTermsAction(fd: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session) redirect("/auth/login");
  const { user } = session;
  const raw = fd.get("productId");
  const productId = typeof raw === "string" && /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(productId)) redirect("/area/vitrine/home");
  const next = fd.get("next");
  const target = termsNextPath(productId, typeof next === "string" ? next : null);
  // Admin "entrando como o aluno" nunca aceita pelo aluno: segue sem gravar.
  if (session.impersonatedBy !== null) redirect(target);
  // Termo de primeiro acesso vem antes de qualquer termo de produto.
  if (await blockedByFirstAccessTerms(getDb(), user)) redirect(firstAccessTermsUrl(target));
  await acceptTerms(getDb(), user, productId);
  redirect(target);
}
