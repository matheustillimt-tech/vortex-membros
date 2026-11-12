import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { SESSION_COOKIE } from "./cookie";
import { getSession, getSessionUser, type SessionInfo, type User } from "./sessions";

export async function getCurrentUser(): Promise<User | null> {
  // Sessão depende do relógio (expiração) e do banco: sempre na hora da requisição, nunca num prerender.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(getDb(), token) : null;
}

export async function getUserFromRequest(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(getDb(), token) : null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return user;
}

/** Sessão da requisição (usuário + personificação); sem sessão → login. */
export async function requireSession(): Promise<SessionInfo> {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await getSession(getDb(), token) : null;
  if (!session) redirect("/auth/login");
  return session;
}

/** Sessão da requisição (usuário + personificação) ou null. */
export async function getCurrentSession(): Promise<SessionInfo | null> {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSession(getDb(), token) : null;
}
