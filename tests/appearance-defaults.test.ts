import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

vi.mock("next/font/google", () => ({ Inter: () => ({ className: "inter-font" }) }));

import { AuthShell } from "@/components/auth/auth-shell";
import { AreaFooter } from "@/components/area/footer";
import { Logo } from "@/components/area/logo";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { themeProps } from "@/lib/theme";

/**
 * Guarda: com as configurações padrão, a área do aluno e o login renderizam exatamente como
 * antes das configurações de aparência. Os snapshots
 * foram gravados antes das configurações de aparência; se mudarem, a mudança vaza para quem não configurou nada.
 */
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

test("login (AuthShell) com as configurações padrão", () => {
  expect(html(createElement(AuthShell, { settings: DEFAULT_SETTINGS } as Parameters<typeof AuthShell>[0], createElement("form", { id: "f" })))).toMatchSnapshot();
});

test("área do aluno: tema, rodapé e logo com as configurações padrão", () => {
  expect(themeProps(DEFAULT_SETTINGS)).toMatchSnapshot();
  expect(html(createElement(AreaFooter, { settings: DEFAULT_SETTINGS }))).toMatchSnapshot();
  expect(html(createElement(Logo, { src: DEFAULT_SETTINGS.logoUrl, siteName: DEFAULT_SETTINGS.siteName }))).toMatchSnapshot();
});

test("configurações padrão: nada extra é renderizado nem aplicado", async () => {
  const { platformIdentity } = await import("@/lib/theme");
  const { resolvePlatformSettings } = await import("@/lib/settings");
  const { dashboardBrandStyle } = await import("@/app/dashboard/data");
  expect(platformIdentity(DEFAULT_SETTINGS)).toBeNull();
  expect(resolvePlatformSettings({})).toEqual(DEFAULT_SETTINGS);
  expect(resolvePlatformSettings(null)).toEqual(DEFAULT_SETTINGS);
  expect(dashboardBrandStyle(DEFAULT_SETTINGS)).toBeUndefined();
  expect(dashboardBrandStyle({ ...DEFAULT_SETTINGS, adminArea: { ...DEFAULT_SETTINGS.adminArea, accentColor: "#E91E63" } })).toBeUndefined();
});
