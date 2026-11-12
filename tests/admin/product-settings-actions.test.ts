import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import { setDbForTests, type Database } from "@/db";
import { products } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import * as c from "@/lib/admin/content";
import { parseGeneralForm, parseHexColor, parseLessonPageForm, parseProductPageForm, parseTermsForm } from "@/lib/admin/product-settings";
import { resolveProductSettings } from "@/lib/settings";

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => session.user }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));

import * as a from "@/app/dashboard/content/product/[id]/settings-actions";

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
async function row(id: number) {
  return (await db.select().from(products).where(eq(products.id, id)))[0];
}
async function setup() {
  const s = await c.createShowcase(db, admin, { name: "V" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  const other = await c.createProduct(db, admin, { showcaseId: s.id, name: "Outro" });
  return { p: p.id, other: other.id };
}

const general = (p: number) => ({
  productId: p,
  name: "Novo nome",
  thumbnailUrl: "/media/900000001",
  accentColor: "#e91e63",
  offerUrl: "https://pay.x/oferta",
  isFree: "1",
  accessType: "days",
  accessDays: "365",
});
const productPage = (p: number) => ({
  productId: p,
  listing: "grid",
  modulesAsCarousel: "0",
  showModuleTitles: "1",
  thumbnailFormat: "16:9",
  showBanner: "1",
  bannerUrl: "/media/900000002",
});
const lessonPage = (p: number, next: number | "" = "") => ({
  productId: p,
  mobileVideoFirst: "0",
  theaterMode: "1",
  showModuleBar: "1",
  compactModuleBar: "0",
  showLessonNumbers: "0",
  showTotalProgress: "1",
  showMarkSeenButton: "1",
  keepButtonAfterSeen: "0",
  autoMarkSeen: "open",
  navigation: "thumbnail",
  nextProductId: next,
  nextProductButtonText: "Ir para o próximo",
});

// ---------- parse ----------

test("parse Geral: cor #hex , vitalício = null, limites de dias", () => {
  expect(parseGeneralForm(fd(general(1)))).toEqual({
    name: "Novo nome",
    thumbnailUrl: "/media/900000001",
    accentColor: "#e91e63",
    offerUrl: "https://pay.x/oferta",
    isFree: true,
    defaultAccessDays: 365,
  });
  expect(parseGeneralForm(fd({ ...general(1), accessType: "lifetime", accessDays: "", accentColor: "", offerUrl: "" }))).toMatchObject({
    defaultAccessDays: null,
    accentColor: null,
    offerUrl: null,
  });
  expect(parseHexColor(" #abc ")).toBe("#abc");
  for (const color of ["red", "rgb(1,2,3)", "#12345", "#e91e63;}", "url(x)"]) expect(() => parseHexColor(color), color).toThrow("Cor inválida.");
  for (const days of ["0", "-1", "36501", "1.5", "abc", ""])
    expect(() => parseGeneralForm(fd({ ...general(1), accessDays: days })), days).toThrow("Dias de acesso inválidos.");
  expect(() => parseGeneralForm(fd({ ...general(1), accessType: "forever" }))).toThrow("Requisição inválida.");
  expect(() => parseGeneralForm(fd({ ...general(1), isFree: "true" }))).toThrow("Requisição inválida.");
  expect(() => parseGeneralForm(fd({ ...general(1), offerUrl: "javascript:alert(1)" }))).toThrow("Endereço da oferta inválido.");
  expect(() => parseGeneralForm(fd({ ...general(1), thumbnailUrl: "//evil.com/x.png" }))).toThrow("Endereço de imagem inválido.");
  expect(() => parseGeneralForm(fd({ ...general(1), name: "  " }))).toThrow("Informe um nome.");
  const missing = fd(general(1));
  missing.delete("isFree");
  expect(() => parseGeneralForm(missing)).toThrow("Requisição inválida.");
});

test("parse Página do produto / da aula: enums em lista branca", () => {
  expect(parseProductPageForm(fd(productPage(1))).settings).toEqual({
    listing: "grid",
    modulesAsCarousel: false,
    showModuleTitles: true,
    thumbnailFormat: "16:9",
    showBanner: true,
    bannerUrl: "/media/900000002",
  });
  expect(() => parseProductPageForm(fd({ ...productPage(1), listing: "netflix" }))).toThrow("Requisição inválida.");
  expect(() => parseProductPageForm(fd({ ...productPage(1), thumbnailFormat: "3:2" }))).toThrow("Requisição inválida.");
  expect(() => parseProductPageForm(fd({ ...productPage(1), bannerUrl: "data:image/png;base64,x" }))).toThrow("Endereço de imagem inválido.");

  expect(parseLessonPageForm(fd(lessonPage(1, 7))).settings?.lesson).toMatchObject({ autoMarkSeen: true, navigation: "thumbnail", nextProductId: 7 });
  expect(parseLessonPageForm(fd(lessonPage(1))).settings?.lesson).toMatchObject({ nextProductId: null });
  expect(() => parseLessonPageForm(fd({ ...lessonPage(1), navigation: "carousel" }))).toThrow("Requisição inválida.");
  expect(() => parseLessonPageForm(fd({ ...lessonPage(1), autoMarkSeen: "1" }))).toThrow("Requisição inválida.");
  expect(() => parseLessonPageForm(fd({ ...lessonPage(1), nextProductId: "1 or 1=1" }))).toThrow("Requisição inválida.");
  expect(() => parseLessonPageForm(fd({ ...lessonPage(1), nextProductButtonText: "x".repeat(61) }))).toThrow("Texto do botão muito longo.");
});

test("parse Termo: toggle + blocos opcionais; JSON inválido recusado", () => {
  expect(parseTermsForm(fd({ termsEnabled: "1" }))).toEqual({ termsEnabled: true });
  expect(parseTermsForm(fd({ termsEnabled: "0", blocks: '{"blocks":[]}' }))).toMatchObject({ termsEnabled: false, termsBlocks: { blocks: [] } });
  for (const blocks of ["nope", '{"blocks":"x"}']) expect(() => parseTermsForm(fd({ termsEnabled: "1", blocks }))).toThrow("Requisição inválida.");
});

// ---------- actions ----------

test("Geral salva os campos do produto", async () => {
  const { p } = await setup();
  expect(await a.saveGeneralAction(fd(general(p)))).toEqual({ ok: true });
  expect(await row(p)).toMatchObject({
    name: "Novo nome",
    thumbnailUrl: "/media/900000001",
    accentColor: "#e91e63",
    offerUrl: "https://pay.x/oferta",
    isFree: true,
    defaultAccessDays: 365,
  });
  expect(revalidatePath).toHaveBeenCalled();
});

test("Página do produto e da aula salvam em settings sem perder o resto", async () => {
  const { p, other } = await setup();
  expect(await a.saveProductPageAction(fd(productPage(p)))).toEqual({ ok: true });
  expect(await a.saveLessonPageAction(fd(lessonPage(p, other)))).toEqual({ ok: true });
  const s = resolveProductSettings((await row(p)).settings);
  expect(s).toMatchObject({ listing: "grid", modulesAsCarousel: false, thumbnailFormat: "16:9", showBanner: true, bannerUrl: "/media/900000002" });
  expect(s.lesson).toMatchObject({
    theaterMode: true,
    mobileVideoFirst: false,
    compactModuleBar: false,
    autoMarkSeen: true,
    navigation: "thumbnail",
    nextProductId: other,
    nextProductButtonText: "Ir para o próximo",
  });
});

test("Próximo produto: ele mesmo, inexistente ou excluído é recusado", async () => {
  const { p, other } = await setup();
  expect(await a.saveLessonPageAction(fd(lessonPage(p, p)))).toEqual({ ok: false, error: "Produto sugerido inválido." });
  expect(await a.saveLessonPageAction(fd(lessonPage(p, 123)))).toEqual({ ok: false, error: "Produto sugerido inválido." });
  await c.trashProduct(db, admin, other);
  expect(await a.saveLessonPageAction(fd(lessonPage(p, other)))).toEqual({ ok: false, error: "Produto sugerido inválido." });
  expect(resolveProductSettings((await row(p)).settings).lesson.nextProductId).toBeNull();
});

test("Termo: HTML gerado no servidor e sanitizado; sem blocos o texto não muda", async () => {
  const { p } = await setup();
  const blocks = {
    blocks: [
      { type: "paragraph", data: { text: 'Aceito <b>as regras</b><img src=x onerror="y()">' } },
      { type: "raw", data: { html: '<p onclick="z()">Antigo</p><script>x()</script><iframe src="https://evil.com"></iframe>' } },
    ],
  };
  expect(await a.saveTermsAction(fd({ productId: p, termsEnabled: "1", blocks: JSON.stringify(blocks), termsHtml: "<script>cliente</script>" }))).toEqual({ ok: true });
  const r = await row(p);
  expect(r.termsEnabled).toBe(true);
  expect(r.termsHtml).toMatch(/^<p>Aceito <b>as regras<\/b><\/p>\n<p>Antigo<\/p>/);
  expect(r.termsHtml).not.toMatch(/script|onerror|onclick|evil\.com|cliente/);
  expect(await a.saveTermsAction(fd({ productId: p, termsEnabled: "0" }))).toEqual({ ok: true });
  expect(await row(p)).toMatchObject({ termsEnabled: false, termsHtml: r.termsHtml });
});

test("entrada inválida é recusada sem gravar nada", async () => {
  const { p } = await setup();
  const before = await row(p);
  const cases: [Promise<unknown>, string][] = [
    [a.saveGeneralAction(fd({ ...general(p), accentColor: "red;}" })), "Cor inválida."],
    [a.saveGeneralAction(fd({ ...general(p), offerUrl: "javascript:x" })), "Endereço da oferta inválido."],
    [a.saveGeneralAction(fd({ ...general(p), accessDays: "999999" })), "Dias de acesso inválidos."],
    [a.saveGeneralAction(fd({ ...general(p), productId: "1;drop" })), "Requisição inválida."],
    [a.saveProductPageAction(fd({ ...productPage(p), listing: "__proto__" })), "Requisição inválida."],
    [a.saveLessonPageAction(fd({ ...lessonPage(p), showModuleBar: "yes" })), "Requisição inválida."],
    [a.saveTermsAction(fd({ productId: p, termsEnabled: "1", blocks: "x" })), "Requisição inválida."],
    [a.saveGeneralAction(fd(general(999))), "Não encontrado."],
  ];
  for (const [res, error] of cases) expect(await res, error).toEqual({ ok: false, error });
  expect(await row(p)).toEqual(before);
  expect(revalidatePath).not.toHaveBeenCalled();
});

test("aluno e visitante: recusados, nada gravado", async () => {
  const { p } = await setup();
  const before = await db.select().from(products).orderBy(asc(products.id));
  for (const who of [student, null]) {
    session.user = who;
    const denied = { ok: false, error: "Acesso restrito a administradores." };
    expect(await a.saveGeneralAction(fd(general(p)))).toEqual(denied);
    expect(await a.saveProductPageAction(fd(productPage(p)))).toEqual(denied);
    expect(await a.saveLessonPageAction(fd(lessonPage(p)))).toEqual(denied);
    expect(await a.saveTermsAction(fd({ productId: p, termsEnabled: "1", blocks: '{"blocks":[]}' }))).toEqual(denied);
  }
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(await db.select().from(products).orderBy(asc(products.id))).toEqual(before);
});

test("getProductSettingsForEdit: só admin; produto excluído = não encontrado", async () => {
  const { p, other } = await setup();
  expect((await c.getProductSettingsForEdit(db, admin, p)).settings.listing).toBe("streaming");
  await expect(c.getProductSettingsForEdit(db, student, p)).rejects.toThrow("Acesso restrito a administradores.");
  await c.trashProduct(db, admin, other);
  await expect(c.getProductSettingsForEdit(db, admin, other)).rejects.toThrow("Não encontrado.");
  expect((await c.listProductOptions(db, admin)).map((x) => x.id)).toEqual([p]);
});
