import type { CatalogProduct } from "@/lib/catalog/queries";
import { safeHttpUrl, safeImageUrl } from "@/lib/theme";
import { CoverCard } from "./cover-card";

/**
 * Capa do produto nas vitrines (sem título, como na home).
 * Bloqueado: leva à oferta em nova aba; sem oferta, fica inerte.
 */
export function ProductCard({ product, showTitle = false }: { product: CatalogProduct; showTitle?: boolean }) {
  const offerUrl = product.locked ? safeHttpUrl(product.offerUrl) : null;
  return (
    <CoverCard
      name={product.name}
      imageUrl={safeImageUrl(product.thumbnailUrl)}
      href={product.locked ? offerUrl : `/area/conteudo/listagem/${product.id}`}
      external={product.locked}
      locked={product.locked}
      done={product.lessonsDone}
      total={product.lessonsTotal}
      showTitle={showTitle}
    />
  );
}
