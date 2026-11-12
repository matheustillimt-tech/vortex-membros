import { preload } from "react-dom";
import { toEmbedUrl, videoPosterUrl, withPlayerColor } from "@/lib/content/video";
import { PlayerFrame } from "./player-frame";

const escapeAttr = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * Player 16:9 responsivo (fundo preto). Sem vídeo válido, não renderiza nada. Cantos vêm de className.
 *
 * O player da Panda leva segundos para pintar com o navegador frio (HTML, ~480 KB de JS, config, capa)
 * e, até lá, mostraria só preto. A capa do vídeo aparece na hora por baixo e o iframe fica invisível
 * até o `load` dele (`data-ready`, ver `.vx-player` no globals.css). O iframe vai como HTML cru com
 * `onload` inline (criado pelo PlayerFrame já no navegador, ver lá por quê); um atraso em CSS mostra o
 * iframe de qualquer jeito se o `load` nunca vier. Ao sair da aula, o PlayerFrame tira o iframe.
 */
export function LessonPlayer({
  url,
  title,
  accentColor,
  className = "",
}: {
  url: string | null;
  title: string;
  /** Cor dos controles do player (Panda), a de destaque da área do aluno. */
  accentColor?: string;
  className?: string;
}) {
  const embed = toEmbedUrl(url);
  if (!embed) return null;
  const poster = videoPosterUrl(url);
  if (poster) preload(poster, { as: "image", fetchPriority: "high" });
  const iframe =
    `<iframe src="${escapeAttr(withPlayerColor(embed.src, accentColor))}" title="${escapeAttr(title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen ` +
    `referrerpolicy="strict-origin-when-cross-origin" onload="this.dataset.ready=''"></iframe>`;
  return (
    <div className={`overflow-hidden bg-black ${className}`}>
      <div className="vx-player relative aspect-video w-full">
        {poster && <img src={poster} alt="" fetchPriority="high" className="vx-player-poster absolute inset-0 size-full object-cover" />}
        {poster && <span aria-hidden className="vx-player-spin" />}
        <PlayerFrame html={iframe} />
      </div>
    </div>
  );
}
