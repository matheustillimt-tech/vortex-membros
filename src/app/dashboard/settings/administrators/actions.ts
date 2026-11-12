"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db";
import * as adm from "@/lib/admin/administrators";
import { getAppUrl } from "@/lib/auth/app-url";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { scheduleOutboxFlush } from "@/lib/email/send-now";
import { BadRequest, int, runAdminAction as run, text, type ActionResult } from "../../action-utils";

function revalidateAdministrators() {
  revalidatePath("/dashboard/settings/administrators");
  revalidatePath("/dashboard/settings/administrators/[id]", "page");
}
const go = (fn: Parameters<typeof run>[0]) => run(fn, revalidateAdministrators);

const appUrl = async () => getAppUrl(await headers());
const currentToken = async () => (await cookies()).get(SESSION_COOKIE)?.value;

/** "Salvar e enviar senha". Campos: `name`, `email`. Devolve o id. */
export async function createAdministratorAction(fd: FormData): Promise<ActionResult> {
  return go(async (actor) => {
    const out = await adm.createAdministrator(getDb(), actor, { name: text(fd, "name"), email: text(fd, "email") }, { appUrl: await appUrl() });
    scheduleOutboxFlush();
    return out;
  });
}

/** "Reenviar acesso". Campos: `id`. */
export async function resendAccessAction(fd: FormData): Promise<ActionResult> {
  return go(async (actor) => {
    await adm.resendAccess(getDb(), actor, int(fd, "id"), { appUrl: await appUrl(), keepSessionToken: await currentToken() });
    scheduleOutboxFlush();
  });
}

/** "Alterar senha". Campos: `id`, `password`, `password2`. */
export async function setAdministratorPasswordAction(fd: FormData): Promise<ActionResult> {
  return go(async (actor) => {
    const id = int(fd, "id");
    const password = text(fd, "password");
    if (password !== text(fd, "password2")) throw new BadRequest("As senhas não conferem.");
    await adm.setAdministratorPassword(getDb(), actor, id, password, { keepSessionToken: await currentToken() });
  });
}

/** "Editar perfil". Campos: `id`, `name`, `email`, `document`, `phone`. */
export async function updateAdministratorAction(fd: FormData): Promise<ActionResult> {
  return go((actor) =>
    adm.updateAdministrator(getDb(), actor, int(fd, "id"), {
      name: text(fd, "name"),
      email: text(fd, "email"),
      document: text(fd, "document"),
      phone: text(fd, "phone"),
    }),
  );
}

/** "Excluir administrador": volta a aluno. Campos: `id`. */
export async function removeAdministratorAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => adm.removeAdministrator(getDb(), actor, int(fd, "id")));
}

/** Lixeira › "Restaurar": volta a Super Admin. Campos: `id`. */
export async function restoreAdministratorAction(fd: FormData): Promise<ActionResult> {
  return go((actor) => adm.restoreAdministrator(getDb(), actor, int(fd, "id")));
}
