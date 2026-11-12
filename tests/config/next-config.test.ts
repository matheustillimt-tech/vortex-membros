import { expect, test } from "vitest";
import nextConfig from "../../next.config";

test("/auth/:path* envia no-store e same-origin (POST nativo leva Origin; nada vaza para fora)", async () => {
  const rules = await nextConfig.headers!();
  const auth = rules.find((r) => r.source === "/auth/:path*");
  expect(auth?.headers).toEqual(
    expect.arrayContaining([
      { key: "Cache-Control", value: "no-store" },
      { key: "Referrer-Policy", value: "same-origin" },
    ]),
  );
});

test("redirect do login_token antigo continua configurado", async () => {
  const redirects = await nextConfig.redirects!();
  expect(redirects).toContainEqual(
    expect.objectContaining({ source: "/auth/login", destination: "/auth/token", has: [{ type: "query", key: "login_token" }] }),
  );
});
