import sharp from "sharp";

/**
 * Versão reduzida para capas e miniaturas: webp na largura pedida. GIF (pode ser animado) e imagem
 * que já cabe na largura saem como estão.
 */
export async function resizeImage(bytes: Uint8Array, mime: string, width: number): Promise<{ bytes: Uint8Array; mime: string }> {
  if (mime === "image/gif") return { bytes, mime };
  const img = sharp(bytes);
  const meta = await img.metadata();
  if (!meta.width || meta.width <= width) return { bytes, mime };
  const out = await img.rotate().resize({ width }).webp({ quality: 80 }).toBuffer();
  return out.byteLength < bytes.byteLength ? { bytes: new Uint8Array(out), mime: "image/webp" } : { bytes, mime };
}
