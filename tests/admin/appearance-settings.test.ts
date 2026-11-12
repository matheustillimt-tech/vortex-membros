import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { platformSettings } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";

vi.mock("next/font/google", () => ({ Inter: () => ({ className: "inter-font" }) }));

import { AuthShell } from "@/components/auth/auth-shell";
import { saveFirstAccessTerms, updatePlatformSettings } from "@/lib/admin/platform-settings";
import * as f from "@/lib/admin/settings-forms";
import { DEFAULT_SETTINGS, getPlatformSettings, resolvePlatformSettings, resolveProductSettings, type PlatformSettings } from "@/lib/settings";
import { platformIdentity } from "@/lib/theme";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;
const DENIED = "Acesso restrito a administradores.";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
});

function fd(fields: Record<string, string | number>) {
  const out = new FormData();
  for (const [k, v] of Object.entries(fields)) out.set(k, String(v));
  return out;
}
const withLogin = (l: Partial<PlatformSettings["loginScreen"]>, extra: Partial<PlatformSettings> = {}): PlatformSettings => ({
  ...DEFAULT_SETTINGS,
  ...extra,
  loginScreen: { ...DEFAULT_SETTINGS.loginScreen, ...l },
});
const shell = (s: PlatformSettings) => renderToStaticMarkup(createElement(AuthShell, { settings: s } as Parameters<typeof AuthShell>[0], "x"));

// ---------- deep merge seguro ----------

test("merge seguro: ignora __proto__/constructor/prototype e não polui Object.prototype", () => {
  const raw = JSON.parse('{"__proto__":{"polluted":"sim"},"constructor":{"prototype":{"x":1}},"footer":{"__proto__":{"show":false},"show":false}}');
  const s = resolvePlatformSettings(raw);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(s, "polluted")).toBe(false);
  expect(s.footer.show).toBe(false);
  expect(s.footer.legalNotice).toBe(true);
  expect(Object.getPrototypeOf(s)).toBe(Object.prototype);
  const p = resolveProductSettings(JSON.parse('{"__proto__":{"listing":"grid"},"lesson":{"constructor":1}}'));
  expect(p.listing).toBe("streaming");
  expect(({} as Record<string, unknown>).listing).toBeUndefined();
});

test("merge seguro: tipos errados e enums fora da lista voltam ao padrão", () => {
  const s = resolvePlatformSettings({
    accentColor: 5,
    theme: "azul",
    fontSize: "large",
    footer: "x",
    siteName: { a: 1 },
    menuLinks: [{ label: "A", url: "https://a.com" }, { label: 1 }, "x", null],
    loginScreen: { formSide: "meio", logoHeight: 500, theme: "light", panelWidth: "narrow", accentColor: "#123456" },
    adminArea: { accentColor: ["#000"], logoUrl: 7 },
    firstAccessTerms: { enabled: "sim", html: "<p>ok</p>" },
  });
  expect(s.accentColor).toBe("#ff7500");
  expect(s.theme).toBe("dark");
  expect(s.fontSize).toBe("large");
  expect(s.footer).toEqual(DEFAULT_SETTINGS.footer);
  expect(s.siteName).toBe(DEFAULT_SETTINGS.siteName);
  expect(s.menuLinks).toEqual([{ label: "A", url: "https://a.com" }]);
  expect(s.loginScreen).toMatchObject({ formSide: "right", logoHeight: 45, theme: "light", panelWidth: "narrow", accentColor: "#123456" });
  expect(s.adminArea.accentColor).toBe("#e91e63");
  expect(s.adminArea.logoUrl).toBe(7); // padrão null aceita número/string; quem lê passa por safeImageUrl
  expect(s.firstAccessTerms).toEqual({ enabled: false, html: "<p>ok</p>", hash: null });
  const p = resolveProductSettings({ listing: "x", thumbnailFormat: "16:9", lesson: { navigation: "y", autoMarkSeen: "true", nextProductId: 9 } });
  expect(p).toMatchObject({ listing: "streaming", thumbnailFormat: "16:9", lesson: { navigation: "simple", autoMarkSeen: false, nextProductId: 9 } });
});

// ---------- formulários ----------

