import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { platformSettings } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { termsHash } from "@/lib/catalog/first-access-terms";
import { DEFAULT_SETTINGS, getPlatformSettings } from "@/lib/settings";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
  notFound: vi.fn(),
}));

import * as a from "@/app/dashboard/settings/actions";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
  setDbForTests(db);
  session.user = admin;
  revalidatePath.mockClear();
});
afterEach(() => setDbForTests(null));

function fd(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}
const appearance = { accentColor: "#00ff00", theme: "light", fontSize: "default", logoUrl: "/media/1", faviconUrl: "" };
const access = {
  logoUrl: "",
  logoAlign: "center",
  logoHeight: "",
  formSide: "left",
  loginTheme: "area",
  accentColor: "",
  imageUrl: "",
  imagePosition: "center",
  panelWidth: "wide",
};

test("não-admin é recusado em todas as actions e nada é gravado", async () => {
  for (const user of [student, null]) {
    session.user = user;
    const denied = { ok: false, error: "Acesso restrito a administradores." };
    expect(await a.saveStudentGeneralAction(fd({ siteName: "X" }))).toEqual(denied);
    expect(await a.saveStudentAppearanceAction(fd(appearance))).toEqual(denied);
    expect(await a.saveStudentFooterAction(fd({ footerShow: "0", legalNotice: "0", termsOn: "0", privacyOn: "0" }))).toEqual(denied);
    expect(await a.saveFirstAccessTermsAction(fd({ termsEnabled: "1" }))).toEqual(denied);
    expect(await a.saveAccessScreensAction(fd(access))).toEqual(denied);
    expect(await a.saveAdminAreaAction(fd({ accentColor: "#000000", logoUrl: "", collapsedIconUrl: "" }))).toEqual(denied);
  }
  expect(await db.select().from(platformSettings)).toEqual([]);
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("salvar cada tela grava e revalida painel, área do aluno e login", async () => {
  expect(await a.saveStudentGeneralAction(fd({ siteName: "Minha Escola", showcaseAutoScroll: "1" }))).toEqual({ ok: true });
  expect(await a.saveStudentAppearanceAction(fd(appearance))).toEqual({ ok: true });
  expect(await a.saveStudentFooterAction(fd({ footerShow: "1", legalNotice: "0", termsOn: "1", termsUrl: "https://x.com/t", privacyOn: "0" }))).toEqual({
    ok: true,
  });
  expect(await a.saveAccessScreensAction(fd(access))).toEqual({ ok: true });
  expect(await a.saveAdminAreaAction(fd({ accentColor: "#123456", logoUrl: "/media/2", collapsedIconUrl: "" }))).toEqual({ ok: true });
  const s = await getPlatformSettings(db);
  expect(s).toMatchObject({
    siteName: "Minha Escola",
    accentColor: "#00ff00",
    theme: "light",
    logoUrl: "/media/1",
    footer: { show: true, legalNotice: false, termsUrl: "https://x.com/t", privacyUrl: null },
    loginScreen: { formSide: "left", theme: "area", logoHeight: 45 },
    adminArea: { accentColor: "#123456", logoUrl: "/media/2", collapsedIconUrl: null },
  });
  for (const p of ["/area", "/dashboard", "/auth/login", "/auth/esqueci-senha"]) {
    expect(revalidatePath.mock.calls.some((c) => c[0] === p)).toBe(true);
  }
});

test("entrada inválida é recusada sem gravar", async () => {
  await a.saveStudentGeneralAction(fd({ siteName: "Antes", showcaseAutoScroll: "1" }));
  const before = await db.select().from(platformSettings);
  const cases: [() => Promise<unknown>, string][] = [
    [() => a.saveStudentGeneralAction(fd({ siteName: "" })), "Informe o título das páginas."],
    [() => a.saveStudentAppearanceAction(fd({ ...appearance, accentColor: "red" })), "Cor inválida."],
    [() => a.saveStudentAppearanceAction(fd({ ...appearance, logoUrl: "javascript:alert(1)" })), "Endereço de imagem inválido."],
    [() => a.saveStudentAppearanceAction(fd({ ...appearance, theme: "neon" })), "Requisição inválida."],
    [() => a.saveAccessScreensAction(fd({ ...access, logoHeight: "999" })), "Informe uma altura de 20 a 120 px."],
    [() => a.saveAccessScreensAction(fd({ ...access, panelWidth: "x" })), "Requisição inválida."],
    [() => a.saveAdminAreaAction(fd({ accentColor: "#zzz", logoUrl: "", collapsedIconUrl: "" })), "Cor inválida."],
    [() => a.saveFirstAccessTermsAction(fd({ termsEnabled: "1", blocks: "not json" })), "Requisição inválida."],
  ];
  for (const [call, error] of cases) expect(await call()).toEqual({ ok: false, error });
  expect(await db.select().from(platformSettings)).toEqual(before);
});

test("termo de primeiro acesso: salvar pelo painel", async () => {
  const blocks = JSON.stringify({ blocks: [{ type: "paragraph", data: { text: "Regras da escola" } }] });
  expect(await a.saveFirstAccessTermsAction(fd({ termsEnabled: "1", blocks }))).toEqual({ ok: true });
  expect((await getPlatformSettings(db)).firstAccessTerms).toEqual({ enabled: true, html: "<p>Regras da escola</p>", hash: termsHash("<p>Regras da escola</p>") });
  expect(DEFAULT_SETTINGS.firstAccessTerms.enabled).toBe(false);
});
