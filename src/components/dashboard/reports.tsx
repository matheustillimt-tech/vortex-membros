import Link from "next/link";
import type { AccessBucket } from "@/lib/dashboard/reports";
import { ArrowLeftIcon, ChevronRightIcon, MoonIcon } from "./icons";

/** Peças dos relatórios. Sem estado: servem a páginas do servidor e ao cliente. */

type IconProps = { className?: string };
function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
);
export const ActivityIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
  </Svg>
);
export const UserXIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="m17 8 5 5" />
    <path d="m22 8-5 5" />
  </Svg>
);
export const GraduationCapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
    <path d="M22 10v6" />
    <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
  </Svg>
);
export const TrendingUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 7h6v6" />
    <path d="m22 7-8.5 8.5-5-5L2 17" />
  </Svg>
);
export const ThumbsUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </Svg>
);
export const ThumbsDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 14V2" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  </Svg>
);
export const UserPlusSvg = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6" />
    <path d="M22 11h-6" />
  </Svg>
);

export const nf = new Intl.NumberFormat("pt-BR");
export const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Selo "Atualizado a cada 24h" (escondido no celular). */
export function UpdatedSelo() {
  return (
    <span className="hidden sm:inline">
      <span className="selo selo--neutral gap-1.5 px-2.5 py-1">
        <ClockIcon className="h-3.5 w-3.5" /> Atualizado a cada 24h
      </span>
    </span>
  );
}

/** Cabeçalho dos relatórios: voltar, título, subtítulo, ações (busca e selo) e o traço. */
export function ReportHeader({
  back,
  title,
  subtitle,
  actions,
}: {
  back: { href: string; label: string };
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div data-backlink="">
              <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600">
                <ArrowLeftIcon className="h-3.5 w-3.5" /> {back.label}
              </Link>
            </div>
            <h1 className="py-1.5 text-lg font-semibold text-gray-900 sm:text-xl">{title}</h1>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
          <div data-topo-acoes="" className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
            {actions}
            <UpdatedSelo />
          </div>
        </div>
      </div>
      <div data-header-traco="" className="my-6 border-b border-gray-200" />
    </>
  );
}

const TONES = {
  brand: "bg-brand-50 text-brand-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
} as const;

