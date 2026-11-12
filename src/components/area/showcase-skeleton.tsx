/** Placeholder enquanto as vitrines carregam: mesmas medidas da linha de título e das capas 9:16. */
export function ShowcaseSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="pt-6" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="vx-showcase">
          <div className="vx-row-head">
            <div className="h-4 w-44 rounded-sm bg-blank" />
          </div>
          <ul className="vx-track overflow-hidden" aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <li key={i}>
                <div className="vx-cover-wrap">
                  <div className="vx-cover" />
                  <div className="vx-progress" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
