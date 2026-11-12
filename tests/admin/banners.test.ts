import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Database } from "@/db";
import { banners } from "@/db/schema";
import type { User } from "@/lib/auth/sessions";
import { getHomeBanner } from "@/lib/banners";
import * as b from "@/lib/admin/banners";
import * as c from "@/lib/admin/content";

const admin = { id: 1, email: "a@x.com", name: "a", role: "admin" } as User;
const student = { id: 2, email: "s@x.com", name: "s", role: "student" } as User;
const DENIED = "Acesso restrito a administradores.";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
});

const base = (over: Partial<b.BannerInput> = {}): b.BannerInput => ({
  name: "Principal",
  action: { type: "none" },
  desktopImageUrl: "/media/1",
  mobileImageUrl: null,
  videoUrl: null,
  mobileVideoUrl: null,
  heightPercent: null,
  ...over,
});
const configOf = async (id: number) => (await db.select().from(banners).where(eq(banners.id, id)))[0].config;

test("não-admin é recusado em toda função e nada é gravado", async () => {
  const { id } = await b.createBanner(db, admin, { name: "A" });
  for (const actor of [null, student]) {
    await expect(b.createBanner(db, actor, { name: "X" })).rejects.toThrow(DENIED);
    await expect(b.updateBanner(db, actor, id, base({ name: "X" }))).rejects.toThrow(DENIED);
    await expect(b.renameBanner(db, actor, id, "X")).rejects.toThrow(DENIED);
    await expect(b.setBannerStatus(db, actor, id, "hidden")).rejects.toThrow(DENIED);
    await expect(b.trashBanner(db, actor, id)).rejects.toThrow(DENIED);
    await expect(b.restoreBanner(db, actor, id)).rejects.toThrow(DENIED);
    await expect(b.reorderBanners(db, actor, [id])).rejects.toThrow(DENIED);
    await expect(b.listBanners(db, actor)).rejects.toThrow(DENIED);
    await expect(b.listBannerTrash(db, actor)).rejects.toThrow(DENIED);
    await expect(b.getBannerForEdit(db, actor, id)).rejects.toThrow(DENIED);
  }
  const rows = await db.select().from(banners);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: "A", status: "hidden", deletedAt: null });
});

test("criar, renomear, status, lixeira e restaurar (volta ao fim)", async () => {
  const a = await b.createBanner(db, admin, { name: "  A  " });
  const second = await b.createBanner(db, admin, { name: "B" });
  expect(a.id).toBeGreaterThanOrEqual(900000000);
  expect(await b.listBanners(db, admin)).toMatchObject([
    { id: a.id, name: "A", status: "hidden", imageUrl: null },
    { id: second.id, name: "B" },
  ]);
  await expect(b.createBanner(db, admin, { name: " " })).rejects.toThrow("Informe um nome.");
  await b.renameBanner(db, admin, a.id, "Principal");
  await b.setBannerStatus(db, admin, a.id, "published");
  expect((await b.getBannerForEdit(db, admin, a.id)).status).toBe("published");
  await b.setBannerStatus(db, admin, a.id, "hidden");
  await expect(b.setBannerStatus(db, admin, a.id, "x" as never)).rejects.toThrow("Status inválido.");
  expect((await b.getBannerForEdit(db, admin, a.id)).status).toBe("hidden");

  await b.trashBanner(db, admin, a.id);
  expect((await b.listBanners(db, admin)).map((r) => r.id)).toEqual([second.id]);
  expect((await b.listBannerTrash(db, admin)).map((r) => r.id)).toEqual([a.id]);
  await expect(b.getBannerForEdit(db, admin, a.id)).rejects.toThrow("Não encontrado.");
  await expect(b.trashBanner(db, admin, a.id)).rejects.toThrow("Não encontrado.");
  await expect(b.restoreBanner(db, admin, second.id)).rejects.toThrow("Não encontrado.");

  await b.restoreBanner(db, admin, a.id);
  expect((await b.listBanners(db, admin)).map((r) => r.id)).toEqual([second.id, a.id]);
  expect(await b.listBannerTrash(db, admin)).toEqual([]);
});

test("lixeira tira o banner da home e restaurar devolve", async () => {
  const { id } = await b.createBanner(db, admin, { name: "A" });
  await b.updateBanner(db, admin, id, base());
  expect(await getHomeBanner(db)).toBeNull(); // novo banner começa oculto
  await b.setBannerStatus(db, admin, id, "published");
  expect((await getHomeBanner(db))?.id).toBe(id);
  await b.trashBanner(db, admin, id);
  expect(await getHomeBanner(db)).toBeNull();
  await b.restoreBanner(db, admin, id);
  expect((await getHomeBanner(db))?.id).toBe(id);
});

