import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { platformSettings } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { blocksToHtml, type EditorData } from "@/lib/content/editorjs";
import { termsHash } from "@/lib/catalog/first-access-terms";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";
import { invalidatePlatformSettingsCache } from "@/lib/settings";
import { assertAdmin } from "./guard";
import type { SettingsPatch } from "./settings-forms";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Mescla o patch no JSON salvo (objetos recursivamente; o resto substitui). Não muta. */
function mergeInto(saved: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = isPlainObject(saved) ? { ...saved } : {};
  for (const k of Object.keys(patch)) {
    if (UNSAFE_KEYS.has(k) || patch[k] === undefined) continue;
    const v = patch[k];
    out[k] = isPlainObject(v) ? mergeInto(out[k], v) : v;
  }
  return out;
}

/**
 * Grava um patch já validado (lib/admin/settings-forms) em platform_settings.data (linha 1),
 * preservando as outras chaves. Linha travada (FOR UPDATE) para duas abas não se sobrescreverem.
 */
export async function updatePlatformSettings(db: Database, actor: User | null, patch: SettingsPatch): Promise<void> {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    await tx.insert(platformSettings).values({ id: 1, data: {} }).onConflictDoNothing();
    const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.id, 1)).for("update");
    const data = mergeInto(row?.data, patch as Record<string, unknown>);
    await tx.update(platformSettings).set({ data }).where(eq(platformSettings.id, 1));
  });
  invalidatePlatformSettingsCache(db);
}

/**
 * Termo de primeiro acesso: liga/desliga e, se vierem blocos, regrava o HTML (blocksToHtml + sanitize)
 * e a versão (`hash`, sha256 desse HTML), calculada só aqui: as requisições do aluno comparam o hash salvo.
 */
export async function saveFirstAccessTerms(
  db: Database,
  actor: User | null,
  input: { enabled: boolean; blocks: EditorData | null },
): Promise<void> {
  assertAdmin(actor);
  const patch: SettingsPatch = { firstAccessTerms: { enabled: input.enabled } };
  if (input.blocks) {
    const html = sanitizeLessonHtml(blocksToHtml(input.blocks)).trim();
    patch.firstAccessTerms!.html = html === "" ? null : html;
    patch.firstAccessTerms!.hash = html === "" ? null : termsHash(html);
  }
  await updatePlatformSettings(db, actor, patch);
}
