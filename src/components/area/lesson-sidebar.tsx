import Link from "next/link";
import type { ModuleWithLessons } from "@/lib/catalog/queries";
import { sizedImageUrl } from "@/lib/media-url";
import { safeImageUrl } from "@/lib/theme";
import { formatReleaseDate } from "@/lib/catalog/release";
import { CheckMark, LockIcon } from "./icons";

/** Check verde de aula vista; não vista, só reserva o espaço (o alinhamento dos títulos não muda). */
export function SeenCheck({ done }: { done: boolean }) {
  return done ? (
    <span className="ml-[3px] shrink-0 text-seen">
      <CheckMark className="size-3.5" />
      <span className="sr-only">Vista: </span>
    </span>
  ) : (
    <span aria-hidden className="ml-[3px] size-3.5 shrink-0" />
  );
}

/** Marcador da aula na lista: cadeado se programada, senão o check de vista. */
export function LessonMark({ done, lockedUntil }: { done: boolean; lockedUntil: Date | null }) {
  return lockedUntil ? (
    <span className="ml-[3px] shrink-0 text-muted">
      <LockIcon className="size-3.5" />
      <span className="sr-only">Bloqueada: </span>
    </span>
  ) : (
    <SeenCheck done={done} />
  );
}

/** "Disponível em DD/MM/AAAA" abaixo do título da aula programada. */
export function ReleaseNote({ lockedUntil }: { lockedUntil: Date | null }) {
  return lockedUntil ? <span className="block text-fine text-muted">{`Disponível em ${formatReleaseDate(lockedUntil)}`}</span> : null;
}

/** Círculo de 18px com contorno de 2px na cor de destaque (marcador de módulo). */
export function ModuleDot({ children, filled = false }: { children?: React.ReactNode; filled?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-[18px] shrink-0 place-items-center rounded-full border-2 border-accent text-[9px] leading-none ${
        filled ? "bg-accent text-accent-ink" : "bg-bg text-text"
      }`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-fine text-muted">
        <span>
          {completed} de {total} {total === 1 ? "aula vista" : "aulas vistas"}
        </span>
        <span className="text-text-2">{percent}%</span>
      </div>
      <div
        className="mt-1.5 h-[2px] overflow-hidden rounded-[1px] bg-line-2"
        role="progressbar"
        aria-label="Progresso no curso"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Anel de progresso do módulo (SVG 36×36 em 25px, traço de 4, trilho na cor da borda). */
function ModuleRing({ percent }: { percent: number }) {
  const arc = "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831";
  return (
    <svg viewBox="0 0 36 36" aria-hidden className="vx-toc-ring">
      <path d={arc} className="vx-toc-ring-bg" strokeDasharray="100, 100" />
      <path d={arc} className="vx-toc-ring-fg" strokeDasharray={`${percent}, 100`} />
    </svg>
  );
}

/** Marcador da aula na linha do tempo: check verde (vista), cadeado (programada) ou bolinha vazia. */
function TocMark({ done, lockedUntil }: { done: boolean; lockedUntil: Date | null }) {
  if (lockedUntil)
    return (
      <span className="vx-toc-lock">
        <LockIcon className="size-3" />
        <span className="sr-only">Bloqueada: </span>
      </span>
    );
  if (done)
    return (
      <span className="vx-toc-check">
        <CheckMark className="size-[13px]" />
        <span className="sr-only">Vista: </span>
      </span>
    );
  return <span aria-hidden className="vx-toc-dot" />;
}

/**
 * Módulos e aulas do produto: painel com um cartão por módulo (anel de progresso,
 * título, "N aulas"); só um módulo aberto por vez (o da aula atual); aulas numa linha do tempo com
 * check verde quando vistas e a aula atual na cor de destaque.
 */
export function LessonSidebar({
  modules,
  currentLessonId,
  showNumbers,
  compact,
  group,
  nextModule,
}: {
  modules: ModuleWithLessons[];
  currentLessonId: number;
  showNumbers: boolean;
  compact: boolean;
  /** Nome do acordeão (<details name>): só um módulo aberto por vez dentro do mesmo painel. */
  group: string;
  /** "Próximo módulo": último cartão da caixa, igual a um módulo, que leva à primeira aula do próximo produto. */
  nextModule?: { href: string; name: string } | null;
}) {
  const visible = modules.filter((m) => m.lessons.length > 0);
  return (
    <div className="vx-toc">
      {visible.map((m) => {
        const done = m.lessons.filter((l) => l.completed).length;
        const hasCurrent = m.lessons.some((l) => l.id === currentLessonId);
        const total = m.lessons.length;
        return (
          <details key={m.id} name={group} open={hasCurrent || visible.length === 1} className="vx-toc-group">
            <summary className="vx-toc-head">
              <span className="vx-toc-bull">
                <ModuleRing percent={Math.round((done / total) * 100)} />
              </span>
              <span className="vx-toc-title">
                {m.title}
                <span className="vx-toc-count">
                  {total} {total === 1 ? "aula" : "aulas"}
                  <span className="sr-only">, {done} vistas</span>
                </span>
              </span>
            </summary>
            <ol className="vx-toc-items">
              {m.lessons.map((l, i) => {
                const current = l.id === currentLessonId;
                const thumb = compact ? null : sizedImageUrl(safeImageUrl(l.thumbnailUrl), 600);
                return (
                  <li key={l.id}>
                    <Link href={`/area/conteudo/aula/${l.id}`} aria-current={current ? "page" : undefined} className="vx-toc-item">
                      <span className="vx-toc-bull vx-toc-bull--line">
                        <TocMark done={l.completed} lockedUntil={l.lockedUntil} />
                      </span>
                      <span className="vx-toc-text">
                        {thumb && (
                          <span className="aspect-video w-16 shrink-0 overflow-hidden rounded-[4px] bg-blank">
                            <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
                          </span>
                        )}
                        <span className="min-w-0">
                          {showNumbers && `${i + 1}. `}
                          {l.title}
                          <ReleaseNote lockedUntil={l.lockedUntil} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </details>
        );
      })}
      {nextModule && (
        <Link href={nextModule.href} className="vx-toc-group vx-toc-head">
          <span className="vx-toc-bull">
            <ModuleRing percent={0} />
          </span>
          <span className="vx-toc-title">
            {nextModule.name}
            <span className="vx-toc-count">Próximo módulo</span>
          </span>
        </Link>
      )}
    </div>
  );
}
