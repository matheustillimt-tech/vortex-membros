"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { AdminError } from "@/lib/admin/errors";
import { updatePlatformSettings } from "@/lib/admin/platform-settings";
import * as dl from "@/lib/sales/deliveries";
import { createTag } from "@/lib/sales/tags";
import { KIWIFY_TOKEN_MAX } from "@/lib/settings";
import { BAD_REQUEST, BadRequest, int, runAdminAction, text, type ActionResult } from "../../action-utils";
import { applyDeliveryTagsToStudents } from "./data";

function revalidateDeliveries() {
  revalidatePath("/dashboard/sales/deliveries");
  revalidatePath("/dashboard/sales/deliveries/[id]/edit", "page");
}
const run = (fn: Parameters<typeof runAdminAction>[0]) => runAdminAction(fn, revalidateDeliveries);

const strings = (fd: FormData, name: string): string[] => fd.getAll(name).filter((v): v is string => typeof v === "string");

function tagIds(fd: FormData): number[] {
  return strings(fd, "tagIds").map((v) => {
    if (!/^\d{1,15}$/.test(v.trim())) throw new BadRequest(BAD_REQUEST);
    return Number(v.trim());
  });
}

/** `items`: JSON com a lista de itens; o formato de cada campo é validado na camada de dados. */
function items(fd: FormData): dl.DeliveryItemInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(fd, "items"));
  } catch {
    throw new BadRequest(BAD_REQUEST);
  }
  if (!Array.isArray(parsed) || parsed.length > dl.DELIVERY_ITEMS_MAX) throw new BadRequest(BAD_REQUEST);
  return parsed.map((r) => {
    if (typeof r !== "object" || r === null || Array.isArray(r)) throw new BadRequest(BAD_REQUEST);
    const o = r as Record<string, unknown>;
    return {
      targetType: o.targetType,
      targetId: o.targetId ?? null,
      durationType: o.durationType,
      duration: o.duration ?? null,
      scheduleId: o.scheduleId ?? null,
    } as dl.DeliveryItemInput;
  });
}

/** Campos do formulário: `name`, `type`, `codes` (repetido), `items` (JSON), `tagIds` (repetido). */
function input(fd: FormData): dl.DeliveryInput {
  return { name: text(fd, "name"), type: text(fd, "type") as dl.DeliveryInput["type"], codes: strings(fd, "codes"), items: items(fd), tagIds: tagIds(fd) };
}

/** "Adicionando Entrega" (salvar). Devolve o id. */
export async function createDeliveryAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => dl.createDelivery(getDb(), actor, input(fd)));
}

/** Editar entrega (save bar). Campos: `id` + os do formulário. */
export async function updateDeliveryAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const id = int(fd, "id");
    const { name, ...rest } = input(fd);
    // sem `name` (a edição renomeia pelo cabeçalho), o nome fica como está
    await dl.updateDelivery(getDb(), actor, id, fd.has("name") ? { name, ...rest } : rest);
  });
}

/** Nome editável no cabeçalho. Campos: `id`, `name`. */
export async function renameDeliveryAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const id = int(fd, "id");
    await dl.updateDelivery(getDb(), actor, id, { name: text(fd, "name") });
  });
}

/** "Duplicar". Campos: `id`. Devolve o id da cópia. */
export async function duplicateDeliveryAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => dl.duplicateDelivery(getDb(), actor, int(fd, "id")));
}

/** "Arquivar". Campos: `id`. */
export async function archiveDeliveryAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => dl.archiveDelivery(getDb(), actor, int(fd, "id")));
}

/** "Restaurar". Campos: `id`. */
export async function restoreDeliveryAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => dl.restoreDelivery(getDb(), actor, int(fd, "id")));
}

/** "Adicionando Tag" › Criar. Campos: `name`. Devolve o id (o da tag existente, se o nome já existir). */
export async function createTagAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => ({ id: (await createTag(getDb(), actor, text(fd, "name"))).id }));
}

/** "Aplicar tags em todos os alunos" (as tags salvas da entrega). Campos: `id`. */
export async function applyDeliveryTagsAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const id = int(fd, "id");
    const d = await dl.getDelivery(getDb(), actor, id);
    if (!d) throw new AdminError("Entrega não encontrada.");
    await applyDeliveryTagsToStudents(getDb(), id);
  });
}

/** "Token da Kiwify (opcional)": vazio = não exigir assinatura. Campos: `token`. */
export async function saveSignatureTokenAction(fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const token = text(fd, "token").trim();
    if (token.length > KIWIFY_TOKEN_MAX) throw new AdminError(`O token pode ter até ${KIWIFY_TOKEN_MAX} caracteres.`);
    await updatePlatformSettings(getDb(), actor, { kiwify: { signatureToken: token || null } });
  });
}
