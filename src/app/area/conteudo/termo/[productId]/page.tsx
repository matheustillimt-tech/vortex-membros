import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { LessonContent } from "@/components/area/lesson-content";
import { primaryButtonClass } from "@/components/area/form-styles";
import { getPendingTerms, termsNextPath } from "@/lib/catalog/terms";
import { getViewer } from "../../../data";
import { acceptTermsAction } from "./actions";

export const metadata: Metadata = { title: "Termo de aceite" };

async function TermsContent({ params, searchParams }: PageProps<"/area/conteudo/termo/[productId]">) {
  const [{ productId: raw }, sp] = await Promise.all([params, searchParams]);
  const productId = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  const next = typeof sp.next === "string" ? sp.next : null;
  if (!Number.isSafeInteger(productId)) redirect("/area/vitrine/home");
  const user = await getViewer();
  const terms = await getPendingTerms(getDb(), user, productId);
  // Já aceito, termo desligado, admin ou sem acesso: segue (a própria tela de destino decide).
  if (!terms) redirect(termsNextPath(productId, next));

  return (
    <>
      <p className="text-ui text-muted">{terms.productName}</p>
      <h1 className="mb-5 mt-1 text-lesson font-light text-text-2">Termo de aceite</h1>
      <section aria-label="Termo de aceite" className="rounded-md border border-line p-5 md:p-6">
        <LessonContent html={terms.html} />
      </section>
      <form action={acceptTermsAction} className="mt-6 flex justify-end">
        <input type="hidden" name="productId" value={terms.productId} />
        <input type="hidden" name="next" value={termsNextPath(productId, next)} />
        <button type="submit" className={primaryButtonClass}>
          Li e aceito
        </button>
      </form>
    </>
  );
}

export default function TermsPage(props: PageProps<"/area/conteudo/termo/[productId]">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 md:px-6">
      <Suspense fallback={<div aria-busy="true" className="h-96 rounded-md border border-line" />}>
        <TermsContent {...props} />
      </Suspense>
    </div>
  );
}
