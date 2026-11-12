const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

function youtubeEmbed(id: string | null | undefined) {
  if (!id || !/^[\w-]+$/.test(id)) return null;
  return { kind: "iframe" as const, src: `https://www.youtube.com/embed/${id}` };
}

export function toEmbedUrl(url: string | null | undefined): { kind: "iframe"; src: string } | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();

  if (host === "youtu.be") {
    return youtubeEmbed(u.pathname.split("/")[1]) ?? { kind: "iframe", src: u.toString() };
  }
  if (YOUTUBE_HOSTS.has(host)) {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") return youtubeEmbed(u.searchParams.get("v")) ?? { kind: "iframe", src: u.toString() };
    if (["live", "shorts", "embed"].includes(parts[0])) {
      return youtubeEmbed(parts[1]) ?? { kind: "iframe", src: u.toString() };
    }
    return { kind: "iframe", src: u.toString() };
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d+$/.test(p));
    if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
  }
  return { kind: "iframe", src: u.toString() };
}

const PANDA_PLAYER_HOST = /^player-(vz-[a-z0-9-]+)\.tv\.pandavideo\.com\.br$/;

/**
 * Capa do vídeo para mostrar na hora, enquanto o player carrega (a Panda leva segundos com o
 * navegador frio). Só Panda: `player-<biblioteca>.tv.pandavideo.com.br/embed/?v=<id>` →
 * `cdn.pandavideo.com/<biblioteca>/<id>/thumbnail.jpg`, o mesmo pôster que o player usa.
 */
export function videoPosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const lib = PANDA_PLAYER_HOST.exec(u.hostname.toLowerCase())?.[1];
  const id = u.searchParams.get("v");
  if (!lib || !id || !/^[a-zA-Z0-9-]+$/.test(id)) return null;
  return `https://cdn.pandavideo.com/${lib}/${id}/thumbnail.jpg`;
}

/**
 * Miniatura da aula mostra: a enviada ou, sem ela, a capa do vídeo da Panda
 * (calculada na hora, nada é gravado).
 */
export function lessonThumbnailUrl(thumbnailUrl: string | null | undefined, videoUrl: string | null | undefined): string | null {
  return thumbnailUrl || videoPosterUrl(videoUrl);
}

/**
 * Cor dos controles do player da Panda faz: `&color=<hex sem #>` com a cor de destaque.
 * Só Panda e só se o link ainda não trouxer uma cor; cor inválida não muda nada.
 */
export function withPlayerColor(src: string, accentColor: string | null | undefined): string {
  const hex = accentColor?.trim().replace(/^#/, "");
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return src;
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return src;
  }
  if (!PANDA_PLAYER_HOST.test(u.hostname.toLowerCase()) || u.searchParams.has("color")) return src;
  u.searchParams.set("color", hex.toLowerCase());
  return u.toString();
}
