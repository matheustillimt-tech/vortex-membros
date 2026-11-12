import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { resolveDashboardAccess } from "@/lib/admin/guard";
import { getAppUrl } from "@/lib/auth/app-url";
import { getCurrentUser } from "@/lib/auth/current-user";
import { EDITABLE_TEMPLATES, type EditableTemplate } from "@/lib/email/defaults";
import { renderEmail } from "@/lib/email/templates";
import { getPlatformSettings, resolvePlatformSettings, type PlatformSettings } from "@/lib/settings";

/**
 * Pré-visualização de um modelo editável (gaveta de modelo, iframe `srcdoc`). Só admin; o resto
 * recebe 404. GET usa as configurações salvas (ou `?draft=<json>`); POST recebe o rascunho em JSON
 * (`{ emails: {...} }`). O rascunho é mesclado às configurações salvas e passa por
 * resolvePlatformSettings (cores, URLs e textos validados como os salvos). Nada é gravado.
 */

const MAX_DRAFT = 64 * 1024;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type Ctx = { params: Promise<{ template: string }> };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeDeep(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const k of Object.keys(patch)) {
    if (UNSAFE_KEYS.has(k)) continue;
    out[k] = mergeDeep(out[k], patch[k]);
  }
  return out;
}

const notFound = () => new Response("Não encontrado.", { status: 404 });
const badRequest = () => new Response("Rascunho inválido.", { status: 400 });

function parseDraft(text: string | null): { emails?: unknown } | null | "invalid" {
  if (!text) return null;
  if (text.length > MAX_DRAFT) return "invalid";
  try {
    const v: unknown = JSON.parse(text);
    return isPlainObject(v) ? v : "invalid";
  } catch {
    return "invalid";
  }
}

async function preview(req: NextRequest, ctx: Ctx, draftText: () => Promise<string | null>): Promise<Response> {
  if (resolveDashboardAccess(await getCurrentUser()) !== "ok") return notFound();
  const { template } = await ctx.params;
  if (!(EDITABLE_TEMPLATES as readonly string[]).includes(template)) return notFound();
  const key = template as EditableTemplate;
  const draft = parseDraft(await draftText());
  if (draft === "invalid") return badRequest();

  const saved = await getPlatformSettings(getDb());
  const settings: PlatformSettings = resolvePlatformSettings({ ...saved, emails: mergeDeep(saved.emails, draft?.emails) });
  // Desativado também aparece na prévia (a gaveta avisa que ele não será enviado).
  settings.emails.templates[key] = { ...settings.emails.templates[key], enabled: true };

  const appUrl = getAppUrl(req.headers);
  const rendered = renderEmail(
    key,
    { nome: "Fulano", email: "fulano@exemplo.com", senha: "123456", linkAcesso: `${appUrl}/auth/login?login_token=exemplo` },
    { settings, appUrl, now: new Date() },
  );
  if (!rendered) return notFound();
  return new Response(rendered.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "sandbox; default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  return preview(req, ctx, async () => req.nextUrl.searchParams.get("draft"));
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  return preview(req, ctx, async () => {
    const t = await req.text();
    return t.trim() === "" ? null : t;
  });
}
