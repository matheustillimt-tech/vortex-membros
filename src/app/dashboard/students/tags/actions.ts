"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { createTag, deleteTag, renameTag } from "@/lib/sales/tags";
import { int, runAdminAction, text, type ActionResult } from "../../action-utils";

/** Tags aparecem na tela Tags, nas entregas (seletor) e nos filtros/perfil dos alunos. */
function revalidateTags() {
  revalidatePath("/dashboard/students/tags");
  revalidatePath("/dashboard/students");
  revalidatePath("/dashboard/student/[id]", "layout");
  revalidatePath("/dashboard/sales/deliveries", "layout");
}
const go = (fn: Parameters<typeof runAdminAction>[0]) => runAdminAction(fn, revalidateTags);

/** Campos: `name`. Devolve o id. Nome repetido (sem diferenciar maiúsculas) é recusado. */
export async function createTagAction(fd: FormData): Promise<ActionResult> {
  return go(async (actor) => ({ id: (await createTag(getDb(), actor, text(fd, "name"), { rejectDuplicate: true })).id }));
}

/** Campos: `id`, `name`. */
export async function renameTagAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => renameTag(getDb(), actor, int(fd, "id"), text(fd, "name")));
}

/** Campos: `id`. Os alunos ficam; só o vínculo com a tag deixa de valer. */
export async function deleteTagAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => deleteTag(getDb(), actor, int(fd, "id")));
}
