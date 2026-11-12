"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { updatePlatformSettings } from "@/lib/admin/platform-settings";
import { parseAuthForm } from "@/lib/admin/settings-forms";
import { runAdminAction as run, type ActionResult } from "../../../action-utils";

/**
 * Autenticação › Senhas. Campos: `requireStrongPassword` ("1"/"0"), `level`, `minLength`, `special`,
 * `upper`, `lower`, `digits`, `letters`, `initialPasswordFrom`, `defaultPassword` (vazio = gerar).
 */
export async function saveAuthSettingsAction(fd: FormData): Promise<ActionResult> {
  return run(
    (actor) => updatePlatformSettings(getDb(), actor, parseAuthForm(fd)),
    () => revalidatePath("/dashboard/settings/security/auth"),
  );
}
