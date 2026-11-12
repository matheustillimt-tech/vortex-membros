import { Suspense } from "react";
import { getDb } from "@/db";
import { BannerHero } from "@/components/area/banner-hero";
import { ShowcaseCarousel } from "@/components/area/showcase-carousel";
import { ShowcaseSkeleton } from "@/components/area/showcase-skeleton";
import { getHomeBanner } from "@/lib/banners";
import { getHomeCatalog } from "@/lib/catalog/queries";
import { getSettings, getViewer } from "../../data";

async function HomeContent() {
  const user = await getViewer();
  const db = getDb();
  const [banner, catalog, settings] = await Promise.all([getHomeBanner(db), getHomeCatalog(db, user), getSettings()]);
  const showcases = catalog.filter((s) => s.products.length > 0);

  return (
    <>
      {banner && <BannerHero banner={banner} />}
      <div className={banner ? "" : "pt-6"}>
        {showcases.map((s) => (
          <ShowcaseCarousel key={s.id} title={s.name} products={s.products} autoScroll={settings.showcaseAutoScroll} />
        ))}
        {showcases.length === 0 && (
          <p className="px-6 py-16 text-center text-ui text-muted">
            Ainda não há conteúdos por aqui. Quando um curso for liberado para você, ele aparece nesta página.
          </p>
        )}
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<ShowcaseSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
