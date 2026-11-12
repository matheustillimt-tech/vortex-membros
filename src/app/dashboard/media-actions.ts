"use server";

import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertAdmin } from "@/lib/admin/guard";
import { formatLimit, saveMedia, uploadLimitFor } from "@/lib/admin/media";
import { AdminError } from "@/lib/admin/errors";
import { safeErrorSummary } from "@/lib/log";

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/** Campos do formulário: `file` (obrigatório) e `kind` ("image" | "banner" | "logo" | "icon"; o limite é decidido aqui, no servidor). */
export async function uploadImageAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await getCurrentUser(); // sempre revalida pela sessão
    assertAdmin(user);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione uma imagem." };
    const maxBytes = uploadLimitFor(formData.get("kind"));
    if (file.size > maxBytes) return { ok: false, error: `Arquivo maior que ${formatLimit(maxBytes)}.` };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { url } = await saveMedia(getDb(), user, { bytes, maxBytes });
    return { ok: true, url };
  } catch (e) {
    // Só mensagens de domínio (tipo/tamanho/acesso) vão para a interface; o resto fica no log.
    if (e instanceof AdminError) return { ok: false, error: e.message };
    console.error("[dashboard] upload falhou:", safeErrorSummary(e));
    return { ok: false, error: "Não foi possível enviar a imagem." };
  }
}
