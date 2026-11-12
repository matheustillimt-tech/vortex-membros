"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { AdminError } from "@/lib/admin/errors";
import { assertAdmin } from "@/lib/admin/guard";
import { getAppUrl } from "@/lib/auth/app-url";
import { clientIp } from "@/lib/auth/client-ip";
import { getCurrentUser } from "@/lib/auth/current-user";
import { scheduleOutboxFlush } from "@/lib/email/send-now";
import { safeErrorSummary } from "@/lib/log";
import { listTags } from "@/lib/sales/tags";
import * as adm from "@/lib/students/admin";
import { formatShortDateTime, formatDateTimeSeconds, parseSaoPauloLocal } from "@/lib/students/format";
import * as pur from "@/lib/students/purchases";
import { BAD_REQUEST, BadRequest, GENERIC_ERROR, ids, int, runAdminAction, text, type ActionResult } from "../../action-utils";

/** Ações do perfil do aluno (cartão, Resumo, Compras, Produtos e Logs). Todas exigem admin pela sessão. */

function revalidateStudent() {
  revalidatePath("/dashboard/student/[id]", "layout");
  revalidatePath("/dashboard/students");
}
const run = (fn: Parameters<typeof runAdminAction>[0]) => runAdminAction(fn, revalidateStudent);
const appUrl = async () => getAppUrl(await headers());

function key(fd: FormData): pur.PurchaseKey {
  const delivery = text(fd, "deliveryId");
  const saleRef = text(fd, "saleRef");
  if (saleRef.length > 200) throw new BadRequest(BAD_REQUEST);
  return { deliveryId: delivery ? int(fd, "deliveryId") : null, saleRef: saleRef || null };
}

const small = (fd: FormData, name: string) => {
  const raw = text(fd, name).trim();
  if (raw === "") return 0;
  if (!/^\d{1,4}$/.test(raw)) throw new BadRequest(BAD_REQUEST);
  return Number(raw);
};

/** "Editar aluno". Campos: `id`, `name`, `email`, `document`, `phone` (número) e `ddi`. */
export async function updateStudentAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const ddi = text(fd, "ddi").replace(/\D/g, "").slice(0, 4) || "55";
    const number = text(fd, "phone").replace(/\D/g, "");
    await adm.updateStudent(getDb(), actor, int(fd, "id"), {
      name: text(fd, "name"),
      email: text(fd, "email"),
      document: text(fd, "document"),
      phone: number ? `+${ddi}${number}` : "",
    });
  });
}

/** "Alterar senha". Campos: `id`, `password`, `password2`. */
export async function setStudentPasswordAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const password = text(fd, "password");
    if (password !== text(fd, "password2")) throw new BadRequest("As senhas não conferem.");
    const h = await headers();
    await adm.setStudentPassword(getDb(), actor, int(fd, "id"), password, { ip: clientIp(h), userAgent: h.get("user-agent") ?? "" });
  });
}

/** "Gerenciar tags". Campos: `id`, `tagIds` ("1,2,3"; vazio = nenhuma). */
export async function setStudentTagsAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => adm.setStudentTags(getDb(), actor, int(fd, "id"), ids(fd, "tagIds")));
}

/** Notas: adicionar. Campos: `id`, `body`. */
export async function addNoteAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => adm.addNote(getDb(), actor, int(fd, "id"), text(fd, "body")));
}

/** Notas: excluir. Campos: `id`, `noteId`. */
export async function deleteNoteAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => adm.deleteNote(getDb(), actor, int(fd, "id"), int(fd, "noteId")));
}

/** "Adicionar entrega". Campos: `id`, `deliveryId`. */
export async function addDeliveryAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await pur.addDeliveryToStudent(getDb(), actor, int(fd, "id"), int(fd, "deliveryId"), { appUrl: await appUrl() });
    scheduleOutboxFlush();
  });
}

/** Selo Ativo/Inativo da compra. Campos: `id`, `deliveryId`, `saleRef`, `active` ("1"/"0"). */
export async function setPurchaseActiveAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => pur.setPurchaseActive(getDb(), actor, int(fd, "id"), key(fd), text(fd, "active") === "1"));
}

