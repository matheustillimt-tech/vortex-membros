import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { createTestDb } from "./helpers/db";
import { banners, products, showcases } from "@/db/schema";
import { getHomeBanner } from "@/lib/banners";

const img = "/media/1";

test("getHomeBanner devolve o primeiro banner publicado e não excluído por posição", async () => {
  const db = await createTestDb();
  expect(await getHomeBanner(db)).toBeNull();
  await db.insert(banners).values([
    { name: "oculto", position: 0, status: "hidden", config: { title: "oculto", desktopImageUrl: img } },
    { name: "excluido", position: 1, status: "published", deletedAt: new Date(), config: { title: "excluido", desktopImageUrl: img } },
    { name: "segundo", position: 3, status: "published", config: { title: "segundo", desktopImageUrl: img } },
    { name: "primeiro", position: 2, status: "published", config: { title: "primeiro", desktopImageUrl: img } },
  ]);
  expect((await getHomeBanner(db))?.config.title).toBe("primeiro");
});

test("getHomeBanner pula banners sem imagem (só celular também vale)", async () => {
  const db = await createTestDb();
  await db.insert(banners).values([
    { name: "vazio", position: 0, status: "published", config: {} },
    { name: "url ruim", position: 1, status: "published", config: { desktopImageUrl: "javascript:alert(1)", mobileImageUrl: "" } },
    { name: "celular", position: 2, status: "published", config: { mobileImageUrl: img } },
    { name: "desktop", position: 3, status: "published", config: { desktopImageUrl: img } },
  ]);
  expect((await getHomeBanner(db))?.name).toBe("celular");
});

test("produto do banner excluído ou oculto: banner aparece sem link", async () => {
  const db = await createTestDb();
  const [s] = await db.insert(showcases).values({ name: "V", status: "published" }).returning();
  const [ok, hidden, gone] = await db
    .insert(products)
    .values([
      { showcaseId: s.id, name: "ok", status: "published" },
      { showcaseId: s.id, name: "oculto", status: "hidden" },
      { showcaseId: s.id, name: "excluído", status: "published", deletedAt: new Date() },
    ])
    .returning();
  const [banner] = await db
    .insert(banners)
    .values({ name: "B", status: "published", config: { desktopImageUrl: img, title: "t", action: { type: "product", productId: ok.id } } })
    .returning();
  expect((await getHomeBanner(db))?.config.action).toEqual({ type: "product", productId: ok.id });
  for (const p of [hidden, gone]) {
    await db.update(banners).set({ config: { ...banner.config, action: { type: "product", productId: p.id } } }).where(eq(banners.id, banner.id));
    const home = await getHomeBanner(db);
    expect(home?.config).toEqual({ desktopImageUrl: img, title: "t", action: { type: "none" } });
  }
  // o banner gravado não muda (o painel continua mostrando o produto escolhido)
  expect((await db.select().from(banners))[0].config.action).toEqual({ type: "product", productId: gone.id });
});
