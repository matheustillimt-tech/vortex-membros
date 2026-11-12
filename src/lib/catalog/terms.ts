import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { products, termsAcceptance } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";
import { hasActiveAccess } from "./access";

type TermsFields = { termsEnabled: boolean; termsHtml: string | null };

/** HTML do termo do produto se ligado e com texto (termo ligado sem texto não bloqueia ninguém); senão null. */
function termsHtmlOf(p: TermsFields): string | null {
  if (!p.termsEnabled) return null;
  return sanitizeLessonHtml(p.termsHtml ?? "").trim() || null;
}

/** Produto com termo ligado e texto não vazio. */
async function productWithTerms(db: Database, productId: number) {
  const [p] = await db
    .select({ id: products.id, name: products.name, status: products.status, termsEnabled: products.termsEnabled, termsHtml: products.termsHtml })
    .from(products)
    .where(and(eq(products.id, productId), isNull(products.deletedAt)));
  const html = p ? termsHtmlOf(p) : null;
  return p && html ? { ...p, html } : null;
}

async function hasAccepted(db: Database, userId: number, productId: number): Promise<boolean> {
  const [row] = await db
    .select({ userId: termsAcceptance.userId })
    .from(termsAcceptance)
    .where(and(eq(termsAcceptance.userId, userId), eq(termsAcceptance.productId, productId)));
  return !!row;
}

/**
 * O aluno precisa aceitar o termo antes de abrir o produto? Admin nunca precisa.
 * Com o produto já lido (id + campos do termo), termo desligado não custa consulta nenhuma.
 */
export async function needsTermsAcceptance(
  db: Database,
  user: User,
  product: number | ({ id: number } & TermsFields),
): Promise<boolean> {
  if (user.role === "admin") return false;
  const p = typeof product === "number" ? await productWithTerms(db, product) : termsHtmlOf(product) ? product : null;
  if (!p) return false;
  return !(await hasAccepted(db, user.id, p.id));
}

/**
 * Tela do termo: só para quem tem acesso a um produto visível e ainda não aceitou.
 * null = nada a aceitar (segue para o destino).
 */
export async function getPendingTerms(
  db: Database,
  user: User,
  productId: number,
): Promise<{ productId: number; productName: string; html: string } | null> {
  if (user.role === "admin") return null;
  const p = await productWithTerms(db, productId);
  if (!p || p.status !== "published") return null;
  if (!(await hasActiveAccess(db, user, productId))) return null;
  if (await hasAccepted(db, user.id, productId)) return null;
  return { productId: p.id, productName: p.name, html: p.html };
}

/** "Li e aceito": grava o aceite (idempotente). Recusa (false) se não há termo pendente para este aluno. */
export async function acceptTerms(db: Database, user: User, productId: number): Promise<boolean> {
  if (!(await getPendingTerms(db, user, productId))) return false;
  await db.insert(termsAcceptance).values({ userId: user.id, productId }).onConflictDoNothing();
  return true;
}

/** Destino depois do aceite: caminho interno seguro; sem destino → listagem do produto. */
export function termsNextPath(productId: number, next: string | null | undefined): string {
  return next ? safeRedirectPath(next) : `/area/conteudo/listagem/${productId}`;
}

/** Endereço da tela do termo, guardando para onde o aluno ia. */
export function termsPagePath(productId: number, next: string): string {
  return `/area/conteudo/termo/${productId}?next=${encodeURIComponent(safeRedirectPath(next))}`;
}
