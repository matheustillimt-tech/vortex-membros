import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/db";
import { LessonActions } from "@/components/area/lesson-actions";
import { LessonContent } from "@/components/area/lesson-content";
import { LessonPlayer } from "@/components/area/lesson-player";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight } from "@/components/area/icons";
import { LessonSidebar, ProgressBar } from "@/components/area/lesson-sidebar";
import { NoAccess } from "@/components/area/no-access";
import { ScheduledLesson } from "@/components/area/scheduled-lesson";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { DEFAULT_HOME } from "@/lib/auth/redirect";
import { recordLessonView } from "@/lib/catalog/lesson-views";
import { getLessonPage, type LessonSummary } from "@/lib/catalog/queries";
import { termsPagePath } from "@/lib/catalog/terms";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";
import { safeErrorSummary } from "@/lib/log";
import { getLessonReaction } from "@/lib/progress";
import { resolveProductSettings } from "@/lib/settings";
import { sizedImageUrl } from "@/lib/media-url";
import { safeImageUrl } from "@/lib/theme";
import { getSettings, getViewer } from "../../../data";

const pillClass =
  "inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-ui text-text-2 transition-colors hover:border-line-2 hover:text-hover";

function NavLink({ lesson, dir, thumbnail }: { lesson: LessonSummary; dir: "prev" | "next"; thumbnail: boolean }) {
  const label = dir === "prev" ? "Aula anterior" : "Próxima aula";
  const thumb = thumbnail ? sizedImageUrl(safeImageUrl(lesson.thumbnailUrl), 600) : null;
  if (!thumbnail) {
    return (
      <Link href={`/area/conteudo/aula/${lesson.id}`} aria-label={`${label}: ${lesson.title}`} className={pillClass}>
        {dir === "prev" && <ArrowLeft className="size-[13px]" />}
        {dir === "prev" ? "Anterior" : "Próximo"}
        {dir === "next" && <ArrowRight className="size-[13px]" />}
      </Link>
    );
  }
  return (
    <Link
      href={`/area/conteudo/aula/${lesson.id}`}
      className={`group flex min-w-0 flex-1 items-center gap-3 rounded-md border border-line p-2 transition-colors hover:border-line-2 sm:max-w-sm ${dir === "next" ? "flex-row-reverse text-right" : ""}`}
    >
      <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-[4px] bg-blank">
        {thumb && <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />}
      </span>
      <span className="min-w-0">
        <span className="block text-fine text-muted">{label}</span>
        <span className="line-clamp-2 text-ui text-text-2 group-hover:text-hover">{lesson.title}</span>
      </span>
    </Link>
  );
}