/** Card de KPI: ícone em quadrado colorido, número e rótulo; `children` vai embaixo. */
export function KpiCard({
  icon: Icon,
  tone,
  value,
  label,
  children,
}: {
  icon: (p: IconProps) => React.ReactNode;
  tone: keyof typeof TONES;
  value: string;
  label: string;
  children?: React.ReactNode;
}) {
  const [bg, fg] = TONES[tone].split(" ");
  return (
    <div className="block rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${bg}`}>
          <Icon className={`h-5 w-5 ${fg}`} />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
          <p className="truncate text-xs text-gray-500">{label}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Barra de likes/dislikes (verde até a proporção de likes; sem avaliações, só o trilho). */
export function LikeBar({ likes, dislikes, className }: { likes: number; dislikes: number; className: string }) {
  const total = likes + dislikes;
  return (
    <div className={`flex gap-px overflow-hidden rounded-full bg-gray-100 ${className}`}>
      {total > 0 ? (
        <>
          <div className="h-full bg-emerald-500" style={{ width: `${(likes / total) * 100}%` }} />
          <div className="h-full flex-1 bg-red-400" />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- rosca e barras

export const BUCKETS: Record<AccessBucket, { label: string; short: string; color: string; dot: string; icon: (p: IconProps) => React.ReactNode; iconClass: string }> = {
  "active-7d": { label: "Ativos (últimos 7 dias)", short: "Ativos 7d", color: "#10b981", dot: "bg-emerald-500", icon: ActivityIcon, iconClass: "text-emerald-600" },
  "inactive-7-15d": { label: "Inativos recentes (7–15 dias)", short: "Inativos 7–15d", color: "#f59e0b", dot: "bg-amber-500", icon: ClockIcon, iconClass: "text-amber-600" },
  "inactive-15d": { label: "Inativos (mais de 15 dias)", short: "Inativos +15d", color: "#f97316", dot: "bg-orange-500", icon: MoonIcon, iconClass: "text-orange-600" },
  "never-accessed": { label: "Nunca acessaram", short: "Nunca acessaram", color: "#a1a1aa", dot: "bg-zinc-400", icon: UserXIcon, iconClass: "text-gray-500" },
};

const R = 54;
const STROKE = 13;
const GAP = 4;
const C = 2 * Math.PI * R;

/** Rosca SVG (viewBox 128, r=54, traço 13, pontas redondas, ~4 de folga entre os segmentos). */
export function EngagementDonut({ buckets, total }: { buckets: { key: AccessBucket; count: number }[]; total: number }) {
  const parts = buckets.filter((b) => b.count > 0);
  const single = parts.length === 1;
  // Início de cada segmento = soma dos anteriores (sem reatribuir variáveis no render).
  const lens = parts.map((b) => (b.count / total) * C);
  const segments = parts.map((b, i) => {
    const before = lens.slice(0, i).reduce((s, n) => s + n, 0);
    // A ponta redonda soma STROKE/2 em cada lado: o traço encolhe para manter a folga visível.
    const dash = single ? C : Math.max(0.001, lens[i] - STROKE - GAP);
    const start = single ? 0 : before + STROKE / 2 + GAP / 2;
    return { key: b.key, dash, start };
  });
  const top = [...buckets].sort((a, b) => b.count - a.count)[0];
  const topPct = total > 0 && top ? Math.round((top.count / total) * 100) : 0;
  return (
    <div className="relative flex-shrink-0">
      <svg viewBox="0 0 128 128" className="h-40 w-40 -rotate-90" role="img" aria-label="Distribuição de alunos por nível de engajamento">
        <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-gray-100" />
        {segments.map((s) => (
          <circle
            key={s.key}
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke={BUCKETS[s.key].color}
            strokeWidth={STROKE}
            strokeLinecap={single ? "butt" : "round"}
            strokeDasharray={`${s.dash} ${C}`}
            strokeDashoffset={-s.start}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <span className="text-3xl font-bold tabular-nums text-gray-900">{topPct}%</span>
        <span className="mt-1 text-xs font-medium leading-tight text-gray-500">{total > 0 && top ? BUCKETS[top.key].short : "Sem alunos"}</span>
      </div>
    </div>
  );
}

/** Legenda da rosca: cada faixa é um link para a lista de alunos filtrada. */
export function EngagementLegend({ buckets, total }: { buckets: { key: AccessBucket; count: number }[]; total: number }) {
  return (
    <ul className="w-full flex-1 divide-y divide-gray-100">
      {buckets.map((b) => {
        const meta = BUCKETS[b.key];
        const Icon = meta.icon;
        return (
          <li key={b.key}>
            <Link
              href={`/dashboard/students?access=${b.key}`}
              title={`Ver os alunos em ${meta.label}`}
              className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray-50"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50">
                <Icon className={`h-4 w-4 ${meta.iconClass}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${meta.dot}`} />
                  <span className="truncate text-sm text-gray-600 group-hover:text-gray-900">{meta.label}</span>
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-gray-900">{nf.format(b.count)}</span>
              <span className="w-12 flex-shrink-0 text-right text-xs font-medium tabular-nums text-gray-400">{total > 0 ? Math.round((b.count / total) * 100) : 0}%</span>
              <ChevronRightIcon className="-ml-1 h-4 w-4 flex-shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Barras de "Novos cadastros" (divs; altura = n / maior × 92%, mínimo 3%). */
export function MonthBars({ months }: { months: { month: string; label: string; count: number }[] }) {
  const max = Math.max(0, ...months.map((m) => m.count));
  return (
    <div className="mt-6 flex h-52 items-end gap-1.5 sm:gap-3">
      {months.map((m, i) => (
        <div key={m.month} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <span className="text-label font-medium tabular-nums text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100">{nf.format(m.count)}</span>
          <div
            className="w-full rounded-t-md bg-brand-500/15 transition-colors group-hover:bg-brand-500/30"
            style={{ height: `${max > 0 ? Math.max(3, Math.round((m.count / max) * 92)) : 3}%` }}
            title={`${m.label}: ${nf.format(m.count)}`}
          />
          <span className={`w-full truncate text-center text-label text-gray-400${i % 2 === 1 ? " hidden sm:block" : ""}`}>{m.label}</span>
        </div>
      ))}
    </div>
  );
}
