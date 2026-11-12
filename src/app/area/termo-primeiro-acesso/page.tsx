import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { FirstAccessTerms } from "@/components/area/first-access-terms";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { getPendingFirstAccessTerms } from "@/lib/catalog/first-access-terms";
import { sanitizeLessonHtml } from "@/lib/content/sanitize";
import { getViewer } from "../data";

export const metadata: Metadata = { title: "Termo de aceite" };

/** Termo de primeiro acesso: o proxy manda para cá o aluno que ainda não aceitou a versão atual. */
async function Content({ searchParams }: PageProps<"/area/termo-primeiro-acesso">) {
  const sp = await searchParams;
  const next = safeRedirectPath(typeof sp.next === "string" ? sp.next : null);
  const user = await getViewer();
  const pending = await getPendingFirstAccessTerms(getDb(), user);
  if (!pending) redirect(next);
  return <FirstAccessTerms html={sanitizeLessonHtml(pending.html)} hash={pending.hash} next={next} />;
}

export default function FirstAccessTermsPage(props: PageProps<"/area/termo-primeiro-acesso">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 md:px-6">
      <Suspense fallback={<div aria-busy="true" className="h-96 rounded-md border border-line" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}
