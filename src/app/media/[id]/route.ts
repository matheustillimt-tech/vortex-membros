import { cacheLife } from "next/cache";
import { getDb } from "@/db";
import { media } from "@/db/schema";
import { getMedia } from "@/lib/admin/media";

/**
 * Imagens enviadas pelo painel (públicas: logos aparecem na tela de login). O tipo foi verificado no upload.
 *
 * Saem prontas da publicação (generateStaticParams lê os IDs do banco no build): a Vercel entrega sem
 * abrir conexão com o banco. Antes, cada capa da home abria uma instância e uma conexão, e a rajada
 * de ~25 capas esgotava os 15 clientes do pooler do Supabase (erro 500 no painel). Imagem enviada
 * depois da publicação vai ao banco uma vez e fica no cache ("use cache"); o ID é novo a cada upload.
 */
export async function generateStaticParams(): Promise<{ id: string }[]> {
  // Sem banco no build (ex.: Preview sem DATABASE_URL), tudo fica para a primeira visita.
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) return [];
  try {
    const rows = await getDb().select({ id: media.id }).from(media);
    return rows.map((r) => ({ id: String(r.id) }));
  } catch (err) {
    console.error("[media] build sem a lista de imagens:", err instanceof Error ? err.message : "erro");
    return [];
  }
}

async function loadMedia(id: Promise<string>) {
  "use cache";
  const raw = await id;
  const item = /^\d{1,15}$/.test(raw) ? await getMedia(getDb(), Number(raw)) : null;
  if (!item) {
    // "Não existe" não fica guardado por muito tempo.
    cacheLife("seconds");
    return null;
  }
  cacheLife("max");
  return { mime: item.mime, size: item.size, sha256: item.sha256, base64: Buffer.from(item.bytes).toString("base64") };
}

export async function GET(_req: Request, { params }: RouteContext<"/media/[id]">) {
  const item = await loadMedia(params.then((p) => p.id));
  if (!item) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(item.base64, "base64"), {
    headers: {
      "Content-Type": item.mime,
      "Content-Length": String(item.size),
      // Conteúdo imutável (id novo a cada upload): navegador e CDN guardam por um ano.
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${item.sha256}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
