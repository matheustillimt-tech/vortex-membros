import type { CatalogProduct } from "@/lib/catalog/queries";
import { ProductCard } from "./product-card";
import { ScrollRow } from "./scroll-row";

/** Vitrine na home: título 16px/300, setas e trilho de capas sem título (a vitrine não tem página própria). */
export function ShowcaseCarousel({
  title,
  products,
  autoScroll = false,
}: {
  title: string;
  products: CatalogProduct[];
  autoScroll?: boolean;
}) {
  if (products.length === 0) return null;
  const heading = <h2 className="vx-row-title">{title}</h2>;
  return (
    <section className="vx-showcase" aria-label={title} data-cover-section>
      <ScrollRow heading={heading} label={title} autoScroll={autoScroll}>
        {products.map((p) => (
          <li key={p.id} data-cover-name={p.name}>
            <ProductCard product={p} />
          </li>
        ))}
      </ScrollRow>
    </section>
  );
}