test("Área do aluno: Geral, Aparência e Rodapé", () => {
  expect(f.parseStudentGeneralForm(fd({ siteName: "  Minha Escola ", showcaseAutoScroll: "1" }))).toEqual({ siteName: "Minha Escola", showcaseAutoScroll: true });
  expect(f.parseStudentGeneralForm(fd({ siteName: "X", showcaseAutoScroll: "0" }))).toEqual({ siteName: "X", showcaseAutoScroll: false });
  expect(() => f.parseStudentGeneralForm(fd({ siteName: "X" }))).toThrow("Requisição inválida.");
  expect(() => f.parseStudentGeneralForm(fd({ siteName: " " }))).toThrow("Informe o título das páginas.");
  expect(() => f.parseStudentGeneralForm(fd({ siteName: "x".repeat(121) }))).toThrow("Título muito longo.");
  expect(() => f.parseStudentGeneralForm(new FormData())).toThrow("Requisição inválida.");

  const ok = { accentColor: "#00FF00", theme: "light", fontSize: "large", logoUrl: "/media/12", faviconUrl: "https://cdn.x.com/f.png" };
  expect(f.parseStudentAppearanceForm(fd(ok))).toEqual({ ...ok });
  expect(f.parseStudentAppearanceForm(fd({ ...ok, logoUrl: "", faviconUrl: " " }))).toMatchObject({ logoUrl: null, faviconUrl: null });
  for (const [k, v, msg] of [
    ["accentColor", "red", "Cor inválida."],
    ["accentColor", "", "Informe uma cor."],
    ["accentColor", "#12345g", "Cor inválida."],
    ["theme", "blue", "Requisição inválida."],
    ["fontSize", "huge", "Requisição inválida."],
    ["logoUrl", "javascript:alert(1)", "Endereço de imagem inválido."],
    ["logoUrl", "//evil.com/x.png", "Endereço de imagem inválido."],
    ["logoUrl", "/demo/x.png", "Endereço de imagem inválido."],
    ["faviconUrl", "http://x.com/f.png", "Endereço de imagem inválido."],
    ["faviconUrl", "data:image/png;base64,AAA", "Endereço de imagem inválido."],
  ] as const) {
    expect(() => f.parseStudentAppearanceForm(fd({ ...ok, [k]: v }))).toThrow(msg);
  }

  const footer = { footerShow: "1", legalNotice: "0", termsOn: "1", termsUrl: "https://x.com/termos", privacyOn: "0", privacyUrl: "https://ignorado.com" };
  expect(f.parseStudentFooterForm(fd(footer))).toEqual({
    footer: { show: true, legalNotice: false, termsUrl: "https://x.com/termos", privacyUrl: null },
  });
  expect(() => f.parseStudentFooterForm(fd({ ...footer, termsUrl: "" }))).toThrow("Informe o link dos termos de uso.");
  expect(() => f.parseStudentFooterForm(fd({ ...footer, termsUrl: "javascript:x" }))).toThrow("Informe um link válido (http ou https).");
  expect(() => f.parseStudentFooterForm(fd({ ...footer, footerShow: "true" }))).toThrow("Requisição inválida.");
});

test("Telas de acesso: enums, altura e cores", () => {
  const ok = {
    logoUrl: "/media/3",
    logoAlign: "left",
    logoHeight: "60",
    formSide: "left",
    loginTheme: "light",
    accentColor: "",
    imageUrl: "https://cdn.x.com/a.jpg",
    imagePosition: "right",
    panelWidth: "default",
  };
  expect(f.parseAccessScreensForm(fd(ok))).toEqual({
    loginScreen: {
      logoUrl: "/media/3",
      logoAlign: "left",
      logoHeight: 60,
      formSide: "left",
      theme: "light",
      accentColor: null,
      imageUrl: "https://cdn.x.com/a.jpg",
      imagePosition: "right",
      panelWidth: "default",
    },
  });
  expect(f.parseAccessScreensForm(fd({ ...ok, logoHeight: "", accentColor: "#abc" })).loginScreen).toMatchObject({ logoHeight: 45, accentColor: "#abc" });
  for (const [k, v, msg] of [
    ["logoHeight", "19", "Informe uma altura de 20 a 120 px."],
    ["logoHeight", "121", "Informe uma altura de 20 a 120 px."],
    ["logoHeight", "4.5", "Informe uma altura de 20 a 120 px."],
    ["logoHeight", "-1", "Informe uma altura de 20 a 120 px."],
    ["logoAlign", "justify", "Requisição inválida."],
    ["formSide", "center", "Requisição inválida."],
    ["loginTheme", "auto", "Requisição inválida."],
    ["imagePosition", "top", "Requisição inválida."],
    ["panelWidth", "col-sm-6", "Requisição inválida."],
    ["accentColor", "url(x)", "Cor inválida."],
    ["imageUrl", "ftp://x.com/a.jpg", "Endereço de imagem inválido."],
  ] as const) {
    expect(() => f.parseAccessScreensForm(fd({ ...ok, [k]: v }))).toThrow(msg);
  }
});

test("Painel administrativo e termo de primeiro acesso", () => {
  expect(f.parseAdminAreaForm(fd({ accentColor: "#112233", logoUrl: "", collapsedIconUrl: "/media/9" }))).toEqual({
    adminArea: { accentColor: "#112233", logoUrl: null, collapsedIconUrl: "/media/9" },
  });
  expect(() => f.parseAdminAreaForm(fd({ accentColor: "", logoUrl: "", collapsedIconUrl: "" }))).toThrow("Informe uma cor.");
  expect(() => f.parseAdminAreaForm(fd({ accentColor: "#112233", logoUrl: "/etc/passwd", collapsedIconUrl: "" }))).toThrow(
    "Endereço de imagem inválido.",
  );
  expect(f.parseFirstAccessTermsForm(fd({ termsEnabled: "1" }))).toEqual({ enabled: true, blocks: null });
  expect(f.parseFirstAccessTermsForm(fd({ termsEnabled: "0", blocks: '{"blocks":[]}' }))).toEqual({ enabled: false, blocks: { blocks: [] } });
  expect(() => f.parseFirstAccessTermsForm(fd({ termsEnabled: "1", blocks: "{" }))).toThrow("Requisição inválida.");
  expect(() => f.parseFirstAccessTermsForm(fd({ termsEnabled: "x" }))).toThrow("Requisição inválida.");
});

