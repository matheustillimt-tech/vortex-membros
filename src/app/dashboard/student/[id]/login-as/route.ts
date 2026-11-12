import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { AdminError } from "@/lib/admin/errors";
import { getAppUrl } from "@/lib/auth/app-url";
import { clientIp } from "@/lib/auth/client-ip";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";
import { getSession } from "@/lib/auth/sessions";
import { safeErrorSummary } from "@/lib/log";
import { ADMIN_RETURN_COOKIE, startImpersonation } from "@/lib/students/impersonation";

/** Origem da própria aplicação: a da requisição e a pública (APP_URL / domínio de produção). */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return false;
  const allowed = new Set([req.nextUrl.origin, new URL(getAppUrl(req.headers)).origin]);
  return allowed.has(origin);
}

/**
 * "Entrar como o aluno": formulário POST do perfil (abre em outra aba). Só
 * admin com sessão própria (não personificada) e só da mesma origem (Origin obrigatório: sem ele, ou
 * de outro site, 403). Troca o cookie de sessão pela sessão do aluno e guarda a do admin em
 * `am_admin_return` para o "Voltar ao painel". GET → 405 (nunca por link, imagem ou navegação forçada).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id)) return new NextResponse("Not Found", { status: 404 });
  if (!sameOrigin(req)) return new NextResponse("Origem não permitida.", { status: 403 });
  const profile = new URL(`/dashboard/student/${id}`, req.url);

  const adminToken = req.cookies.get(SESSION_COOKIE)?.value;
  const db = getDb();
  const current = adminToken ? await getSession(db, adminToken) : null;
  if (!current || current.impersonatedBy !== null || current.user.role !== "admin") {
    return NextResponse.redirect(new URL("/auth/login?redirect=/dashboard", req.url), 303);
  }
  try {
    const { token, expiresAt } = await startImpersonation(db, current.user, id, {
      ip: clientIp(req.headers),
      userAgent: req.headers.get("user-agent") ?? "",
    });
    const res = NextResponse.redirect(new URL("/area/vitrine/home", req.url), 303);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    res.cookies.set(ADMIN_RETURN_COOKIE, adminToken!, sessionCookieOptions(expiresAt));
    return res;
  } catch (e) {
    if (!(e instanceof AdminError)) console.error("[alunos] entrar como o aluno falhou:", safeErrorSummary(e));
    return NextResponse.redirect(profile, 303);
  }
}

export async function GET() {
  return new NextResponse("Método não permitido.", { status: 405, headers: { allow: "POST" } });
}
