import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getProductLessonsReport, reportCached } from "@/lib/dashboard/reports";
import { EyeIcon, ImageIcon, UsersIcon } from "@/components/dashboard/icons";
import { KpiCard, LikeBar, ReportHeader, ThumbsDownIcon, ThumbsUpIcon, TrendingUpIcon, nf, nf1 } from "@/components/dashboard/reports";
import { NomeNoCaminho } from "@/components/dashboard/painel-raiz";
import { getAdmin } from "../../../data";

export const metadata = { title: "Relatório das aulas" };

/** Aulas do produto: KPIs e visualizações/avaliações por aula, por módulo. */
export default async function ProductLessonsReportPage({ params }: PageProps<"/dashboard/reports/products/[id]">) {
  const [user, { id: raw }] = await Promise.all([getAdmin(), params]);
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id)) notFound();
  const r = await reportCached(user, `product:${id}`, () => getProductLessonsReport(getDb(), user, id));
  if (!r) notFound();
  const reactions = r.likes + r.dislikes;
  const likePct = reactions > 0 ? (r.likes / reactions) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <NomeNoCaminho href={`/dashboard/reports/products/${id}`} nome={r.product.name} />
      <ReportHeader back={{ href: "/dashboard/reports/products", label: "Produtos" }} title={r.product.name} subtitle="Visualizações e avaliações por aula" />
      <div>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={UsersIcon} tone="brand" value={nf.format(r.withProgress)} label="Alunos com progresso">
            <p className="mt-3 text-label text-gray-400">{nf.format(r.withAccess)} alunos com acesso</p>
          </KpiCard>
          <KpiCard icon={EyeIcon} tone="sky" value={nf.format(r.views)} label="Acessos">
            <p className="mt-3 text-label text-gray-400">em aulas deste produto</p>
          </KpiCard>
          <KpiCard icon={TrendingUpIcon} tone="violet" value={`${nf1.format(r.avgProgress)}%`} label="Progresso médio">
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round(r.avgProgress)}%` }} />
            </div>
            <p className="mt-2 text-label text-gray-400">{nf.format(r.completed)} aulas completadas</p>
          </KpiCard>
          <KpiCard icon={ThumbsUpIcon} tone="emerald" value={`${nf1.format(likePct)}%`} label="Likes / dislikes">
            <LikeBar likes={r.likes} dislikes={r.dislikes} className="mt-3 h-1.5" />
            <div className="mt-2 flex items-center justify-between text-label tabular-nums">
              <span className="text-gray-400">{nf.format(r.likes)} likes</span>
              <span className="text-gray-400">{nf.format(r.dislikes)} dislikes</span>
            </div>
          </KpiCard>
        </div>

        {r.modules.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">Nenhuma aula publicada neste produto</div>
        ) : null}
        {r.modules.map((m) => (
          <div key={m.id} className="mb-4 rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="truncate text-sm font-semibold text-gray-900">{m.title}</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {m.lessons.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 flex-shrink-0 text-center text-xs tabular-nums text-gray-400">{i + 1}</span>
                  <div className="relative hidden h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-gray-200/60 sm:block">
                    <div className="absolute inset-0">
                      {l.thumbnailUrl ? (
                        <img src={l.thumbnailUrl} alt="" loading="lazy" decoding="async" width={88} height={88} className="relative h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-gray-300" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/content/product/${r.product.id}/lesson/${l.id}`} className="block truncate text-sm text-gray-900 transition-colors hover:text-brand-500">
                      {l.title}
                    </Link>
                  </div>
                  <div className="w-24 flex-shrink-0 text-center sm:w-28">
                    <p className="text-sm font-medium tabular-nums text-gray-900">{nf.format(l.views)}</p>
                    <p className="text-label text-gray-400">visualizações</p>
                  </div>
                  <div className="ml-12 hidden w-40 flex-shrink-0 sm:block">
                    <div className="flex items-center justify-between text-label tabular-nums">
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        <ThumbsUpIcon className="h-3 w-3 text-emerald-500" /> {nf.format(l.likes)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        {nf.format(l.dislikes)} <ThumbsDownIcon className="h-3 w-3 text-red-400" />
                      </span>
                    </div>
                    <LikeBar likes={l.likes} dislikes={l.dislikes} className="mt-1.5 h-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
