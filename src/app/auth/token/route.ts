import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";
import { loginWithToken } from "@/lib/auth/login";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { clientIp } from "@/lib/auth/client-ip";
import { createSession } from "@/lib/auth/sessions";
import { recordLoginSafely } from "@/lib/students/events";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const login_token = searchParams.get("login_token");
  const db = getDb();
  const user = login_token ? await loginWithToken(db, login_token) : null;
  if (!user) return NextResponse.redirect(new URL("/auth/login?link=invalido", req.url));
  await recordLoginSafely(db, user, { via: "link", ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") ?? "" });

  const { token, expiresAt } = await createSession(db, user.id, { remember: true });
  const res = NextResponse.redirect(new URL(safeRedirectPath(searchParams.get("redirect")), req.url));
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
