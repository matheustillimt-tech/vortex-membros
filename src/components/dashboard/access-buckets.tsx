const nf = new Intl.NumberFormat("pt-BR");
const COLORS = ["bg-brand-500", "bg-brand-400", "bg-brand-300", "bg-brand-200", "bg-brand-100"];

/** "Acessos nos últimos 30 dias": 5 faixas pelo último acesso, barra relativa à maior e % do total. */
export function AccessBuckets({ buckets }: { buckets: { label: string; count: number }[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const max = Math.max(0, ...buckets.map((b) => b.count));
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-6 lg:col-span-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-gray-900">Acessos nos últimos 30 dias</h2>
          <p className="mt-0.5 text-hint text-gray-400">Alunos agrupados pelo último acesso</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <span className="block text-2xl font-semibold leading-none tracking-tight tabular-nums text-gray-900">{nf.format(total)}</span>
          <span className="whitespace-nowrap text-label text-gray-400">alunos em 30 dias</span>
        </div>
      </div>
      <ul className="mt-5 flex flex-1 flex-col justify-center gap-3.5" role="list">
        {buckets.map((b, i) => {
          const p = total > 0 ? Math.round((b.count / total) * 100) : 0;
          return (
            <li key={b.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-hint">
              <span className="truncate text-gray-600">{b.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${b.label}: ${nf.format(b.count)} (${p}%)`}>
                <div className={`h-full rounded-full ${COLORS[i] ?? COLORS[4]}`} style={{ width: `${max > 0 ? (b.count / max) * 100 : 0}%` }} />
              </div>
              <span className="w-[5.5rem] text-right tabular-nums">
                <span className="font-medium text-gray-900">{nf.format(b.count)}</span>
                <span className="ml-1 inline-block w-9 text-gray-400">{p}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
