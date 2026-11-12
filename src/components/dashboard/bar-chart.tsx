const nf = new Intl.NumberFormat("pt-BR");

/** Teto "redondo" do eixo (1, 2, 2,5 ou 5 × 10ⁿ) para as linhas de grade. */
function niceMax(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= n) return m * pow;
  return 10 * pow;
}

/**
 * Barras agrupadas por mês ("Cadastros e matrículas nos últimos 12 meses"): série 1 na cor de
 * destaque, série 2 em cinza, linhas de grade com o eixo à esquerda. Divs (sem biblioteca).
 */
export function MonthlyBarChart({ labels, series, label }: { labels: string[]; series: [{ name: string; values: number[] }, { name: string; values: number[] }]; label: string }) {
  const top = niceMax(Math.max(0, ...series[0].values, ...series[1].values));
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const pct = (v: number) => `${(v / top) * 100}%`;
  return (
    <div className="relative h-56 min-w-0" role="img" aria-label={label}>
      <div className="absolute inset-0 bottom-6 left-9">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-dashed border-gray-100" style={{ bottom: `${t * 100}%` }}>
            <span className="absolute -left-9 w-7 -translate-y-1/2 text-right text-label tabular-nums text-gray-400">{nf.format(Math.round(top * t))}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
          {labels.map((m, i) => (
            <div key={`${m}-${i}`} className="group flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 sm:gap-1">
              <div
                className="w-full max-w-4 rounded-t-sm bg-brand-500 transition-opacity group-hover:opacity-80"
                style={{ height: pct(series[0].values[i]) }}
                title={`${m} · ${series[0].name}: ${nf.format(series[0].values[i])}`}
              />
              <div
                className="w-full max-w-4 rounded-t-sm bg-gray-300 transition-opacity group-hover:opacity-80"
                style={{ height: pct(series[1].values[i]) }}
                title={`${m} · ${series[1].name}: ${nf.format(series[1].values[i])}`}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 left-9 flex gap-1 sm:gap-2">
        {labels.map((m, i) => (
          <span key={`${m}-${i}`} className="min-w-0 flex-1 truncate text-center text-label text-gray-400">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
