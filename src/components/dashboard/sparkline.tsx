/** Sparkline do card (80×32, linha na cor de destaque, sem eixos). Server component. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 80;
  const h = 32;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <div className="relative h-8 w-full min-w-0">
      <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible">
        <polygon points={area} className="fill-brand-500/10" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="text-brand-500" />
      </svg>
    </div>
  );
}
