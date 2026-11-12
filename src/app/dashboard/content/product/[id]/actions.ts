"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import * as content from "@/lib/admin/content";
import { BadRequest, BAD_REQUEST, ids, int, runAdminAction as run, text, type ActionResult } from "../../../action-utils";

// Ações do produto em si (renomear, status, duplicar, excluir) ficam em ../../products/actions.ts.

/** Campos: `productId`. Produto, módulos e aulas → publicados. */
export async function publishAllAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.publishAll(getDb(), actor, int(fd, "productId")));
}

// ---------- módulos ----------

/** Campos: `productId`, `title`. */
export async function createModuleAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.createModule(getDb(), actor, { productId: int(fd, "productId"), title: text(fd, "title") }));
}

/** Campos: `id`, `title`. */
export async function renameModuleAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.updateModule(getDb(), actor, int(fd, "id"), { title: text(fd, "title") }));
}

/** Campos: `id`, `status` ("published" | "hidden"). */
export async function setModuleStatusAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.updateModule(getDb(), actor, int(fd, "id"), { status: text(fd, "status") as "published" }));
}

/** Campos: `id`, `coverUrl` (vazio = remover). */
export async function setModuleCoverAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.updateModule(getDb(), actor, int(fd, "id"), { coverUrl: text(fd, "coverUrl") }));
}

export async function trashModuleAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.trashModule(getDb(), actor, int(fd, "id")));
}

export async function restoreModuleAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.restoreModule(getDb(), actor, int(fd, "id")));
}

// ---------- aulas ----------

/** Campos: `moduleId`, `title`. */
export async function createLessonAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.createLesson(getDb(), actor, { moduleId: int(fd, "moduleId"), title: text(fd, "title") }));
}

/** Campos: `id`, `title`. */
export async function renameLessonAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.updateLesson(getDb(), actor, int(fd, "id"), { title: text(fd, "title") }));
}

/** Campos: `id`, `status` ("published" | "hidden"). */
export async function setLessonStatusAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.updateLesson(getDb(), actor, int(fd, "id"), { status: text(fd, "status") as "published" }));
}

/** Campos: `id`, `thumbnailUrl` (vazio = remover). */
export async function setLessonThumbnailAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.updateLesson(getDb(), actor, int(fd, "id"), { thumbnailUrl: text(fd, "thumbnailUrl") }));
}

export async function trashLessonAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.trashLesson(getDb(), actor, int(fd, "id")));
}

export async function restoreLessonAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.restoreLesson(getDb(), actor, int(fd, "id")));
}

// ---------- ordem ----------

/** Campos: `kind` ("module" | "lesson"), `parentId` (produto ou módulo), `ids` ("1,2,3"). */
export async function reorderTreeAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const kind = text(fd, "kind");
    if (kind !== "module" && kind !== "lesson") throw new BadRequest(BAD_REQUEST);
    await content.reorder(getDb(), actor, kind, int(fd, "parentId"), ids(fd, "ids"));
  });
}

/** Aula para outro módulo do mesmo produto. Campos: `id`, `moduleId`, `position`. */
export async function moveLessonAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.moveLesson(getDb(), actor, int(fd, "id"), int(fd, "moduleId"), int(fd, "position")));
}

/**
 * "Excluir" no cabeçalho do produto. Campos: `id`. Em caso de sucesso redireciona para a tela
 * Produtos no próprio servidor (a página do produto excluído viraria 404 ao revalidar).
 */
export async function trashProductAndLeaveAction(fd: FormData): Promise<ActionResult> {
  const res = await run((actor) => content.trashProduct(getDb(), actor, int(fd, "id")));
  if (res.ok) redirect("/dashboard/content/products");
  return res;
}