test("reordenar: precisa cobrir exatamente os banners ativos; inválido não grava nada", async () => {
  const x = await b.createBanner(db, admin, { name: "X" });
  const y = await b.createBanner(db, admin, { name: "Y" });
  const z = await b.createBanner(db, admin, { name: "Z" });
  const trashed = await b.createBanner(db, admin, { name: "T" });
  await b.trashBanner(db, admin, trashed.id);

  for (const bad of [[x.id, y.id], [x.id, y.id, z.id, trashed.id], [x.id, x.id, y.id], [x.id, y.id, 999], [z.id, y.id, x.id, x.id], [1.5, y.id, z.id]]) {
    await expect(b.reorderBanners(db, admin, bad)).rejects.toThrow("Ordem inválida.");
  }
  expect((await b.listBanners(db, admin)).map((r) => r.id)).toEqual([x.id, y.id, z.id]);

  await b.reorderBanners(db, admin, [z.id, x.id, y.id]);
  expect((await b.listBanners(db, admin)).map((r) => r.id)).toEqual([z.id, x.id, y.id]);
  for (const r of [x, y, z]) {
    await b.updateBanner(db, admin, r.id, base());
    await b.setBannerStatus(db, admin, r.id, "published");
  }
  expect((await getHomeBanner(db))?.id).toBe(z.id);
});

test("salvar: ações, imagens, vídeo e altura validados; textos antigos preservados", async () => {
  const s = await c.createShowcase(db, admin, { name: "V" });
  const p = await c.createProduct(db, admin, { showcaseId: s.id, name: "P" });
  const gone = await c.createProduct(db, admin, { showcaseId: s.id, name: "Excluído" });
  await c.trashProduct(db, admin, gone.id);
  const { id } = await b.createBanner(db, admin, { name: "A" });
  await db.update(banners).set({ config: { title: "Antigo", text: "Texto", buttonText: "Ir" } }).where(eq(banners.id, id));

  await b.updateBanner(
    db,
    admin,
    id,
    base({
      name: " Novo ",
      action: { type: "product", productId: p.id },
      mobileImageUrl: "https://cdn.exemplo.com/m.jpg",
      videoUrl: "https://vimeo.com/123",
      heightPercent: 60,
    }),
  );
  expect(await configOf(id)).toEqual({
    title: "Antigo",
    text: "Texto",
    buttonText: "Ir",
    action: { type: "product", productId: p.id },
    desktopImageUrl: "/media/1",
    mobileImageUrl: "https://cdn.exemplo.com/m.jpg",
    videoUrl: "https://vimeo.com/123",
    mobileVideoUrl: null,
    heightPercent: 60,
  });
  expect(await b.getBannerForEdit(db, admin, id)).toMatchObject({ name: "Novo", action: { type: "product", productId: p.id }, heightPercent: 60 });

  await b.updateBanner(db, admin, id, base({ action: { type: "external", url: " https://exemplo.com/oferta ", newTab: true } }));
  expect(await configOf(id)).toMatchObject({ action: { type: "external", url: "https://exemplo.com/oferta", newTab: true } });
  expect((await configOf(id)).heightPercent).toBeUndefined();

  const before = await configOf(id);
  const bad: [Partial<b.BannerInput>, string][] = [
    [{ name: "" }, "Informe um nome."],
    [{ action: { type: "product", productId: gone.id } }, "Escolha um produto."],
    [{ action: { type: "product", productId: 424242 } }, "Escolha um produto."],
    [{ action: { type: "external", url: "javascript:alert(1)", newTab: false } }, "Informe um endereço de destino válido (http ou https)."],
    [{ action: { type: "external", url: "", newTab: false } }, "Informe um endereço de destino válido (http ou https)."],
    [{ action: { type: "weird" } as never }, "Requisição inválida."],
    [{ desktopImageUrl: "javascript:alert(1)" }, "Endereço de imagem inválido."],
    [{ mobileImageUrl: "//evil.com/x.jpg" }, "Endereço de imagem inválido."],
    [{ videoUrl: "http://vimeo.com/1" }, "Endereço de vídeo inválido."],
    [{ mobileVideoUrl: "data:text/html,x" }, "Endereço de vídeo inválido."],
    [{ heightPercent: 0 }, "Informe uma altura de 10 a 100%."],
    [{ heightPercent: 101 }, "Informe uma altura de 10 a 100%."],
    [{ heightPercent: 50.5 }, "Informe uma altura de 10 a 100%."],
  ];
  for (const [over, message] of bad) {
    await expect(b.updateBanner(db, admin, id, base(over))).rejects.toThrow(message);
  }
  expect(await configOf(id)).toEqual(before);
  await expect(b.updateBanner(db, admin, 424242, base())).rejects.toThrow("Não encontrado.");
});
