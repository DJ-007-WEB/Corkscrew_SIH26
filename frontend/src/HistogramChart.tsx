export default function HistogramChart({
  probabilities,
}: {
  probabilities: Record<string, number>;
}) {
  const entries = Object.entries(probabilities).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...entries.map(([, p]) => p), 0.0001);

  return (
    <div className="bp-panel p-4">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-4">
        Histogram
      </p>
      <div className="flex items-end gap-3 h-40">
        {entries.map(([state, p]) => (
          <div key={state} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <span className="text-[11px] font-mono text-[var(--bp-text-dim)]">
              {(p * 100).toFixed(0)}%
            </span>
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${(p / max) * 100}%`,
                background: "var(--bp-cyan)",
                boxShadow: "0 0 14px var(--bp-cyan-dim)",
                minHeight: 4,
              }}
            />
            <span className="text-xs font-mono text-[var(--bp-text)]">|{state}⟩</span>
          </div>
        ))}
      </div>
    </div>
  );
}
