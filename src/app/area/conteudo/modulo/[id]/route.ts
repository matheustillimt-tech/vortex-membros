import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { clearSessionCookie, readSession } from "@/lib/auth/guard";
import { DEFAULT_HOME } from "@/lib/auth/redirect";
import { getModuleEntry } from "@/lib/catalog/queries";
import { needsTermsAcceptance, termsPagePath } from "@/lib/catalog/terms";

// Route handler (e não page.tsx) para responder com um 307 de verdade: o módulo não tem tela própria,
// abre direto a primeira aula visível (ou o termo de aceite pendente, voltando depois para ela). Sem acesso → listagem do produto (oferta). Inexistente, oculto ou vazio → home.
export async function GET(req: NextRequest, ctx: RouteContext<"/area/conteudo/modulo/[id]">) {
  const { user, hadCookie } = await readSession(req);
  if (!user) {
    const res = NextResponse.redirect(new URL("/auth/login", req.url));
    return hadCookie ? clearSessionCookie(res) : res;
  }
  const { id } = await ctx.params;
  const moduleId = /^\d+$/.test(id) ? Number(id) : NaN;
  const entry = Number.isSafeInteger(moduleId) ? await getModuleEntry(getDb(), user, moduleId) : null;
  let target = DEFAULT_HOME;
  if (entry && "lessonId" in entry) {
    target = `/area/conteudo/aula/${entry.lessonId}`;
    if (await needsTermsAcceptance(getDb(), user, entry.productId)) target = termsPagePath(entry.productId, target);
  }
  else if (entry) target = `/area/conteudo/listagem/${entry.lockedProductId}`;
  return NextResponse.redirect(new URL(target, req.url));
}
