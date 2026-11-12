import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/area/vitrine/home", useRouter: () => ({ push: () => {} }) }));

import { AreaHeader } from "@/components/area/header";
import type { User } from "@/lib/auth/sessions";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const base = {
  id: 1,
  email: "pessoa@exemplo.com",
  name: "Pessoa Teste",
  document: null,
  phone: null,
  address: null,
  passwordHash: "x",
  loginToken: "t",
  createdAt: new Date(),
  lastAccessAt: null,
  deletedAt: null,
} as unknown as User;

const render = (role: "admin" | "student") =>
  renderToStaticMarkup(createElement(AreaHeader, { user: { ...base, role } as User, settings: DEFAULT_SETTINGS }));

test("admin vê o link para o painel administrativo no menu do avatar", () => {
  const html = render("admin");
  expect(html).toContain('href="/dashboard"');
  expect(html).toContain("Painel administrativo");
});

test("aluno não vê o link para o painel", () => {
  const html = render("student");
  expect(html).not.toContain('href="/dashboard"');
  expect(html).not.toContain("Painel administrativo");
});
