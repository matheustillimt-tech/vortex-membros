import Link from "next/link";
import { BarChartIcon, PackageIcon, UsersIcon } from "@/components/dashboard/icons";
import { ActivityIcon, GraduationCapIcon } from "@/components/dashboard/reports";
import { getAdmin } from "../data";

export const metadata = { title: "Relatórios" };

const GROUPS = [
  {
    id: "engagement",
    title: "Engajamento",
    Icon: ActivityIcon,
    cards: [{ href: "/dashboard/reports/students", title: "Alunos", text: "Quem está ativo, quem desengajou e quem nunca acessou", Icon: UsersIcon }],
  },
  {
    id: "learning",
    title: "Aprendizado",
    Icon: GraduationCapIcon,
    cards: [{ href: "/dashboard/reports/products", title: "Produtos", text: "Quanto os alunos avançam em cada produto", Icon: PackageIcon }],
  },
] as const;

/** Hub de relatórios só com Alunos e Produtos. */
export default async function ReportsPage() {
  await getAdmin();
  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="" />
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">Relatórios</h1>
            <p className="mt-1 text-sm text-gray-500">Escolha o relatório que você quer consultar.</p>
          </div>
        </div>
      </div>
      <nav data-subnav="" aria-label="Submenu da seção" className="relative z-30 my-6 border-b border-gray-200 max-sm:mb-4 max-sm:border-b-0">
        <div className="flex min-h-11 flex-wrap items-end justify-start gap-x-1">
          <div className="min-w-0 flex-1">
            <div className="relative">
              <div className="subnav-pista flex flex-wrap items-end gap-x-1 max-sm:flex-nowrap max-sm:gap-x-1.5 max-sm:overflow-x-auto max-sm:overscroll-x-contain">
                <Link
                  href="/dashboard/reports"
                  data-nav="sub"
                  data-current=""
                  aria-current="page"
                  className="nav-aba -mb-px flex h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-2.5 text-hint text-gray-600 transition-colors hover:text-gray-900"
                >
                  <BarChartIcon className="nav-icone h-4 w-4 flex-shrink-0" />
                  Relatórios
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <div>
        {GROUPS.map((g, i) => (
          <section key={g.id} id={g.id} className={`scroll-mt-24${i > 0 ? " mt-8" : ""}`}>
            <h2 className="mb-5 flex items-center gap-2 text-sm text-gray-400">
              <g.Icon className="h-4 w-4 text-gray-400" /> {g.title}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {g.cards.map((c) => (
                <Link
                  key={c.href}
                  href={c.href}
                  className="group flex items-start gap-4 rounded-xl border border-gray-200 p-4 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-white text-brand-600">
                    <c.Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-base text-gray-900">{c.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">{c.text}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
