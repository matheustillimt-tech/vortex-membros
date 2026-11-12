"use server";

import { getDb } from "@/db";
import * as content from "@/lib/admin/content";
import { BadRequest, BAD_REQUEST, ids, int, optionalInt, runAdminAction as run, text, type ActionResult } from "../../action-utils";

export type { ActionResult };

// ---------- vitrines ----------

/** Campos: `name`, `parentId` (opcional → subvitrine). */
export async function createShowcaseAction(fd: FormData): Promise<ActionResult> {
  return run((actor) =>
    content.createShowcase(getDb(), actor, { name: text(fd, "name"), parentId: optionalInt(fd, "parentId") }),
  );
}

/** Campos: `id`, `name`. */
export async function renameShowcaseAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.updateShowcase(getDb(), actor, int(fd, "id"), { name: text(fd, "name") }));
}

/** Campos: `id`, `status` ("published" | "unlisted"; validado na camada de dados). */
export async function setShowcaseStatusAction(fd: FormData): Promise<ActionResult> {
  return run((actor) =>
    content.updateShowcase(getDb(), actor, int(fd, "id"), { status: text(fd, "status") as "published" }),
  );
}

export async function duplicateShowcaseAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.duplicateShowcase(getDb(), actor, int(fd, "id")));
}

export async function trashShowcaseAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.trashShowcase(getDb(), actor, int(fd, "id")));
}

export async function restoreShowcaseAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.restoreShowcase(getDb(), actor, int(fd, "id")));
}

// ---------- produtos ----------

/** Campos: `showcaseId`, `name`. */
export async function createProductAction(fd: FormData): Promise<ActionResult> {
  return run((actor) =>
    content.createProduct(getDb(), actor, { showcaseId: int(fd, "showcaseId"), name: text(fd, "name") }),
  );
}

/** Campos: `id`, `name`. */
export async function renameProductAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.updateProduct(getDb(), actor, int(fd, "id"), { name: text(fd, "name") }));
}

/** Campos: `id`, `status` ("published" | "hidden"). */
export async function setProductStatusAction(fd: FormData): Promise<ActionResult> {
  return run((actor) =>
    content.updateProduct(getDb(), actor, int(fd, "id"), { status: text(fd, "status") as "published" }),
  );
}

/** Campos: `id`, `thumbnailUrl` (vazio = remover; validado com safeImageUrl). */
export async function setProductImageAction(fd: FormData): Promise<ActionResult> {
  return run((actor) =>
    content.updateProduct(getDb(), actor, int(fd, "id"), { thumbnailUrl: text(fd, "thumbnailUrl") }),
  );
}

/** Campos: `id`, `targetShowcaseId` (opcional → "Duplicar para…"). */
export async function duplicateProductAction(fd: FormData): Promise<ActionResult> {
  return run((actor) =>
    content.duplicateProduct(getDb(), actor, int(fd, "id"), optionalInt(fd, "targetShowcaseId") ?? undefined),
  );
}

export async function trashProductAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.trashProduct(getDb(), actor, int(fd, "id")));
}

export async function restoreProductAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => content.restoreProduct(getDb(), actor, int(fd, "id")));
}

// ---------- ordem ----------

/** Campos: `kind` ("showcase" | "product"), `parentId` (vazio = vitrines de topo), `ids` ("1,2,3"). */
export async function reorderAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const kind = text(fd, "kind");
    if (kind !== "showcase" && kind !== "product") throw new BadRequest(BAD_REQUEST);
    await content.reorder(getDb(), actor, kind, optionalInt(fd, "parentId"), ids(fd, "ids"));
  });
}

/** Arrastar produto para outra vitrine. Campos: `id`, `showcaseId`, `position`. */
export async function moveProductAction(fd: FormData): Promise<ActionResult> {
  return run((actor) =>
    content.moveProduct(getDb(), actor, int(fd, "id"), int(fd, "showcaseId"), int(fd, "position")),
  );
}