async function LessonView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = /^\d+$/.test(id) ? Number(id) : NaN;
  const user = await getViewer();
  const db = getDb();
  const page = Number.isSafeInteger(n) ? await getLessonPage(db, user, n) : ({ status: "not_found" } as const);
  if (page.status === "not_found") redirect(DEFAULT_HOME);
  // Sem acesso: nada da aula (título, vídeo, conteúdo) chega ao HTML.
  if (page.status === "locked") return <NoAccess offerUrl={page.offerUrl} />;
  // Termo pendente: nada da aula chega ao HTML antes do "Li e aceito".
  if (page.status === "terms") redirect(termsPagePath(page.productId, `/area/conteudo/aula/${n}`));
  // Programada: só a data de liberação.
  if (page.status === "scheduled") return <ScheduledLesson releaseAt={page.releaseAt} productId={page.productId} />;

  const { lesson, product, modules } = page;
  // Visualização para os relatórios, depois da resposta (não atrasa a aula).
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  after(() =>
    recordLessonView(db, { user, lessonId: lesson.id, sessionToken }).catch((e) => console.error("[aula] visualização não registrada:", safeErrorSummary(e))),
  );
  const settings = resolveProductSettings(product.settings).lesson;
  const [reaction, platform] = await Promise.all([getLessonReaction(db, user.id, lesson.id), getSettings()]);

  const flat = modules.flatMap((m) => m.lessons);
  const completedCount = flat.filter((l) => l.completed).length;
  const current = flat.find((l) => l.id === lesson.id);
  const prev = flat.find((l) => l.id === page.prevLessonId);
  const next = flat.find((l) => l.id === page.nextLessonId);
  const html = sanitizeLessonHtml(lesson.contentHtml ?? "").trim();
  const videoUrl = lesson.format === "live" ? lesson.liveUrl : lesson.videoUrl;
  const hasVideo = Boolean(videoUrl);
  const bar = settings.showModuleBar;
  const theater = settings.theaterMode && hasVideo;

  // Duas cópias (painel do celular e coluna do computador): cada uma com o seu acordeão.
  const sidebar = (group: string) => (
    <LessonSidebar
      modules={modules}
      currentLessonId={lesson.id}
      showNumbers={settings.showLessonNumbers}
      compact={settings.compactModuleBar}
      group={group}
      nextModule={page.nextModule && { href: `/area/conteudo/aula/${page.nextModule.lessonId}`, name: page.nextModule.name }}
    />
  );
  const progress = settings.showTotalProgress && flat.length > 0 && (
    <ProgressBar completed={completedCount} total={flat.length} />
  );

  // Celular: player + "Ver conteúdos" juntos; a trilha (Início › Produto) vem depois do vídeo quando
  // "vídeo primeiro" está ligado e antes dele quando não. No desktop a grade fixa as posições.
  const videoFirst = settings.mobileVideoFirst;

  return (
    // container responsivo (540/720/960/1140/1320px, 12px de margem), vídeo em 3/4 e lista em 1/4 no
    // computador (24px entre as colunas, 24px acima); no celular, vídeo e "Ver conteúdos" logo abaixo.
    <div
      className={`${LESSON_CONTAINER} flex flex-col pb-8 pt-6 lg:grid lg:grid-rows-[auto_auto_1fr] lg:gap-x-6 ${
        bar ? "lg:grid-cols-[minmax(0,1fr)_calc(25%-18px)]" : "lg:max-w-5xl lg:grid-cols-1"
      }`}
    >
      <div className={`order-1 lg:row-start-1 ${theater ? "lg:col-span-full" : "lg:col-start-1"}`}>
        {hasVideo && <LessonPlayer url={videoUrl} title={lesson.title} accentColor={platform.accentColor} className="rounded-md" />}
        <details className={`toc-panel group/toc ${hasVideo ? "mt-1" : ""} ${bar ? "lg:hidden" : ""}`}>
          <summary className="vx-toc-toggle">
            Ver conteúdos
            <ChevronDown className="size-3 transition-transform group-open/toc:rotate-180" />
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {progress}
            {sidebar("toc-celular")}
          </div>
        </details>
      </div>

      <nav
        aria-label="Trilha"
        className={`lg:order-none lg:col-start-1 lg:row-start-2 lg:mb-0 lg:mt-6 ${
          videoFirst ? "order-2 mt-6" : "order-0 mb-4"
        }`}
      >
        {/* 24px abaixo do vídeo, linha de 15px e seta com 10px de cada lado. */}
        <ol className="flex flex-wrap items-center gap-y-2 text-ui leading-[15px] text-muted">
          <li>
            <Link href={DEFAULT_HOME} className="hover:text-text-2">
              Início
            </Link>
          </li>
          <li aria-hidden className="mx-2.5 flex w-[15px] justify-center">
            <ChevronRight className="size-[10px]" strokeWidth={3} />
          </li>
          <li className="min-w-0">
            <Link href={`/area/conteudo/listagem/${product.id}`} className="line-clamp-1 hover:text-text-2">
              {product.name}
            </Link>
          </li>
        </ol>
      </nav>

      <article className={`order-3 min-w-0 lg:order-none lg:col-start-1 lg:row-start-3 ${videoFirst ? "" : "mt-[22px] lg:mt-0"}`}>
        {/* Celular (< 576px): centralizado e 24px mais baixo. */}
        <h1 className="my-6 pt-6 text-center text-lesson font-light text-text-2 min-[576px]:pt-0 min-[576px]:text-left">
          {lesson.title}
        </h1>

        {html && (
          <section aria-label="Conteúdo da aula">
            <LessonContent html={html} />
          </section>
        )}

        {/* 48px do título até a linha e 24px até os botões. */}
        <hr className="mb-6 mt-12 border-line" />

        {/* A partir de 768px, avaliação à esquerda e Anterior/Próximo à direita na mesma linha. */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <LessonActions
            key={lesson.id}
            lessonId={lesson.id}
            completed={current?.completed ?? false}
            reaction={reaction}
            showMarkSeenButton={settings.showMarkSeenButton}
            keepButtonAfterSeen={settings.keepButtonAfterSeen}
            autoMarkSeen={settings.autoMarkSeen}
          />

          {(prev || next || page.nextProduct) && (
            <nav aria-label="Outras aulas" className="flex flex-wrap items-center justify-center gap-2 pt-6 md:justify-end md:pt-0">
              {prev && <NavLink lesson={prev} dir="prev" thumbnail={settings.navigation === "thumbnail"} />}
              {next && <NavLink lesson={next} dir="next" thumbnail={settings.navigation === "thumbnail"} />}
              {!next && page.nextProduct && (
                <Link
                  href={`/area/conteudo/listagem/${page.nextProduct.id}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-ui text-accent-ink transition-opacity hover:opacity-90"
                >
                  {settings.nextProductButtonText || `Continuar em ${page.nextProduct.name}`}
                  <ArrowRight className="size-[13px]" />
                </Link>
              )}
            </nav>
          )}
        </div>
      </article>

      {bar && (
        <aside
          aria-label="Conteúdos do curso"
          className={`hidden lg:col-start-2 lg:block ${theater ? "lg:row-span-2 lg:row-start-2 lg:mt-[22px]" : "lg:row-span-3 lg:row-start-1"}`}
        >
          <div className="flex flex-col gap-3">
            {progress}
            {sidebar("toc-coluna")}
          </div>
        </aside>
      )}
    </div>
  );
}

/** Larguras do container responsivo usadas na aula (576/768/992/1200/1400px). */
const LESSON_CONTAINER =
  "mx-auto w-full px-3 min-[576px]:max-w-[540px] min-[768px]:max-w-[720px] min-[992px]:max-w-[960px] min-[1200px]:max-w-[1140px] min-[1400px]:max-w-[1320px]";

function LessonSkeleton() {
  return (
    <div className={`${LESSON_CONTAINER} pt-6`} aria-busy="true" aria-label="Carregando">
      <div className="aspect-video rounded-md bg-blank lg:w-[calc(75%-6px)]" />
      <div className="mt-1 h-10 rounded-md bg-blank lg:hidden" />
      <div className="mt-[22px] h-4 w-40 rounded-sm bg-blank" />
      <div className="mt-5 h-7 w-2/3 rounded-sm bg-blank" />
    </div>
  );
}

export default function LessonPage({ params }: PageProps<"/area/conteudo/aula/[id]">) {
  return (
    <Suspense fallback={<LessonSkeleton />}>
      <LessonView params={params} />
    </Suspense>
  );
}
