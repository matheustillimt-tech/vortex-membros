import type { ProductSettings } from "@/db/schema";
import type { ModuleWithLessons } from "@/lib/catalog/queries";
import { safeImageUrl } from "@/lib/theme";
import { CoverCard, type CoverAspect } from "./cover-card";

/** Formato da capa: o padrão (auto/4:7) é o 9:16 (280×497). */
export const COVER_ASPECT: Record<ProductSettings["thumbnailFormat"], CoverAspect> = {
  auto: "9:16",
  "4:7": "9:16",
  "4:5": "4:5",
  "1:1": "1:1",
  "16:9": "16:9",
  original: "original",
};

export function moduleHref(m: ModuleWithLessons) {
  // Direto para a primeira aula (a rota /modulo/<id> fica para links antigos).
  return m.lessons[0] ? `/area/conteudo/aula/${m.lessons[0].id}` : `/area/conteudo/modulo/${m.id}`;
}

export function moduleProgress(m: ModuleWithLessons) {
  const done = m.lessons.filter((l) => l.completed).length;
  return { done, total: m.lessons.length };
}

export function lessonsSeenLabel(done: number, total: number) {
  return `${done} de ${total} ${total === 1 ? "aula vista" : "aulas vistas"}`;
}

/** Capa do módulo na listagem: mesmo card das vitrines, com o título embaixo (padding 16px, 12.8px). */
export function ModuleCard({
  module: m,
  format,
  showTitle,
}: {
  module: ModuleWithLessons;
  format: ProductSettings["thumbnailFormat"];
  showTitle: boolean;
}) {
  const { done, total } = moduleProgress(m);
  return (
    <CoverCard
      name={m.title}
      imageUrl={safeImageUrl(m.coverUrl)}
      href={moduleHref(m)}
      done={done}
      total={total}
      showTitle={showTitle}
      aspect={COVER_ASPECT[format]}
    />
  );
}
