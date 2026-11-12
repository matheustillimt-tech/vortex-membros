import { getDb } from "@/db";
import { getHomeMetrics, greeting, homeDate } from "@/lib/dashboard/metrics";
import { reportCached } from "@/lib/dashboard/reports";
import { AccessBuckets } from "@/components/dashboard/access-buckets";
import { AttentionList } from "@/components/dashboard/attention-list";
import { MonthlyBarChart } from "@/components/dashboard/bar-chart";
import { HomeCards } from "@/components/dashboard/home-cards";
import { PackageIcon, ReceiptIcon } from "@/components/dashboard/icons";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { ClockIcon, UserXIcon } from "@/components/dashboard/reports";
import { getAdmin } from "./data";

export const metadata = { title: "Início" };

const nf = new Intl.NumberFormat("pt-BR");

/** Início do painel, sem o que não existe aqui (banner, certificados, atendimento, ranking, novidades). */
export default async function DashboardHome() {
  const user = await getAdmin();
  const now = new Date();
  const m = await reportCached(user, "home", () => getHomeMetrics(getDb(), user, now));
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const v4 = m.last4Variation;

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">
              {greeting(now)}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{homeDate(now)}</p>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            <span className="tooltip" title="Os números consolidados são recalculados todo dia à meia-noite. Acessos de hoje e as filas de atenção atualizam ao longo do dia.">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full text-hint text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ClockIcon className="h-3.5 w-3.5" /> Atualizado diariamente
              </button>
            </span>
          </div>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="border-b border-gray-100 lg:col-span-4 lg:border-b-0 lg:border-r">
            <HomeCards
              cards={[
                {
                  label: "Alunos",
                  tip: "Total de alunos cadastrados na plataforma, atualizado uma vez por dia.",
                  href: "/dashboard/reports/students",
                  value: m.totalStudents,
                  sub: `${nf.format(m.active7d)} ativos nos últimos 7 dias`,
                },
                {
                  label: "Novos no mês",
                  tip: "Cadastros feitos no mês corrente. A variação compara com o mês anterior inteiro.",
                  href: "/dashboard/reports/students",
                  value: m.newThisMonth,
                  badge: m.newVariation,
                  spark: m.weeklySignups,
                },
                {
                  label: "Acessos hoje",
                  tip: "Alunos que entraram hoje. Atualiza a cada 30 minutos.",
                  href: "/dashboard/reports/students",
                  value: m.accessesToday,
                },
              ]}
            />
          </div>
          <div className="p-5 lg:col-span-8">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-medium text-gray-900">Cadastros e matrículas nos últimos 12 meses</h2>
                <p className="mt-0.5 text-hint text-gray-400">
                  {nf.format(m.last4Weeks)} novos cadastros nas últimas 4 semanas
                  {v4 !== null ? (
                    <>
                      ,{" "}
                      <span className={`font-medium tabular-nums ${v4 < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {v4 > 0 ? "+" : ""}
                        {v4}%
                      </span>{" "}
                      que no período anterior
                    </>
                  ) : null}
                </p>
              </div>
              <ul className="flex items-center gap-4 text-hint text-gray-500" aria-hidden="true">
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-brand-500" />
                  Novos cadastros
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-gray-300" />
                  Matrículas por venda
                </li>
              </ul>
            </div>
            <MonthlyBarChart
              label="Cadastros e matrículas nos últimos 12 meses"
              labels={m.chart.labels}
              series={[
                { name: "Novos cadastros", values: m.chart.signups },
                { name: "Matrículas por venda", values: m.chart.enrollments },
              ]}
            />
            <div className="sr-only">
              <table>
                <caption>Cadastros e matrículas nos últimos 12 meses</caption>
                <thead>
                  <tr>
                    <th />
                    {m.chart.labels.map((l, i) => (
                      <th key={`${l}-${i}`}>{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Novos cadastros</th>
                    {m.chart.signups.map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Matrículas por venda</th>
                    {m.chart.enrollments.map((v, i) => (
                      <td key={i}>{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="h-full">
            <AttentionList
              items={[
                { label: "Vendas com erro", category: "Vendas", count: m.attention.saleErrors, href: "/dashboard/sales?view=error", tone: "red", icon: <ReceiptIcon className="h-4 w-4" /> },
                { label: "Produtos sem oferta", category: "Conteúdo", count: m.attention.productsWithoutOffer, href: "/dashboard/content/products", tone: "red", icon: <PackageIcon className="h-4 w-4" /> },
                { label: "Nunca acessaram", category: "Alunos", count: m.attention.neverAccessed, href: "/dashboard/students?access=never-accessed", tone: "amber", icon: <UserXIcon className="h-4 w-4" /> },
              ]}
            />
          </div>
        </div>
        <AccessBuckets
          buckets={[
            { label: "Hoje", count: m.access30.today },
            { label: "Ontem", count: m.access30.yesterday },
            { label: "2 a 7 dias", count: m.access30.d2to7 },
            { label: "8 a 14 dias", count: m.access30.d8to14 },
            { label: "15 a 30 dias", count: m.access30.d15to30 },
          ]}
        />
      </div>

      <div className="mb-6">
        <RecentActivity items={m.recent} now={now} />
      </div>
    </div>
  );
}
