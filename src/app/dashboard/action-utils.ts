import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { User } from "@/lib/auth/sessions";
import { assertAdmin } from "@/lib/admin/guard";
import { AdminError } from "@/lib/admin/errors";
import { safeErrorSummary } from "@/lib/log";

/** Base das server actions do painel (não é "use server": só helpers). */
export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

export const BAD_REQUEST = "Requisição inválida.";
export const GENERIC_ERROR = "Não foi possível salvar.";

export class BadRequest extends AdminError {}

export function int(fd: FormData, name: string): number {
  const raw = fd.get(name);
  const n = typeof raw === "string" && /^\d{1,15}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isSafeInteger(n)) throw new BadRequest(BAD_REQUEST);
  return n;
}
export function optionalInt(fd: FormData, name: string): number | null {
  const raw = fd.get(name);
  return raw === null || raw === "" ? null : int(fd, name);
}
export function text(fd: FormData, name: string): string {
  const raw = fd.get(name);
  return typeof raw === "string" ? raw : "";
}
/** Lista de ids "1,2,3" (vazia = []). */
export function ids(fd: FormData, name: string): number[] {
  const raw = text(fd, name).trim();
  if (raw === "") return [];
  return raw.split(",").map((part) => {
    const n = /^\d{1,15}$/.test(part.trim()) ? Number(part.trim()) : NaN;
    if (!Number.isSafeInteger(n)) throw new BadRequest(BAD_REQUEST);
    return n;
  });
}

/** Telas de conteúdo que mostram vitrines/produtos/módulos/aulas. */
export function revalidateContent() {
  revalidatePath("/dashboard/content/products");
  revalidatePath("/dashboard/content/product/[id]", "layout");
}

/**
 * Toda action: revalida o usuário pela sessão (nunca por id do form), exige admin,
 * chama a camada de dados e revalida as telas. Só mensagens de domínio (AdminError) vão
 * para a interface; erros de banco/driver (com SQL e parâmetros) ficam no log do servidor.
 */
export async function runAdminAction(
  fn: (actor: User) => Promise<{ id: number } | void>,
  revalidate: () => void = revalidateContent,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    assertAdmin(user);
    const out = await fn(user);
    revalidate();
    return out ? { ok: true, id: out.id } : { ok: true };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, error: e.message };
    console.error("[dashboard] action falhou:", safeErrorSummary(e));
    return { ok: false, error: GENERIC_ERROR };
  }
}
