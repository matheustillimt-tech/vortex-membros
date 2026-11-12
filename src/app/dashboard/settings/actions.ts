"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getDb } from "@/db";
import { saveFirstAccessTerms, updatePlatformSettings } from "@/lib/admin/platform-settings";
import * as forms from "@/lib/admin/settings-forms";
import { SHARING_TAG } from "@/lib/sharing-metadata";
import { runAdminAction as run, type ActionResult } from "../action-utils";

/** Configurações valem para o painel inteiro, a área do aluno e as telas de acesso. */
function revalidateAppearance() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/area", "layout");
  revalidatePath("/auth/login");
  revalidatePath("/auth/esqueci-senha");
}

function save(fd: FormData, parse: (fd: FormData) => forms.SettingsPatch): Promise<ActionResult> {
  return run((actor) => updatePlatformSettings(getDb(), actor, parse(fd)), revalidateAppearance);
}

/** Área do aluno › Geral. Campos: `siteName`. */
export async function saveStudentGeneralAction(fd: FormData): Promise<ActionResult> {
  return save(fd, forms.parseStudentGeneralForm);
}

/** Área do aluno › Aparência. Campos: `accentColor`, `theme`, `fontSize`, `logoUrl`, `faviconUrl`. */
export async function saveStudentAppearanceAction(fd: FormData): Promise<ActionResult> {
  return save(fd, forms.parseStudentAppearanceForm);
}

/** Área do aluno › Rodapé. Campos: `footerShow`, `legalNotice`, `termsOn`/`termsUrl`, `privacyOn`/`privacyUrl`. */
export async function saveStudentFooterAction(fd: FormData): Promise<ActionResult> {
  return save(fd, forms.parseStudentFooterForm);
}

/** Compartilhamento. Campos: `shareTitle`, `shareDescription`, `shareImageUrl`. */
export async function saveSharingAction(fd: FormData): Promise<ActionResult> {
  return run(
    (actor) => updatePlatformSettings(getDb(), actor, forms.parseSharingForm(fd)),
    () => {
      updateTag(SHARING_TAG); // a prévia (metadados de todas as páginas) é lida com "use cache"
      revalidatePath("/dashboard/settings/sharing");
    },
  );
}

/** Termo de primeiro acesso. Campos: `termsEnabled` ("1"/"0"), `blocks` (JSON do editor; ausente = texto intacto). */
export async function saveFirstAccessTermsAction(fd: FormData): Promise<ActionResult> {
  return run((actor) => saveFirstAccessTerms(getDb(), actor, forms.parseFirstAccessTermsForm(fd)), revalidateAppearance);
}

/** Telas de acesso. */
export async function saveAccessScreensAction(fd: FormData): Promise<ActionResult> {
  return save(fd, forms.parseAccessScreensForm);
}

/** Painel administrativo. Campos: `accentColor`, `logoUrl`, `collapsedIconUrl`. */
export async function saveAdminAreaAction(fd: FormData): Promise<ActionResult> {
  return save(fd, forms.parseAdminAreaForm);
}
