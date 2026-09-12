import { useEffect, useState } from "react";
import { getInstructorDashboard } from "./api";
import type { InstructorDashboard as DashboardData } from "./types";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bp-panel p-5">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">{label}</p>
      <p className="font-display text-3xl mt-2 text-[var(--bp-cyan)]">{value}</p>
      {sub && <p className="text-[11px] text-[var(--bp-text-faint)] mt-1">{sub}</p>}
    </div>
  );
}

export default function InstructorDashboard({ token }: { token: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError(null);
    getInstructorDashboard(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load dashboard"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Instructor console</p>
          <h1 className="font-display text-3xl mt-2">Cohort overview</h1>
          <p className="text-sm text-[var(--bp-text-dim)] mt-2 max-w-2xl">
            Live figures computed from signed-up learners and submitted assessment attempts — nothing here is
            sample data.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)] disabled:opacity-40 shrink-0">
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <section className="bp-panel p-5">
          <p className="text-sm text-[var(--bp-coral)]">{error}</p>
          <p className="text-xs text-[var(--bp-text-faint)] mt-2">
            This dashboard needs MONGODB_URI configured on the backend, and your account must have the
            instructor role.
          </p>
        </section>
      )}

      {!error && loading && !data && <p className="text-xs font-mono text-[var(--bp-text-faint)]">Loading cohort data...</p>}

      {data && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total sign-ups" value={String(data.total_signups)} sub="All registered accounts, all roles" />
            <StatCard label="Active learners" value={String(data.active_learners)} sub={`Active in the last ${data.active_window_days} days`} />
            <StatCard label="Assessment attempts" value={String(data.total_assessment_attempts)} sub="Submitted across all students" />
            <StatCard label="Average score" value={`${data.average_assessment_score.toFixed(1)}%`} sub="Cumulative across every attempt" />
          </div>

          <section className="bp-panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Contest · top performers</p>
              <span className="text-[10px] font-mono text-[var(--bp-text-faint)]">Ranked by average score</span>
            </div>
            {data.top_performers.length === 0 ? (
              <p className="text-sm text-[var(--bp-text-dim)]">No assessment attempts recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {data.top_performers.map((performer, index) => (
                  <div key={`${performer.name}-${index}`} className="flex items-center gap-3 rounded border border-[var(--bp-border)] px-3 py-2.5">
                    <span className="w-6 text-center font-mono text-xs text-[var(--bp-cyan)]">#{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{performer.name}</p>
                      {performer.email && <p className="text-[11px] text-[var(--bp-text-faint)] truncate">{performer.email}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm text-[var(--bp-text)]">{performer.average_percentage.toFixed(1)}%</p>
                      <p className="text-[10px] text-[var(--bp-text-faint)]">{performer.attempts} attempt{performer.attempts === 1 ? "" : "s"} · best {performer.best_percentage.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.note && <p className="text-[11px] text-[var(--bp-text-faint)] mt-4 leading-relaxed">{data.note}</p>}
          </section>

          <section className="bp-panel p-5">
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-2">Learning module</p>
            <p className="text-sm text-[var(--bp-text-dim)] leading-relaxed">
              Adding/editing topics inside the Learning module is not enabled for instructors in this round — lessons
              stay fixed content for now. Flagged as a roadmap item.
            </p>
          </section>

          <p className="text-[10px] font-mono text-[var(--bp-text-faint)]">Generated {new Date(data.generated_at).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
