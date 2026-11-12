"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb } from "@/db";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeErrorSummary } from "@/lib/log";
import { createImport, getImportErrors, IMPORT_UPLOAD_MAX_BYTES, IMPORT_UPLOAD_TOO_BIG, restoreImport, trashImport } from "@/lib/students/import";
import type { StudentImportError } from "@/db/schema";
import { BAD_REQUEST, BadRequest, int, runAdminAction, type ActionResult } from "../../action-utils";
import { runImport } from "./run";

function revalidateImports() {
  revalidatePath("/dashboard/students/imports");
  revalidatePath("/dashboard/students");
}

/** "Enviar arquivo". Campo: `file` (.xlsx, até 4 MB: teto do corpo na Vercel). Confere já; processa depois da resposta. */
export async function uploadImportAction(fd: FormData): Promise<ActionResult> {
  return runAdminAction(async (actor) => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AdminError("Selecione um arquivo XLSX.");
    if (file.size > IMPORT_UPLOAD_MAX_BYTES) throw new AdminError(IMPORT_UPLOAD_TOO_BIG);
    const { id } = await createImport(getDb(), actor, { fileName: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    after(() => runImport(id));
    return { id };
  }, revalidateImports);
}

export async function trashImportAction(fd: FormData): Promise<ActionResult> {
  return runAdminAction((actor) => trashImport(getDb(), actor, int(fd, "id")), revalidateImports);
}

export async function restoreImportAction(fd: FormData): Promise<ActionResult> {
  return runAdminAction((actor) => restoreImport(getDb(), actor, int(fd, "id")), revalidateImports);
}

/** "Ver erros": as linhas com erro (até 200). */
export async function importErrorsAction(id: number): Promise<{ ok: true; errors: StudentImportError[] } | { ok: false; error: string }> {
  try {
    const user = await getCurrentUser();
    assertAdmin(user);
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequest(BAD_REQUEST);
    return { ok: true, errors: await getImportErrors(getDb(), user, id) };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, error: e.message };
    console.error("[dashboard] erros da importação:", safeErrorSummary(e));
    return { ok: false, error: "Não foi possível carregar." };
  }
}
