import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { BackLink } from "@/components/area/back-link";
import { NoAccess } from "@/components/area/no-access";
import { ProductListing } from "@/components/area/product-listing";
import { ProgressBar } from "@/components/area/lesson-sidebar";
import { ShowcaseSkeleton } from "@/components/area/showcase-skeleton";
import { DEFAULT_HOME } from "@/lib/auth/redirect";
import { getProductPage } from "@/lib/catalog/queries";
import { termsPagePath } from "@/lib/catalog/terms";
import { resolveProductSettings } from "@/lib/settings";
import { safeImageUrl } from "@/lib/theme";
import { getViewer } from "../../../data";

function parseId(id: string) {
  const n = /^\d+$/.test(id) ? Number(id) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

async function ProductContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = parseId(id);
  const user = await getViewer();
  const page = productId === null ? null : await getProductPage(getDb(), user, productId);
  // Produto inexistente ou oculto cai na home, como qualquer endereço antigo desconhecido.
  if (!page) redirect(DEFAULT_HOME);
  if (page.locked) return <NoAccess offerUrl={page.offerUrl} productName={page.product.name} />;
  if (page.needsTerms)
    redirect(termsPagePath(page.product.id, `/area/conteudo/listagem/${page.product.id}`));

  // produto sem módulos volta para o início, e "Nenhum" (sem listagem) abre a primeira aula.
  if (page.modules.length === 0) redirect(DEFAULT_HOME);
  const settings = resolveProductSettings(page.product.settings);
  if (settings.listing === "none") {
    const first = page.modules.flatMap((m) => m.lessons)[0];
    redirect(first ? `/area/conteudo/aula/${first.id}` : DEFAULT_HOME);
  }
  const banner = settings.showBanner ? safeImageUrl(settings.bannerUrl) : null;
  const lessons = page.modules.flatMap((m) => m.lessons);
  const completed = lessons.filter((l) => l.completed).length;

  // logo abaixo do cabeçalho, "‹ Módulos" (16px/300) e as capas dos módulos com título.
  // O "‹" volta sempre para o início: a vitrine não tem página própria, só a fileira da home.
  const heading = (
    <h2 className="vx-row-title">
      <BackLink href={DEFAULT_HOME} ariaLabel="Voltar para o início" />
      Módulos
    </h2>
  );

  return (
    <div>
      <h1 className="sr-only">{page.product.name}</h1>
      {banner && (
        <div className="mb-6 h-[28svh] min-h-40 w-full overflow-hidden md:h-[42svh]">
          <img src={banner} alt="" className="size-full object-cover" />
        </div>
      )}
      {settings.lesson.showTotalProgress && lessons.length > 0 && (
        <div className="mb-4 max-w-xs px-6">
          <ProgressBar completed={completed} total={lessons.length} />
        </div>
      )}
      <ProductListing modules={page.modules} settings={settings} heading={heading} productName={page.product.name} />
    </div>
  );
}

export default function ProductPage({ params }: PageProps<"/area/conteudo/listagem/[id]">) {
  return (
    <Suspense fallback={<ShowcaseSkeleton rows={1} />}>
      <ProductContent params={params} />
    </Suspense>
  );
}
