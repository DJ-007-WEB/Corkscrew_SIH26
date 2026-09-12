export default function HistogramChart({
  probabilities,
  counts,
  shots,
  title = "Histogram",
}: {
  probabilities?: Record<string, number>;
  counts?: Record<string, number>;
  shots?: number;
  title?: string;
}) {
  const isCounts = !!counts;
  const source = counts ?? probabilities ?? {};
  const entries = Object.entries(source).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...entries.map(([, v]) => v), isCounts ? 1 : 0.0001);
  const totalShots = isCounts ? shots ?? entries.reduce((sum, [, v]) => sum + v, 0) : 0;

  return (
    <div className="bp-panel p-4">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-4">
        {title}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs font-mono text-[var(--bp-text-faint)]">No measurable outcomes.</p>
      ) : (
        <div className="flex items-end gap-3 h-40 overflow-x-auto bp-scrollbar">
          {entries.map(([state, value]) => (
            <div key={state} className="flex-1 min-w-[2.5rem] flex flex-col items-center gap-2 h-full justify-end">
              <span className="text-[11px] font-mono text-[var(--bp-text-dim)] whitespace-nowrap">
                {isCounts ? value : `${(value * 100).toFixed(0)}%`}
              </span>
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${(value / max) * 100}%`,
                  background: "var(--bp-cyan)",
                  boxShadow: "0 0 14px var(--bp-cyan-dim)",
                  minHeight: value > 0 ? 4 : 0,
                }}
              />
              <span className="text-xs font-mono text-[var(--bp-text)]">|{state}⟩</span>
            </div>
          ))}
        </div>
      )}
      {isCounts && totalShots > 0 && (
        <p className="text-[10px] font-mono text-[var(--bp-text-faint)] mt-3">{totalShots} shots sampled from the current statevector</p>
      )}
    </div>
  );
}
