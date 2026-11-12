import type { ReactNode } from "react";
import Link from "next/link";
import type { ProductSettings } from "@/db/schema";
import type { ModuleWithLessons } from "@/lib/catalog/queries";
import { sizedImageUrl } from "@/lib/media-url";
import { safeImageUrl } from "@/lib/theme";
import { DEFAULT_HOME } from "@/lib/auth/redirect";
import { BackLink } from "./back-link";
import { ModuleCard, lessonsSeenLabel, moduleHref, moduleProgress } from "./module-card";
import { ScrollRow } from "./scroll-row";
import { LessonMark, ModuleDot, ReleaseNote } from "./lesson-sidebar";

type Props = {
  modules: ModuleWithLessons[];
  settings: ProductSettings;
  /** Linha de título ("‹ Módulos"), com as setas à direita quando os módulos estão em carrossel. */
  heading: ReactNode;
  productName: string;
};

const VERTICAL = new Set<ProductSettings["thumbnailFormat"]>(["auto", "4:7", "4:5", "original"]);

function LessonLinks({ lessons }: { lessons: ModuleWithLessons["lessons"] }) {
  return (
    <ul className="flex flex-col">
      {lessons.map((l) => (
        <li key={l.id}>
          <Link
            href={`/area/conteudo/aula/${l.id}`}
            className="flex min-h-8 items-center gap-3.5 py-1 text-ui text-text-2 hover:text-hover"
          >
            <LessonMark done={l.completed} lockedUntil={l.lockedUntil} />
            <span className="line-clamp-2">
              {l.title}
              <ReleaseNote lockedUntil={l.lockedUntil} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Módulos do produto no formato escolhido nas configurações (streaming, grade, lista ou trilha). */
export function ProductListing({ modules, settings, heading, productName }: Props) {
  // Módulo ainda sem aulas também aparece (mostra a capa; o clique volta para o produto).
  const visible = modules;
  const head = <div className="vx-row-head">{heading}</div>;
  if (visible.length === 0) {
    return (
      <section aria-label="Módulos" className="vx-showcase">
        {head}
        <p className="px-6 pt-2.5 text-ui text-muted">Este conteúdo ainda não tem aulas publicadas.</p>
      </section>
    );
  }
  const format = settings.thumbnailFormat;
  const card = (m: ModuleWithLessons) => <ModuleCard module={m} format={format} showTitle={settings.showModuleTitles} />;
  const item = (m: ModuleWithLessons) => (
    <li key={m.id} data-cover-name={m.title}>
      {card(m)}
    </li>
  );

  // Até 2 módulos: grade de 4 colunas (2 no celular) com o nome do produto sublinhado.
  if (settings.listing === "streaming" && visible.length <= 2) {
    return (
      <section aria-label="Módulos" className="vx-list" data-cover-section>
        <div className="vx-list-container">
          <h2 className="vx-list-title">
            <BackLink href={DEFAULT_HOME} ariaLabel="Voltar para o início" />
            <span>{productName}</span>
          </h2>
          <ul className="vx-list-cols">{visible.map(item)}</ul>
        </div>
      </section>
    );
  }

  if (settings.listing === "streaming" && settings.modulesAsCarousel) {
    return (
      <section aria-label="Módulos" className="vx-showcase" data-cover-section>
        <ScrollRow heading={heading} label="Módulos" wide={format === "16:9"}>
          {visible.map(item)}
        </ScrollRow>
      </section>
    );
  }

  if (settings.listing === "streaming" || settings.listing === "grid") {
    return (
      <section aria-label="Módulos" className="vx-showcase" data-cover-section>
        {head}
        <ul className={`vx-grid${format === "16:9" ? " vx-track--wide" : ""}`}>{visible.map(item)}</ul>
      </section>
    );
  }

  if (settings.listing === "list") {
    return (
      <section aria-label="Módulos" className="vx-showcase">
        {head}
        <ul className="flex max-w-4xl flex-col gap-3 px-6 pt-2.5">
          {visible.map((m) => {
            const cover = sizedImageUrl(safeImageUrl(m.coverUrl), 600);
            const { done, total } = moduleProgress(m);
            return (
              <li key={m.id} className="flex flex-col gap-4 rounded-md border border-line p-3.5 sm:flex-row">
                <Link
                  href={moduleHref(m)}
                  className={`block shrink-0 overflow-hidden rounded-md border border-line bg-blank ${VERTICAL.has(format) ? "aspect-[4/5] w-28" : "aspect-video w-full sm:w-56"}`}
                  tabIndex={-1}
                  aria-hidden
                >
                  {cover && <img src={cover} alt="" loading="lazy" className="size-full object-cover" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3.5">
                    <ModuleDot />
                    <span className="flex flex-col">
                      <Link href={moduleHref(m)} className="text-ui uppercase text-text hover:text-hover">
                        {m.title}
                      </Link>
                      <span className="text-fine text-muted">{lessonsSeenLabel(done, total)}</span>
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <LessonLinks lessons={m.lessons} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  // Trilha: os módulos são uma sequência, então a numeração aqui é informação.
  return (
    <section aria-label="Trilha" className="vx-showcase">
      {head}
      <ol className="relative ml-[33px] mt-2.5 max-w-3xl border-l border-line pl-6">
        {visible.map((m, i) => {
          const { done, total } = moduleProgress(m);
          const finished = done === total;
          return (
            <li key={m.id} className="relative pb-8 last:pb-0">
              <span className="absolute -left-[calc(1.5rem+9.5px)] top-[3px]">
                <ModuleDot filled={finished}>{i + 1}</ModuleDot>
              </span>
              <Link href={moduleHref(m)} className="text-ui uppercase leading-6 text-text hover:text-hover">
                {m.title}
              </Link>
              <p className="text-fine text-muted">{lessonsSeenLabel(done, total)}</p>
              <div className="mt-2">
                <LessonLinks lessons={m.lessons} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
