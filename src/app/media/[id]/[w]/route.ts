import { cacheLife } from "next/cache";
import { getDb } from "@/db";
import { media } from "@/db/schema";
import { getMedia } from "@/lib/admin/media";
import { resizeImage } from "@/lib/media-resize";
import { MEDIA_WIDTHS } from "@/lib/media-url";

/** Capas e miniaturas reduzidas (/media/7/600). Como /media/[id]: prontas na publicação e imutáveis. */
export async function generateStaticParams(): Promise<{ id: string; w: string }[]> {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) return [];
  try {
    const rows = await getDb().select({ id: media.id }).from(media);
    return rows.flatMap((r) => MEDIA_WIDTHS.map((w) => ({ id: String(r.id), w: String(w) })));
  } catch (err) {
    console.error("[media] build sem a lista de imagens:", err instanceof Error ? err.message : "erro");
    return [];
  }
}

async function loadVariant(params: Promise<{ id: string; w: string }>) {
  "use cache";
  const { id, w } = await params;
  const width = Number(w);
  const item =
    /^\d{1,15}$/.test(id) && (MEDIA_WIDTHS as readonly number[]).includes(width) ? await getMedia(getDb(), Number(id)) : null;
  if (!item) {
    cacheLife("seconds");
    return null;
  }
  cacheLife("max");
  const out = await resizeImage(item.bytes, item.mime, width);
  return { mime: out.mime, etag: `${item.sha256}-${width}`, base64: Buffer.from(out.bytes).toString("base64") };
}

export async function GET(_req: Request, { params }: RouteContext<"/media/[id]/[w]">) {
  const item = await loadVariant(params);
  if (!item) return new Response("Not found", { status: 404 });
  const body = Buffer.from(item.base64, "base64");
  return new Response(body, {
    headers: {
      "Content-Type": item.mime,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${item.etag}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
