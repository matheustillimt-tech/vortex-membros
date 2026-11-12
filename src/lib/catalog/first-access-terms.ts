import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { platformTermsAcceptance } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";
import { getCachedPlatformSettings, getPlatformSettings, type PlatformSettings } from "@/lib/settings";

/** Tela do termo de primeiro acesso (fora da checagem do proxy). */
export const FIRST_ACCESS_TERMS_PATH = "/area/termo-primeiro-acesso";
export const FIRST_ACCESS_PENDING_MESSAGE = "Aceite o termo de uso para continuar.";

/**
 * Termo de primeiro acesso em vigor ({ html, hash }), ou null se desligado/vazio (nada a exigir).
 * O HTML já foi sanitizado ao salvar e o hash calculado ali; configurações gravadas antes do hash
 * existir caem no cálculo antigo (sanitize + sha256), que dá o mesmo hash dos aceites já gravados.
 */
export function currentFirstAccessTerms(settings: PlatformSettings): PendingFirstAccessTerms | null {
  const t = settings.firstAccessTerms;
  if (!t.enabled || !t.html) return null;
  if (t.hash) return t.html.trim() ? { html: t.html, hash: t.hash } : null;
  const html = sanitizeLessonHtml(t.html).trim();
  return html ? { html, hash: termsHash(html) } : null;
}

/** Versão do termo: sha256 do HTML sanitizado. Mudou o texto → mudou o hash → pede o aceite de novo. */
export function termsHash(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export type PendingFirstAccessTerms = { html: string; hash: string };

/**
 * Termo de primeiro acesso que o aluno ainda precisa aceitar (versão atual), ou null.
 * Admin nunca precisa (sem consulta). Termo desligado: só a leitura das configurações (as `settings`
 * passadas, ou a linha 1 do banco). Ligado: mais uma consulta por PK ao aceite do aluno.
 */
export async function getPendingFirstAccessTerms(
  db: Database,
  user: User,
  settings?: PlatformSettings,
): Promise<PendingFirstAccessTerms | null> {
  if (user.role === "admin") return null;
  const terms = currentFirstAccessTerms(settings ?? (await getPlatformSettings(db)));
  if (!terms) return null;
  const [row] = await db
    .select({ hash: platformTermsAcceptance.termsHash })
    .from(platformTermsAcceptance)
    .where(eq(platformTermsAcceptance.userId, user.id));
  return row?.hash === terms.hash ? null : terms;
}

/**
 * "Li e aceito": grava o hash da versão que o aluno viu (`hash` do formulário). Se o texto mudou
 * nesse meio tempo (hash diferente do atual), não grava e devolve false: a tela mostra o texto novo.
 */
export async function acceptFirstAccessTerms(db: Database, user: User, hash: string): Promise<boolean> {
  const pending = await getPendingFirstAccessTerms(db, user);
  if (!pending || pending.hash !== hash) return false;
  await db
    .insert(platformTermsAcceptance)
    .values({ userId: user.id, termsHash: hash })
    .onConflictDoUpdate({ target: platformTermsAcceptance.userId, set: { termsHash: hash, acceptedAt: new Date() } });
  return true;
}

/** URL da tela do termo, guardando o destino (só caminho interno). */
export function firstAccessTermsUrl(next: string): string {
  const safe = safeRedirectPath(next);
  return `${FIRST_ACCESS_TERMS_PATH}?next=${encodeURIComponent(safe)}`;
}

/** O caminho é a própria tela do termo (que o proxy deixa passar)? */
export function isFirstAccessTermsPath(pathname: string): boolean {
  return pathname === FIRST_ACCESS_TERMS_PATH || pathname.startsWith(`${FIRST_ACCESS_TERMS_PATH}/`);
}

/**
 * O aluno está barrado pelo termo de primeiro acesso? (proxy e server actions da área)
 * Usa as configurações em cache (getCachedPlatformSettings); só quando o cache diz "pendente" confere
 * no banco, para um cache velho (termo desligado ou trocado em outra instância) nunca prender o aluno
 * num vaivém entre o proxy e a tela do termo. O inverso (termo recém-ligado) vale em até SETTINGS_TTL_MS.
 */
export async function blockedByFirstAccessTerms(db: Database, user: User): Promise<boolean> {
  if (user.role === "admin") return false;
  if (!(await getPendingFirstAccessTerms(db, user, await getCachedPlatformSettings(db)))) return false;
  return (await getPendingFirstAccessTerms(db, user)) !== null;
}
