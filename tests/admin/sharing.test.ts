import { expect, test } from "vitest";
import * as f from "@/lib/admin/settings-forms";
import { DEFAULT_SETTINGS, resolvePlatformSettings } from "@/lib/settings";
import { sharingMetadata } from "@/lib/sharing-metadata";

function fd(fields: Record<string, string>) {
  const out = new FormData();
  for (const [k, v] of Object.entries(fields)) out.set(k, v);
  return out;
}

test("Compartilhamento: formulário limpa, limita e só aceita imagem enviada ou https", () => {
  expect(f.parseSharingForm(fd({ shareTitle: "  Meu curso ", shareDescription: " Aprenda\n  IA ", shareImageUrl: "/media/7" }))).toEqual({
    sharing: { title: "Meu curso", description: "Aprenda IA", imageUrl: "/media/7" },
  });
  expect(f.parseSharingForm(fd({ shareTitle: "", shareDescription: "", shareImageUrl: "" }))).toEqual({
    sharing: { title: "", description: "", imageUrl: null },
  });
  expect(() => f.parseSharingForm(fd({ shareTitle: "x".repeat(121), shareDescription: "", shareImageUrl: "" }))).toThrow("Título muito longo.");
  expect(() => f.parseSharingForm(fd({ shareTitle: "", shareDescription: "x".repeat(301), shareImageUrl: "" }))).toThrow("Descrição muito longa.");
  expect(() => f.parseSharingForm(fd({ shareTitle: "", shareDescription: "", shareImageUrl: "javascript:alert(1)" }))).toThrow();
});

test("Compartilhamento: padrão vazio e configurações antigas sem o campo", () => {
  expect(DEFAULT_SETTINGS.sharing).toEqual({ title: "", description: "", imageUrl: null });
  expect(resolvePlatformSettings({ siteName: "X" }).sharing).toEqual({ title: "", description: "", imageUrl: null });
});

test("Compartilhamento: metadados só quando há algo configurado, com a imagem em endereço absoluto", () => {
  expect(sharingMetadata(DEFAULT_SETTINGS.sharing, "https://a.com")).toEqual({});
  const m = sharingMetadata({ title: "Curso", description: "Desc", imageUrl: "/media/7" }, "https://a.com");
  expect(m.metadataBase?.toString()).toBe("https://a.com/");
  expect(m.description).toBe("Desc");
  expect(m.openGraph).toMatchObject({ type: "website", title: "Curso", description: "Desc", images: [{ url: "/media/7", width: 1200, height: 630 }] });
  expect(m.twitter).toMatchObject({ card: "summary_large_image", images: ["/media/7"] });
  const semImagem = sharingMetadata({ title: "Curso", description: "", imageUrl: null }, "https://a.com");
  expect(semImagem.openGraph).not.toHaveProperty("images");
  expect(semImagem).not.toHaveProperty("description");
  expect(semImagem.twitter).toMatchObject({ card: "summary" });
});