/** "Programar encerramento". Campos: `id`, `deliveryId`, `saleRef`, `end` (datetime-local de São Paulo; vazio = sem data). */
export async function schedulePurchaseEndAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const raw = text(fd, "end").trim();
    const end = raw ? parseSaoPauloLocal(raw) : null;
    if (raw && !end) throw new BadRequest("Data inválida.");
    await pur.schedulePurchaseEnd(getDb(), actor, int(fd, "id"), key(fd), end);
  });
}

/** "Excluir" compra avulsa. Campos: `id`, `deliveryId`, `saleRef`. */
export async function deletePurchaseAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => pur.deletePurchase(getDb(), actor, int(fd, "id"), key(fd)));
}

/**
 * "Alterar tempo de acesso". Campos: `id`, `productId` (ou "all"), `mode` (date | lifetime | add),
 * `date` (datetime-local), `days`, `weeks`, `months`, `years`.
 */
export async function setAccessUntilAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const productId = text(fd, "productId") === "all" ? "all" : int(fd, "productId");
    const mode = text(fd, "mode");
    let change: pur.AccessChange;
    if (mode === "lifetime") change = { type: "lifetime" };
    else if (mode === "date") {
      const date = parseSaoPauloLocal(text(fd, "date"));
      if (!date) throw new BadRequest("Data inválida.");
      change = { type: "date", date };
    } else if (mode === "add") {
      change = { type: "add", days: small(fd, "days"), weeks: small(fd, "weeks"), months: small(fd, "months"), years: small(fd, "years") };
    } else throw new BadRequest(BAD_REQUEST);
    await pur.setAccessUntil(getDb(), actor, int(fd, "id"), productId, change);
  });
}

/** Selo Programada/Imediata. Campos: `id`, `productId`, `immediate` ("1"/"0"). */
export async function toggleReleaseAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => pur.toggleReleaseOverride(getDb(), actor, int(fd, "id"), int(fd, "productId"), text(fd, "immediate") === "1"));
}

/** "Excluir progresso". Campos: `id`, `productId`. */
export async function deleteProgressAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => pur.deleteProgress(getDb(), actor, int(fd, "id"), int(fd, "productId")));
}

/** "Iniciar todos os acessos". Campos: `id`. */
export async function startAllAccessesAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await pur.startAllAccesses(getDb(), actor, int(fd, "id"));
  });
}

/* ---------- leitura ---------- */

type Read<T> = ({ ok: true } & T) | { ok: false; error: string };

async function read<T>(fn: (actor: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => Promise<T>): Promise<Read<T>> {
  try {
    const user = await getCurrentUser();
    assertAdmin(user);
    return { ok: true, ...(await fn(user)) };
  } catch (e) {
    if (e instanceof AdminError) return { ok: false, error: e.message };
    console.error("[dashboard] leitura do aluno falhou:", safeErrorSummary(e));
    return { ok: false, error: GENERIC_ERROR };
  }
}

export type LogRow = { id: number; date: string; title: string; label: string; ip: string; userAgent: string };

/** Aba Logs: próxima página. Campos: `id`, `cursor` (id do último log). */
export async function listLogsAction(fd: FormData): Promise<Read<{ rows: LogRow[]; total: number; nextCursor: number | null }>> {
  return read(async (actor) => {
    const cursor = text(fd, "cursor") ? int(fd, "cursor") : undefined;
    const page = await adm.listLogs(getDb(), actor, int(fd, "id"), { cursor });
    return {
      rows: page.rows.map((r) => ({
        id: r.id,
        date: formatShortDateTime(r.createdAt),
        title: formatDateTimeSeconds(r.createdAt),
        label: r.label,
        ip: r.ip ?? "",
        userAgent: r.userAgent ?? "",
      })),
      total: page.total,
      nextCursor: page.nextCursor,
    };
  });
}

/** Tags da gaveta "Gerenciar tags". */
export async function listAllTagsAction(): Promise<Read<{ tags: { id: number; name: string }[] }>> {
  return read(async (actor) => ({ tags: await listTags(getDb(), actor) }));
}
