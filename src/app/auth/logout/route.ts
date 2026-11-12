import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";
import { revokeSession } from "@/lib/auth/sessions";
import { ADMIN_RETURN_COOKIE } from "@/lib/students/impersonation";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(getDb(), token);
  // Saindo durante "Entrar como o aluno": a sessão do admin guardada para o retorno também é encerrada.
  const returnToken = req.cookies.get(ADMIN_RETURN_COOKIE)?.value;
  if (returnToken) await revokeSession(getDb(), returnToken);
  const res = NextResponse.redirect(new URL("/auth/login", req.url));
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  // Retorno de "Entrar como o aluno" (se houver) não sobrevive ao logout.
  if (req.cookies.has(ADMIN_RETURN_COOKIE)) res.cookies.set(ADMIN_RETURN_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
