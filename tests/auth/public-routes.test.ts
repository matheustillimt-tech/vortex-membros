import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import nextConfig from "../../next.config";
import { config } from "@/proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig, url });

test("telas de acesso ficam fora do proxy de autenticação", () => {
  expect(matches("/auth/login")).toBe(false);
  expect(matches("/auth/esqueci-senha")).toBe(false);
  expect(matches("/auth/esqueci_minha_senha")).toBe(false);
  expect(matches("/auth/recuperar_senha/abc")).toBe(false);
  // Sanidade: a área do aluno continua protegida.
  expect(matches("/area/vitrine/home")).toBe(true);
});

test("/auth/esqueci-senha é uma página própria (rota estática vence o catch-all [...rest])", () => {
  const page = fileURLToPath(new URL("../../src/app/auth/esqueci-senha/page.tsx", import.meta.url));
  expect(existsSync(page)).toBe(true);
});

test("nenhum redirect da configuração captura /auth/esqueci-senha", async () => {
  const redirects = await nextConfig.redirects!();
  expect(redirects.some((r) => r.source === "/auth/esqueci-senha" || r.source === "/auth/:path*")).toBe(false);
});
