"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { updatePlatformSettings } from "@/lib/admin/platform-settings";
import { parseEmailAppearanceForm, parseEmailTemplateForm } from "@/lib/admin/settings-forms";
import { runAdminAction as run, type ActionResult } from "../../action-utils";

const revalidateEmails = () => revalidatePath("/dashboard/settings/emails");

/** Aparência dos e-mails. Campos: `colorPage`, `colorContent`, `colorText`, `colorFooter`, `colorLink`, `logoUrl`, `logoHeight`, `senderName`, `replyTo`, `signature`. */
export async function saveEmailAppearanceAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => updatePlatformSettings(getDb(), actor, parseEmailAppearanceForm(fd)), revalidateEmails);
}

/** Um modelo. Campos: `template`, `enabled` e `oneClickButton` ("1"/"0"), `message` (vazio = texto padrão; ignorado no fixo). */
export async function saveEmailTemplateAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => updatePlatformSettings(getDb(), actor, parseEmailTemplateForm(fd)), revalidateEmails);
}
