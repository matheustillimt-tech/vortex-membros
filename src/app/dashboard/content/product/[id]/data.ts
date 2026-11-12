import { cache } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getProductSettingsForEdit, getProductTree } from "@/lib/admin/content";
import { AdminError } from "@/lib/admin/errors";
import { getProductSchedule } from "@/lib/admin/schedules";
import { getAdmin } from "../../../data";

/** `[id]` da URL → número (só dígitos); senão 404. */
export function parseProductId(raw: string): number {
  const n = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n)) notFound();
  return n;
}

/** Árvore do produto, uma vez por requisição (layout + página). Excluído/inexistente → 404. */
export const getProductTreeForPage = cache(async (id: number) => {
  const user = await getAdmin();
  try {
    return await getProductTree(getDb(), user, id);
  } catch (e) {
    if (e instanceof AdminError) notFound();
    throw e;
  }
});

/** Configurações do produto para as telas Geral/Página do produto/Página da aula/Termo. */
export const getProductSettingsForPage = cache(async (id: number) => {
  const user = await getAdmin();
  try {
    return await getProductSettingsForEdit(getDb(), user, id);
  } catch (e) {
    if (e instanceof AdminError) notFound();
    throw e;
  }
});

/** Programação ativa do produto + regras (aba Conteúdo programado e botão do cabeçalho). */
export const getProductScheduleForPage = cache(async (id: number) => {
  const user = await getAdmin();
  try {
    return await getProductSchedule(getDb(), user, id);
  } catch (e) {
    if (e instanceof AdminError) notFound();
    throw e;
  }
});
