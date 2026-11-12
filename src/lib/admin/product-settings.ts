import type { ProductSettings } from "@/db/schema";
import { parseEditorData, type EditorData } from "@/lib/content/editorjs";
import { safeHttpUrl, safeImageUrl } from "@/lib/theme";
import { AdminError } from "./errors";
import type { ProductPatch } from "./content";

/**
 * Formulários de Configurações do produto (Geral, Página do produto, Página da aula, Termo de aceite):
 * FormData → ProductPatch, validado no servidor. Enums em lista branca, cores só #hex, URLs só http(s)
 * (imagens também "/media/…"), números com limites. Campo ausente/forjado → "Requisição inválida.".
 */

export const INVALID = "Requisição inválida.";

export const LISTINGS = ["none", "grid", "list", "timeline", "streaming"] as const satisfies readonly ProductSettings["listing"][];
export const THUMBNAIL_FORMATS = ["auto", "original", "16:9", "1:1", "4:5", "4:7"] as const satisfies readonly ProductSettings["thumbnailFormat"][];
export const NAVIGATIONS = ["simple", "thumbnail"] as const satisfies readonly ProductSettings["lesson"]["navigation"][];
export const MAX_ACCESS_DAYS = 36500;
export const MAX_BUTTON_TEXT = 60;
const MAX_NAME = 200;
const MAX_URL = 2000;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Cor só em #hex (3 ou 6 dígitos); vazio → null. */
export function parseHexColor(raw: string | null): string | null {
  const v = raw?.trim() ?? "";
  if (v === "") return null;
  if (!HEX.test(v)) throw new AdminError("Cor inválida.");
  return v;
}

export function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  if (typeof v !== "string") throw new AdminError(INVALID);
  return v;
}
/** Toggle: hidden "1"/"0". Qualquer outra coisa é forjada. */
export function bool(fd: FormData, name: string): boolean {
  const v = field(fd, name);
  if (v !== "1" && v !== "0") throw new AdminError(INVALID);
  return v === "1";
}
export function oneOf<const T extends readonly string[]>(fd: FormData, name: string, allowed: T): T[number] {
  const v = field(fd, name);
  if (!allowed.includes(v)) throw new AdminError(INVALID);
  return v as T[number];
}
export function url(fd: FormData, name: string, check: (v: string) => string | null, message: string): string | null {
  const v = field(fd, name).trim();
  if (v === "") return null;
  if (v.length > MAX_URL) throw new AdminError(message);
  const ok = check(v);
  if (!ok) throw new AdminError(message);
  return ok;
}

/** Geral. */
export function parseGeneralForm(fd: FormData): ProductPatch {
  const name = field(fd, "name").trim();
  if (!name) throw new AdminError("Informe um nome.");
  if (name.length > MAX_NAME) throw new AdminError("Nome muito longo.");
  const accessType = oneOf(fd, "accessType", ["lifetime", "days"] as const);
  let defaultAccessDays: number | null = null;
  if (accessType === "days") {
    const raw = field(fd, "accessDays").trim();
    const n = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > MAX_ACCESS_DAYS) throw new AdminError("Dias de acesso inválidos.");
    defaultAccessDays = n;
  }
  return {
    name,
    thumbnailUrl: url(fd, "thumbnailUrl", safeImageUrl, "Endereço de imagem inválido."),
    accentColor: parseHexColor(field(fd, "accentColor")),
    offerUrl: url(fd, "offerUrl", safeHttpUrl, "Endereço da oferta inválido."),
    isFree: bool(fd, "isFree"),
    defaultAccessDays,
  };
}

/** Página do produto. */
export function parseProductPageForm(fd: FormData): ProductPatch {
  return {
    settings: {
      listing: oneOf(fd, "listing", LISTINGS),
      modulesAsCarousel: bool(fd, "modulesAsCarousel"),
      showModuleTitles: bool(fd, "showModuleTitles"),
      thumbnailFormat: oneOf(fd, "thumbnailFormat", THUMBNAIL_FORMATS),
      showBanner: bool(fd, "showBanner"),
      bannerUrl: url(fd, "bannerUrl", safeImageUrl, "Endereço de imagem inválido."),
    },
  };
}

/** Página da aula. `nextProductId` é conferido no banco por updateProduct. */
export function parseLessonPageForm(fd: FormData): ProductPatch {
  const rawNext = field(fd, "nextProductId").trim();
  let nextProductId: number | null = null;
  if (rawNext !== "") {
    const n = /^\d{1,15}$/.test(rawNext) ? Number(rawNext) : NaN;
    if (!Number.isSafeInteger(n)) throw new AdminError(INVALID);
    nextProductId = n;
  }
  const buttonText = field(fd, "nextProductButtonText").trim();
  if (buttonText.length > MAX_BUTTON_TEXT) throw new AdminError("Texto do botão muito longo.");
  return {
    settings: {
      lesson: {
        mobileVideoFirst: bool(fd, "mobileVideoFirst"),
        theaterMode: bool(fd, "theaterMode"),
        showModuleBar: bool(fd, "showModuleBar"),
        compactModuleBar: bool(fd, "compactModuleBar"),
        showLessonNumbers: bool(fd, "showLessonNumbers"),
        showTotalProgress: bool(fd, "showTotalProgress"),
        showMarkSeenButton: bool(fd, "showMarkSeenButton"),
        keepButtonAfterSeen: bool(fd, "keepButtonAfterSeen"),
        autoMarkSeen: oneOf(fd, "autoMarkSeen", ["default", "open"] as const) === "open",
        navigation: oneOf(fd, "navigation", NAVIGATIONS),
        nextProductId,
        nextProductButtonText: buttonText || null,
      },
    },
  };
}

/** Termo de aceite: toggle + blocos do Editor.js (ausentes = texto não muda). */
export function parseTermsForm(fd: FormData): ProductPatch {
  const patch: ProductPatch = { termsEnabled: bool(fd, "termsEnabled") };
  const raw = fd.get("blocks");
  if (raw !== null) {
    if (typeof raw !== "string") throw new AdminError(INVALID);
    const data: EditorData | null = parseEditorData(raw);
    if (!data) throw new AdminError(INVALID);
    patch.termsBlocks = data;
  }
  return patch;
}
