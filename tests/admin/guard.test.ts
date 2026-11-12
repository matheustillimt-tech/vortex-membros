import { expect, test } from "vitest";
import type { User } from "@/lib/auth/sessions";
import { assertAdmin, resolveDashboardAccess } from "@/lib/admin/guard";

function user(role: "student" | "admin"): User {
  return { id: 1, email: `${role}@x.com`, name: role, role } as User;
}

test("assertAdmin recusa sem usuário", () => {
  expect(() => assertAdmin(null)).toThrow("Acesso restrito a administradores.");
});

test("assertAdmin recusa aluno", () => {
  expect(() => assertAdmin(user("student"))).toThrow("Acesso restrito a administradores.");
});

test("assertAdmin aceita admin", () => {
  const u: User | null = user("admin");
  expect(() => assertAdmin(u)).not.toThrow();
});

test("resolveDashboardAccess: sem sessão → login; aluno → home; admin → ok", () => {
  expect(resolveDashboardAccess(null)).toBe("login");
  expect(resolveDashboardAccess(user("student"))).toBe("home");
  expect(resolveDashboardAccess(user("admin"))).toBe("ok");
});