// ---------- gravação ----------

test("updatePlatformSettings: só admin; mescla sem perder as outras chaves", async () => {
  await db.insert(platformSettings).values({ id: 1, data: { siteName: "Escola", demoContentVersion: 2, footer: { show: false } } });
  for (const actor of [null, student]) {
    await expect(updatePlatformSettings(db, actor, { siteName: "X" })).rejects.toThrow(DENIED);
    await expect(saveFirstAccessTerms(db, actor, { enabled: true, blocks: null })).rejects.toThrow(DENIED);
  }
  await updatePlatformSettings(db, admin, { footer: { legalNotice: false }, loginScreen: { formSide: "left" } });
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1));
  expect(row.data).toEqual({ siteName: "Escola", demoContentVersion: 2, footer: { show: false, legalNotice: false }, loginScreen: { formSide: "left" } });
  const s = await getPlatformSettings(db);
  expect(s.footer).toEqual({ ...DEFAULT_SETTINGS.footer, show: false, legalNotice: false });
  expect(s.loginScreen.formSide).toBe("left");
});

test("updatePlatformSettings cria a linha se não existir", async () => {
  await updatePlatformSettings(db, admin, { adminArea: { accentColor: "#000000" } });
  expect((await getPlatformSettings(db)).adminArea).toEqual({ ...DEFAULT_SETTINGS.adminArea, accentColor: "#000000" });
});

test("termo de primeiro acesso: HTML salvo sanitizado; desligar mantém o texto", async () => {
  await saveFirstAccessTerms(db, admin, {
    enabled: true,
    blocks: { blocks: [{ type: "paragraph", data: { text: 'Aceite <script>alert(1)</script><img src=x onerror="a()">' } }] },
  });
  let s = await getPlatformSettings(db);
  expect(s.firstAccessTerms.enabled).toBe(true);
  expect(s.firstAccessTerms.html).toContain("Aceite");
  expect(s.firstAccessTerms.html).not.toMatch(/<script|onerror/i);
  await saveFirstAccessTerms(db, admin, { enabled: false, blocks: null });
  s = await getPlatformSettings(db);
  expect(s.firstAccessTerms).toMatchObject({ enabled: false });
  expect(s.firstAccessTerms.html).toContain("Aceite");
});

// ---------- login respeita as configurações ----------

test("login respeita lado do formulário, logo, modo, cor, imagem e largura do painel", () => {
  const def = shell(DEFAULT_SETTINGS);
  expect(def).toContain(`min-[576px]:flex-row"`);
  expect(def).not.toContain("data-auth-theme");

  const left = shell(withLogin({ formSide: "left" }));
  expect(left).toContain("min-[576px]:flex-row-reverse");

  const custom = shell(
    withLogin({
      logoUrl: "/media/5",
      logoAlign: "right",
      logoHeight: 80,
      theme: "light",
      accentColor: "#123456",
      imageUrl: "/media/6",
      imagePosition: "left",
      panelWidth: "narrow",
    }),
  );
  expect(custom).toContain('src="/media/5"');
  expect(custom).toContain("justify-end");
  expect(custom).toContain("height:80px");
  expect(custom).toContain('data-auth-theme="light"');
  expect(custom).toContain('data-theme="light"');
  expect(custom).toContain("--accent:#123456");
  expect(custom).toContain("background-position:0% 50%");
  expect(custom).toContain("min-[576px]:max-w-[16.666667%]");

  // "Seguir a área do aluno": área clara → login claro; cor da área quando o login não tem a sua
  const follow = shell(withLogin({ theme: "area" }, { theme: "light", accentColor: "#00aa00" }));
  expect(follow).toContain('data-auth-theme="light"');
  expect(follow).toContain("--accent:#00aa00");
  // login escuro forçado com área clara
  expect(shell(withLogin({ theme: "dark" }, { theme: "light" }))).not.toContain("data-auth-theme");
  // cor/URLs perigosas não passam
  const evil = shell(withLogin({ accentColor: "red;background:url(x)", logoUrl: "javascript:alert(1)", imageUrl: "//evil.com/a.jpg" }));
  expect(evil).toContain("--accent:#ff7500");
  expect(evil).not.toContain("javascript:");
  expect(evil).not.toContain("evil.com");
});

test("título das páginas e favicon só aparecem quando configurados", () => {
  expect(platformIdentity(DEFAULT_SETTINGS)).toBeNull();
  expect(platformIdentity({ ...DEFAULT_SETTINGS, siteName: "Escola" })).toEqual({ title: "Escola", icon: null });
  expect(platformIdentity({ ...DEFAULT_SETTINGS, faviconUrl: "/media/4" })).toEqual({ title: null, icon: "/media/4" });
  expect(platformIdentity({ ...DEFAULT_SETTINGS, faviconUrl: "javascript:x" })).toBeNull();
});
