import { expect, test } from "vitest";
import { lessonThumbnailUrl, videoPosterUrl, toEmbedUrl, withPlayerColor } from "@/lib/content/video";

test.each([
  ["https://www.youtube.com/watch?v=abc123", "https://www.youtube.com/embed/abc123"],
  ["https://www.youtube.com/watch?v=abc123&t=30s&list=x", "https://www.youtube.com/embed/abc123"],
  ["https://m.youtube.com/watch?v=abc123", "https://www.youtube.com/embed/abc123"],
  ["https://youtu.be/abc123", "https://www.youtube.com/embed/abc123"],
  ["https://www.youtube.com/live/abc123", "https://www.youtube.com/embed/abc123"],
  ["https://www.youtube.com/shorts/abc123", "https://www.youtube.com/embed/abc123"],
  ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
  [
    "https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=8dddf3a2",
    "https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=8dddf3a2",
  ],
])("toEmbedUrl(%s)", (url, src) => expect(toEmbedUrl(url)).toEqual({ kind: "iframe", src }));

test.each([[null], [undefined], [""], ["não é link"], ["javascript:alert(1)"], ["ftp://x.com/a"]])(
  "toEmbedUrl(%s) = null",
  (u) => expect(toEmbedUrl(u)).toBeNull(),
);

test("capa do Panda: biblioteca + id do vídeo no CDN da Panda", () => {
  expect(videoPosterUrl("https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=00000000-0000-4000-8000-000000000008")).toBe(
    "https://cdn.pandavideo.com/vz-00000000-000/00000000-0000-4000-8000-000000000008/thumbnail.jpg",
  );
});

test.each([
  ["https://www.youtube.com/watch?v=abc123"],
  ["https://player-vz-00000000-000.tv.pandavideo.com.br/embed/"],
  ["https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=../x"],
  ["https://evil.com/embed/?v=00000000-0000-4000-8000-000000000008"],
  [null],
])("sem capa conhecida: videoPosterUrl(%s) = null", (u) => expect(videoPosterUrl(u)).toBeNull());

test("cor do player da Panda: &color=<hex>; outros players e cor já definida ficam intactos", () => {
  const panda = "https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=a75415ea";
  expect(withPlayerColor(panda, "#FF7500")).toBe(`${panda}&color=ff7500`);
  expect(withPlayerColor(`${panda}&color=00ff00`, "#ff7500")).toBe(`${panda}&color=00ff00`);
  expect(withPlayerColor("https://www.youtube.com/embed/abc", "#ff7500")).toBe("https://www.youtube.com/embed/abc");
  expect(withPlayerColor(panda, "vermelho")).toBe(panda);
  expect(withPlayerColor(panda, undefined)).toBe(panda);
});

test("miniatura da aula: a enviada; sem ela, a capa do vídeo da Panda; sem vídeo da Panda, nenhuma", () => {
  const panda = "https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=00000000-0000-4000-8000-000000000012";
  expect(lessonThumbnailUrl("/media/7", panda)).toBe("/media/7");
  expect(lessonThumbnailUrl(null, panda)).toBe("https://cdn.pandavideo.com/vz-00000000-000/00000000-0000-4000-8000-000000000012/thumbnail.jpg");
  expect(lessonThumbnailUrl("", panda)).toBe("https://cdn.pandavideo.com/vz-00000000-000/00000000-0000-4000-8000-000000000012/thumbnail.jpg");
  expect(lessonThumbnailUrl(null, "https://youtu.be/abc")).toBeNull();
  expect(lessonThumbnailUrl(null, null)).toBeNull();
});
