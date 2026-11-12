import type { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { SESSION_COOKIE, sessionCookieOptions } from "./cookie";
import { getSession, type User } from "./sessions";

/** Usuário da sessão do cookie, o admin que a abriu (personificação) e se havia um cookie (válido ou não). */
export async function readSession(req: NextRequest): Promise<{ user: User | null; impersonatedBy: number | null; hadCookie: boolean }> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return { user: null, impersonatedBy: null, hadCookie: false };
  const session = await getSession(getDb(), token);
  return { user: session?.user ?? null, impersonatedBy: session?.impersonatedBy ?? null, hadCookie: true };
}

/** Apaga o cookie de sessão na resposta (sessão expirada, revogada ou lixo). */
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0, expires: new Date(0) });
  return res;
}
