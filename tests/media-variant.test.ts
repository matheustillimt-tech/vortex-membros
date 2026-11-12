import sharp from "sharp";
import { expect, test } from "vitest";
import { resizeImage } from "@/lib/media-resize";
import { sizedImageUrl } from "@/lib/media-url";

test("capas do painel ganham a versão de 600 px; endereço externo fica igual", () => {
  expect(sizedImageUrl("/media/7", 600)).toBe("/media/7/600");
  expect(sizedImageUrl("https://cdn.exemplo.com/files/X", 600)).toBe("https://cdn.exemplo.com/files/X");
  expect(sizedImageUrl("/media/7/600", 600)).toBe("/media/7/600");
  expect(sizedImageUrl(null, 600)).toBeNull();
});

test("redução: imagem grande vira webp de 600 px; pequena e GIF saem como estão", async () => {
  const big = new Uint8Array(await sharp({ create: { width: 1200, height: 2133, channels: 3, background: "#f60" } }).png().toBuffer());
  const r = await resizeImage(big, "image/png", 600);
  expect(r.mime).toBe("image/webp");
  expect((await sharp(r.bytes).metadata()).width).toBe(600);

  const small = new Uint8Array(await sharp({ create: { width: 400, height: 700, channels: 3, background: "#000" } }).png().toBuffer());
  expect(await resizeImage(small, "image/png", 600)).toEqual({ bytes: small, mime: "image/png" });
  expect(await resizeImage(big, "image/gif", 600)).toEqual({ bytes: big, mime: "image/gif" });
});
