"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import * as content from "@/lib/admin/content";
import { parseEditorData } from "@/lib/content/editorjs";
import { BadRequest, BAD_REQUEST, int, runAdminAction as run, text, type ActionResult } from "../../../../../action-utils";

/**
 * Salvar a aula. Campos: `productId`, `id`, `title`, `videoUrl`, `format` ("standard" | "live"), `liveUrl`,
 * `summary`, `thumbnailUrl` e `blocks` (JSON do Editor.js; ausente = conteúdo não muda).
 * O `contentHtml` é gerado no servidor a partir dos blocos (updateLesson → blocksToHtml).
 */
export async function saveLessonAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const db = getDb();
    const productId = int(fd, "productId");
    const id = int(fd, "id");
    await content.getLessonForEdit(db, actor, productId, id); // a aula precisa ser deste produto
    const rawBlocks = fd.get("blocks");
    let contentBlocks: content.LessonPatch["contentBlocks"];
    if (typeof rawBlocks === "string") {
      const data = parseEditorData(rawBlocks);
      if (!data) throw new BadRequest(BAD_REQUEST);
      contentBlocks = data;
    }
    const format = text(fd, "format") || "standard";
    await content.updateLesson(db, actor, id, {
      title: text(fd, "title"),
      videoUrl: text(fd, "videoUrl"),
      format: format as "standard",
      liveUrl: format === "live" ? text(fd, "liveUrl") : undefined,
      summary: text(fd, "summary"),
      thumbnailUrl: text(fd, "thumbnailUrl"),
      ...(contentBlocks !== undefined ? { contentBlocks } : {}),
    });
  });
}

/** "Criar nova aula": no mesmo módulo da aula atual. Campos: `productId`, `id`. Devolve o id novo. */
export async function createSiblingLessonAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const db = getDb();
    const current = await content.getLessonForEdit(db, actor, int(fd, "productId"), int(fd, "id"));
    return content.createLesson(db, actor, { moduleId: current.moduleId, title: "Nova aula" });
  });
}

/** Excluir pelo editor: vai para a lixeira e volta para a aba Aulas. Campos: `productId`, `id`. */
export async function trashLessonAndLeaveAction(fd: FormData): Promise<ActionResult> {
  let productId = 0;
  const res = await run(async (actor) => {
    const db = getDb();
    productId = int(fd, "productId");
    const id = int(fd, "id");
    await content.getLessonForEdit(db, actor, productId, id);
    await content.trashLesson(db, actor, id);
  });
  if (res.ok) redirect(`/dashboard/content/product/${productId}`);
  return res;
}
