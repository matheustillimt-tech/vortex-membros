import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, readSession } from "@/lib/auth/guard";
import { DEFAULT_HOME } from "@/lib/auth/redirect";

// Qualquer endereço antigo desconhecido: logado → home do aluno; deslogado → login. Nunca uma página de erro.
// Route handler (e não page.tsx) para responder com um 307 de verdade em vez de um redirect via <meta> no streaming.
async function handler(req: NextRequest) {
  const { user, hadCookie } = await readSession(req);
  if (user) return NextResponse.redirect(new URL(DEFAULT_HOME, req.url));
  const res = NextResponse.redirect(new URL("/auth/login", req.url));
  return hadCookie ? clearSessionCookie(res) : res;
}

// Todos os métodos, para um caminho desconhecido nunca responder 405.
export { handler as GET, handler as HEAD, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
