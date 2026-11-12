/** Larguras em que as imagens do painel também saem reduzidas (as capas são pedidas com 600 px). */
export const MEDIA_WIDTHS = [600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** "/media/7" → "/media/7/600". Endereço externo (ex.: outro site) fica como está. */
export function sizedImageUrl(url: string | null, width: MediaWidth): string | null {
  const m = url ? /^\/media\/(\d{1,15})$/.exec(url) : null;
  return m ? `/media/${m[1]}/${width}` : url;
}
