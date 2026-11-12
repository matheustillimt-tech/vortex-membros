import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DEFAULT_HOME } from "@/lib/auth/redirect";
import type { User } from "@/lib/auth/sessions";
import { AdminError } from "./errors";

export const ADMIN_ONLY_MESSAGE = "Acesso restrito a administradores.";

export type DashboardAccess = "login" | "home" | "ok";

/** Quem pode abrir o painel: sem sessão → login; aluno → home do aluno; admin → ok. */
export function resolveDashboardAccess(user: User | null): DashboardAccess {
  if (!user) return "login";
  return user.role === "admin" ? "ok" : "home";
}

/** Para a camada de dados e as server actions: lança se o usuário não for admin. */
export function assertAdmin(user: User | null): asserts user is User {
  if (resolveDashboardAccess(user) !== "ok") throw new AdminError(ADMIN_ONLY_MESSAGE);
}

/** Para páginas/layouts do painel. O proxy já barra antes (307); isto é a segunda camada. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  const access = resolveDashboardAccess(user);
  if (access === "login") redirect("/auth/login?redirect=/dashboard");
  if (access === "home") redirect(DEFAULT_HOME);
  return user as User;
}
