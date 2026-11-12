import { getDb } from "@/db";
import { getStudentsReport, reportCached } from "@/lib/dashboard/reports";
import { UsersIcon } from "@/components/dashboard/icons";
import { BUCKETS, EngagementDonut, EngagementLegend, MonthBars, ReportHeader, UserPlusSvg, nf } from "@/components/dashboard/reports";
import { getAdmin } from "../../data";

export const metadata = { title: "Relatório de alunos" };

/** Relatório Alunos: rosca das faixas de acesso e novos cadastros em 12 meses. */
export default async function StudentsReportPage() {
  const user = await getAdmin();
  const r = await reportCached(user, "students", () => getStudentsReport(getDb(), user));
  const pctOf = (n: number) => (r.total > 0 ? Math.round((n / r.total) * 100) : 0);
  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <ReportHeader back={{ href: "/dashboard/reports#engagement", label: "Voltar para Relatórios" }} title="Alunos" subtitle="Quem está ativo, quem desengajou e quem nunca acessou" />

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 items-center gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,260px)_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <UsersIcon className="h-5 w-5 text-brand-600" />
              </span>
              <span className="text-sm font-medium text-gray-500">Total de alunos</span>
            </div>
            <div className="mt-4 text-5xl font-bold leading-none tracking-tight tabular-nums text-gray-900">{nf.format(r.total)}</div>
            <p className="mt-3 text-sm text-gray-500">Distribuição por nível de engajamento</p>
          </div>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
            <EngagementDonut buckets={r.buckets} total={r.total} />
            <EngagementLegend buckets={r.buckets} total={r.total} />
          </div>
        </div>
        <p className="sr-only">
          Total de alunos: {nf.format(r.total)}.{" "}
          {r.buckets.map((b) => `${BUCKETS[b.key].label}: ${nf.format(b.count)} (${pctOf(b.count)}%).`).join(" ")}
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <UserPlusSvg className="h-5 w-5 text-brand-500" />
              <h2 className="font-medium text-gray-900">Novos cadastros</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">Cadastros realizados nos últimos 12 meses</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold tabular-nums text-gray-900">+{nf.format(r.signupsTotal)}</div>
            <span className="text-label text-gray-400">no período</span>
          </div>
        </div>
        <MonthBars months={r.signups} />
      </div>
    </div>
  );
}
