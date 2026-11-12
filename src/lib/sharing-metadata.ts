import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { getAppUrl } from "@/lib/auth/app-url";
import { DEFAULT_SETTINGS, getPlatformSettings, type PlatformSettings } from "@/lib/settings";

export const SHARING_TAG = "platform-sharing";

type Sharing = PlatformSettings["sharing"];

/**
 * Configurações → Compartilhamento, lidas com "use cache" porque entram nos metadados de toda página
 * (inclusive as que saem prontas da publicação). Salvar chama updateTag(SHARING_TAG);,
 * as redes sociais ainda podem levar um tempo para buscar a prévia nova.
 */
async function loadSharing(): Promise<Sharing> {
  "use cache";
  cacheTag(SHARING_TAG);
  cacheLife("hours");
  // Sem banco no build (ex.: Preview sem DATABASE_URL): sem prévia, como o padrão.
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) return DEFAULT_SETTINGS.sharing;
  try {
    return (await getPlatformSettings(getDb())).sharing;
  } catch (err) {
    console.error("[compartilhamento] sem as configurações:", err instanceof Error ? err.message : "erro");
    cacheLife("seconds");
    return DEFAULT_SETTINGS.sharing;
  }
}

/** Open Graph / Twitter da prévia dos links. Vazio quando nada foi configurado (o HTML não muda). */
export function sharingMetadata(s: Sharing, appUrl: string): Metadata {
  if (!s.title && !s.description && !s.imageUrl) return {};
  const images = s.imageUrl ? [{ url: s.imageUrl, width: 1200, height: 630 }] : undefined;
  return {
    metadataBase: new URL(appUrl),
    ...(s.description ? { description: s.description } : {}),
    openGraph: {
      type: "website",
      url: "/",
      ...(s.title ? { title: s.title } : {}),
      ...(s.description ? { description: s.description } : {}),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      ...(s.title ? { title: s.title } : {}),
      ...(s.description ? { description: s.description } : {}),
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

export async function getSharingMetadata(): Promise<Metadata> {
  return sharingMetadata(await loadSharing(), getAppUrl());
}
