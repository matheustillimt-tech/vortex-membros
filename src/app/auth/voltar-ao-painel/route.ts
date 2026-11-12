import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";
import { getSession } from "@/lib/auth/sessions";
import { ADMIN_RETURN_COOKIE, endImpersonation } from "@/lib/students/impersonation";

/**
 * "Voltar ao painel" (faixa da personificação na área do aluno): encerra a sessão "como o aluno" e
 * devolve a sessão do admin, sem pedir senha, só se o cookie de retorno for uma sessão válida do mesmo
 * admin. Sem isso, a sessão personificada é encerrada e vai para o login.
 */
export async function GET(req: NextRequest) {
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  const returnToken = req.cookies.get(ADMIN_RETURN_COOKIE)?.value;
  const db = getDb();
  const back = await endImpersonation(db, { sessionToken, returnToken });
  const clear = { ...sessionCookieOptions(), maxAge: 0 };
  if (!back) {
    // Sessão normal de aluno (sem personificação): nada a fazer além de voltar à área.
    if (sessionToken && (await getSession(db, sessionToken))) {
      const res = NextResponse.redirect(new URL("/area/vitrine/home", req.url));
      if (returnToken) res.cookies.set(ADMIN_RETURN_COOKIE, "", clear);
      return res;
    }
    const res = NextResponse.redirect(new URL("/auth/login", req.url));
    res.cookies.set(SESSION_COOKIE, "", clear);
    res.cookies.set(ADMIN_RETURN_COOKIE, "", clear);
    return res;
  }
  const admin = await getSession(db, back.adminToken);
  const res = NextResponse.redirect(new URL(`/dashboard/student/${back.studentId}`, req.url));
  res.cookies.set(SESSION_COOKIE, back.adminToken, sessionCookieOptions(admin?.expiresAt));
  res.cookies.set(ADMIN_RETURN_COOKIE, "", clear);
  return res;
}
