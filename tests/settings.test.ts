import { beforeAll, expect, test } from "vitest";
import { createTestDb } from "./helpers/db";
import { platformSettings } from "@/db/schema";
import type { Database } from "@/db";
import { DEFAULT_PRODUCT_SETTINGS, DEFAULT_SETTINGS, getPlatformSettings, resolveProductSettings } from "@/lib/settings";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});

test("sem linha retorna o padrão", async () => {
  expect(await getPlatformSettings(db)).toEqual(DEFAULT_SETTINGS);
});

test("cor de destaque padrão é a laranja (#ff7500)", () => {
  expect(DEFAULT_SETTINGS.accentColor).toBe("#ff7500");
});

test("getPlatformSettings mescla salvo sobre o padrão", async () => {
  await db.insert(platformSettings).values({
    id: 1,
    data: { accentColor: "#00ff00", footer: { show: false }, menuLinks: [{ label: "A", url: "https://a.com" }] },
  });
  const s = await getPlatformSettings(db);
  expect(s.accentColor).toBe("#00ff00");
  expect(s.footer.show).toBe(false);
  expect(s.footer.legalNotice).toBe(true);
  expect(s.auth.defaultPassword).toBe("123456");
  expect(s.menuLinks).toEqual([{ label: "A", url: "https://a.com" }]);
  expect(DEFAULT_SETTINGS.footer.show).toBe(true);
});

test("resolveProductSettings", () => {
  expect(resolveProductSettings(null)).toEqual(DEFAULT_PRODUCT_SETTINGS);
  expect(resolveProductSettings({})).toEqual(DEFAULT_PRODUCT_SETTINGS);
  const r = resolveProductSettings({ listing: "grid", lesson: { nextProductId: 5, autoMarkSeen: true } });
  expect(r.listing).toBe("grid");
  expect(r.lesson.nextProductId).toBe(5);
  expect(r.lesson.autoMarkSeen).toBe(true);
  expect(r.lesson.showModuleBar).toBe(true);
  expect(r.thumbnailFormat).toBe("4:7");
});

test("padrões da aula/listagem seguem os artboards (vídeo primeiro, lista compacta, sem progresso total)", () => {
  expect(DEFAULT_PRODUCT_SETTINGS.lesson.mobileVideoFirst).toBe(true);
  expect(DEFAULT_PRODUCT_SETTINGS.lesson.compactModuleBar).toBe(true);
  expect(DEFAULT_PRODUCT_SETTINGS.lesson.showTotalProgress).toBe(false);
  expect(resolveProductSettings({ lesson: { compactModuleBar: false } }).lesson.compactModuleBar).toBe(false);
});

test("kiwify: padrão e validação do segredo, do token e dos ignorados", async () => {
  const { resolvePlatformSettings } = await import("@/lib/settings");
  expect(DEFAULT_SETTINGS.kiwify).toEqual({ webhookSecret: null, signatureToken: null, ignoredProductIds: [] });
  const secret = "a".repeat(40) + "-_Z";
  const ok = resolvePlatformSettings({
    kiwify: { webhookSecret: secret, signatureToken: "  tok  ", ignoredProductIds: [" 10288 ", "10288", "", 5, "x".repeat(101), "abc"] },
  });
  expect(ok.kiwify).toEqual({ webhookSecret: secret, signatureToken: "tok", ignoredProductIds: ["10288", "abc"] });
  const bad = resolvePlatformSettings({ kiwify: { webhookSecret: "curto", signatureToken: "x".repeat(201), ignoredProductIds: "10288" } });
  expect(bad.kiwify).toEqual({ webhookSecret: null, signatureToken: null, ignoredProductIds: [] });
  expect(resolvePlatformSettings({ kiwify: { webhookSecret: 12 } }).kiwify.webhookSecret).toBeNull();
  expect(resolvePlatformSettings({ kiwify: { webhookSecret: "a".repeat(42) + "=" } }).kiwify.webhookSecret).toBeNull();
  const many = resolvePlatformSettings({ kiwify: { ignoredProductIds: Array.from({ length: 250 }, (_, i) => `id-${i}`) } });
  expect(many.kiwify.ignoredProductIds).toHaveLength(200);
});

test('produto: listagem "Nenhum" é aceita; valor desconhecido volta ao padrão', () => {
  expect(resolveProductSettings({ listing: "none" }).listing).toBe("none");
  expect(resolveProductSettings({ listing: "x" as never }).listing).toBe("streaming");
});
