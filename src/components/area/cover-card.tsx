import Link from "next/link";
import { progressPercent, progressTitle } from "@/lib/cover-progress";
import { sizedImageUrl } from "@/lib/media-url";
import { LockIcon, LockOpenIcon } from "./icons";

export type CoverAspect = "9:16" | "4:5" | "1:1" | "16:9" | "original";

const ASPECT_STYLE: Record<Exclude<CoverAspect, "9:16" | "original">, string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "16:9": "16 / 9",
};

type Props = {
  name: string;
  imageUrl: string | null;
  /** Destino: rota interna (Link sem prefetch) ou oferta externa (nova aba). Sem destino, card inerte. */
  href: string | null;
  external?: boolean;
  locked?: boolean;
  /** Aulas vistas / total; ignorado quando bloqueado (sem trilho). */
  done: number;
  total: number;
  showTitle: boolean;
  aspect?: CoverAspect;
};

/**
 * Capa no formato: 9:16, raio 6px, sem borda; <progress> de 2px logo abaixo
 * (título "N de M - X%"); sobe 10px no hover. Bloqueada: cinza + véu + cadeado central
 * (vira cadeado aberto no hover), sem trilho. O nome aparece embaixo só quando showTitle.
 */
export function CoverCard({ name, imageUrl, href, external = false, locked = false, done, total, showTitle, aspect = "9:16" }: Props) {
  const coverClass = `vx-cover${locked ? " vx-cover--locked" : ""}${aspect === "original" ? " vx-cover--original" : ""}`;
  const coverStyle = aspect === "9:16" || aspect === "original" ? undefined : { aspectRatio: ASPECT_STYLE[aspect] };
  // Com título visível o texto já nomeia o link; sem ele, o alt da imagem nomeia.
  const alt = showTitle ? "" : name;

  const body = (
    <>
      <div className="vx-cover-wrap">
        <div className={coverClass} style={coverStyle}>
          {imageUrl && <img src={sizedImageUrl(imageUrl, 600)!} alt={alt} loading="lazy" />}
          {!imageUrl && !showTitle && <span className="sr-only">{name}</span>}
          {locked && (
            <>
              <span aria-hidden className="vx-veil" />
              <span aria-hidden className="vx-lock">
                <LockIcon className="vx-lock-closed" />
                <LockOpenIcon className="vx-lock-open" />
                <span className="vx-lock-tip">Sem acesso</span>
              </span>
            </>
          )}
        </div>
        {!locked && (
          <progress
            className="vx-progress"
            value={progressPercent(done, total)}
            max={100}
            title={progressTitle(done, total)}
            aria-label={`Progresso de ${name}: ${progressTitle(done, total)}`}
          />
        )}
      </div>
      {showTitle && <div className="vx-title">{name}</div>}
    </>
  );

  if (href && external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="vx-card"
        aria-label={locked ? `${name}: bloqueado, ver oferta` : undefined}
      >
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} prefetch={false} className="vx-card">
        {body}
      </Link>
    );
  }
  return (
    <div className="vx-card cursor-not-allowed" role="group" aria-label={locked ? `${name}: bloqueado` : name} aria-disabled="true">
      {body}
    </div>
  );
}
