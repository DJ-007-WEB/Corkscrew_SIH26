export function MiniBarChart({ data, height = 140 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-3 overflow-x-auto bp-scrollbar" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex-1 min-w-[2.5rem] flex flex-col items-center gap-2 h-full justify-end">
          <span className="text-[11px] font-mono text-[var(--bp-text-dim)]">{d.value}</span>
          <div
            className="w-full rounded-t-sm transition-all"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 4 : 0, background: "var(--bp-cyan)", boxShadow: "0 0 14px var(--bp-cyan-dim)" }}
          />
          <span className="text-[10px] font-mono text-[var(--bp-text-faint)] whitespace-nowrap">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MiniLineChart({ data, height = 120 }: { data: { label: string; value: number }[]; height?: number }) {
  const width = Math.max(data.length * 32, 240);
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = data.length > 1 ? i * stepX : width / 2;
    const y = height - (d.value / max) * (height - 20) - 10;
    return { x, y, ...d };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${points[points.length - 1]?.x.toFixed(1) ?? 0} ${height} L ${points[0]?.x.toFixed(1) ?? 0} ${height} Z`;

  return (
    <div className="overflow-x-auto bp-scrollbar">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block">
        <path d={area} fill="var(--bp-cyan-dim)" opacity={0.25} />
        <path d={path} fill="none" stroke="var(--bp-cyan)" strokeWidth={2} />
        {points.map((p) => (
          <circle key={p.label} cx={p.x} cy={p.y} r={2.5} fill="var(--bp-cyan)" />
        ))}
      </svg>
      <div className="flex mt-1" style={{ width }}>
        {points.map((p, i) => (
          <span key={p.label} className="text-[9px] font-mono text-[var(--bp-text-faint)]" style={{ position: "relative", left: i === 0 ? 0 : -14 }}>
            {i % Math.max(1, Math.floor(points.length / 7)) === 0 ? p.label.slice(5) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
