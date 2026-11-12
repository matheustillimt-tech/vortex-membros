import { NextResponse, type NextRequest } from "next/server";
import { resolveDashboardAccess } from "@/lib/admin/guard";
import { clearSessionCookie, readSession } from "@/lib/auth/guard";
import { DEFAULT_HOME } from "@/lib/auth/redirect";
import { getDb } from "@/db";
import { blockedByFirstAccessTerms, firstAccessTermsUrl, isFirstAccessTermsPath } from "@/lib/catalog/first-access-terms";

function isDashboard(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

/** Navegação (GET/HEAD sem server action) pode ser redirecionada; o resto (POST, Next-Action) é recusado. */
function isNavigation(req: NextRequest): boolean {
  return (req.method === "GET" || req.method === "HEAD") && !req.headers.has("next-action");
}

// Proxy roda no runtime Node.js por padrão no Next 16 (e não aceita `runtime`), então pode consultar o banco.
// Valida a sessão de verdade: cookie ausente, expirado ou inválido → 307 para o login com ?redirect=,
// em vez de deixar a página redirecionar dentro do Suspense (200 + <meta refresh>, sem redirect).
// No painel (/dashboard) também checa o papel: aluno logado → 307 para a home do aluno.
// Na área (/area) segura o aluno com termo de primeiro acesso pendente: configurações em cache (TTL),
// e a consulta ao aceite (PK) só quando o termo está ligado.
export async function proxy(req: NextRequest) {
  const { user, impersonatedBy, hadCookie } = await readSession(req);
  if (user) {
    const { pathname } = req.nextUrl;
    if (isDashboard(pathname)) {
      // Sessão "como o aluno" (personificação) nunca abre o painel, mesmo que o alvo fosse admin.
      if (impersonatedBy !== null || resolveDashboardAccess(user) !== "ok") return NextResponse.redirect(new URL(DEFAULT_HOME, req.url));
    } else if (impersonatedBy === null && !isFirstAccessTermsPath(pathname) && (await blockedByFirstAccessTerms(getDb(), user))) {
      // (Admin "como o aluno" não é segurado pelo termo: ele vê a área, mas nunca aceita pelo aluno.)
      // Termo de primeiro acesso pendente (só alunos; a tela do termo e a action dela ficam livres):
      // navegação → tela do termo com ?next=; POST/server action → 403, nada é executado.
      if (!isNavigation(req)) return new NextResponse("Aceite o termo de uso para continuar.", { status: 403 });
      return NextResponse.redirect(new URL(firstAccessTermsUrl(pathname + req.nextUrl.search), req.url));
    }
    return NextResponse.next();
  }
  const url = new URL("/auth/login", req.url);
  url.searchParams.set("redirect", req.nextUrl.pathname + req.nextUrl.search);
  const res = NextResponse.redirect(url);
  return hadCookie ? clearSessionCookie(res) : res;
}

export const config = { matcher: ["/area/:path*", "/dashboard/:path*"] };
