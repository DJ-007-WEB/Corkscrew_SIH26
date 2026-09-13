import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getInstructorDashboard } from "./api";
import CircuitBuilder from "./CircuitBuilder";
import VisualizationPage from "./VisualizationPage";
import InstructorAssessments from "./InstructorAssessments";
import { MiniBarChart, MiniLineChart } from "./MiniCharts";
import type { Circuit, InstructorDashboard as DashboardData, SimulationResult } from "./types";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bp-panel p-5">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">{label}</p>
      <p className="font-display text-3xl mt-2 text-[var(--bp-cyan)]">{value}</p>
      {sub && <p className="text-[11px] text-[var(--bp-text-faint)] mt-1">{sub}</p>}
    </div>
  );
}

type SubTab = "overview" | "builder" | "visualizations" | "assessments";

type Props = {
  token: string;
  circuit: Circuit;
  onCircuitChange: Dispatch<SetStateAction<Circuit>>;
  latestResult: SimulationResult | null;
  theme: "dark" | "light";
  activeSubTab?: SubTab;
};

export default function InstructorDashboard({ token, circuit, onCircuitChange, latestResult, theme, activeSubTab = "overview" }: Props) {
  return (
    <div className="space-y-5">
      {activeSubTab === "overview" && <Overview token={token} />}
      {activeSubTab === "builder" && (
        <CircuitBuilder circuit={circuit} onCircuitChange={onCircuitChange} theme={theme} token={token} onRequireLogin={() => {}} presetCircuit={null} onPresetClear={() => {}} />
      )}
      {activeSubTab === "visualizations" && <VisualizationPage result={latestResult} />}
      {activeSubTab === "assessments" && <InstructorAssessments token={token} />}
    </div>
  );
}

function Overview({ token }: { token: string }) {
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
        <p className="text-sm text-[var(--bp-text-dim)] max-w-2xl">
          Live figures computed from signed-up learners, submitted assessment attempts, and contest/XP activity —
          nothing here is sample data.
        </p>
        <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)] disabled:opacity-40 shrink-0">
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <section className="bp-panel p-5">
          <p className="text-sm text-[var(--bp-coral)]">{error}</p>
          <p className="text-xs text-[var(--bp-text-faint)] mt-2">
            This dashboard needs MONGODB_URI configured on the backend, and your account must have the instructor role.
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

          <div className="grid lg:grid-cols-2 gap-4">
            <section className="bp-panel p-5">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-4">Sign-ups · last 14 days</p>
              {data.signup_trend.every((d) => d.count === 0) ? (
                <p className="text-sm text-[var(--bp-text-dim)]">No sign-ups in this window yet.</p>
              ) : (
                <MiniLineChart data={data.signup_trend.map((d) => ({ label: d.date, value: d.count }))} />
              )}
            </section>
            <section className="bp-panel p-5">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-4">Score distribution</p>
              {data.total_assessment_attempts === 0 ? (
                <p className="text-sm text-[var(--bp-text-dim)]">No assessment attempts recorded yet.</p>
              ) : (
                <MiniBarChart data={Object.entries(data.score_distribution).map(([label, value]) => ({ label, value }))} />
              )}
            </section>
          </div>

          <section className="bp-panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Assessment leaderboard · top performers</p>
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
          </section>

          <div className="grid lg:grid-cols-2 gap-4">
            <section className="bp-panel p-5">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-4">Assessments</p>
              {data.assessment_breakdown.length === 0 ? (
                <p className="text-sm text-[var(--bp-text-dim)]">{data.note ?? "No assessments created yet."}</p>
              ) : (
                <div className="space-y-2">
                  {data.assessment_breakdown.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded border border-[var(--bp-border)] px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{a.title}</p>
                        <p className="text-[10px] text-[var(--bp-text-faint)]">{a.published ? "Published" : "Draft"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm text-[var(--bp-text)]">{a.attempts} attempt{a.attempts === 1 ? "" : "s"}</p>
                        {a.attempts > 0 && <p className="text-[10px] text-[var(--bp-text-faint)]">avg {a.average_percentage.toFixed(1)}%</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bp-panel p-5">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-4">Contest · XP leaderboard</p>
              {data.xp_leaderboard.length === 0 ? (
                <p className="text-sm text-[var(--bp-text-dim)]">No contest/XP activity recorded yet — see the Contests tab.</p>
              ) : (
                <div className="space-y-2">
                  {data.xp_leaderboard.map((entry) => (
                    <div key={`${entry.user_id}-${entry.rank}`} className="flex items-center gap-3 rounded border border-[var(--bp-border)] px-3 py-2.5">
                      <span className="w-6 text-center font-mono text-xs text-[var(--bp-cyan)]">#{entry.rank}</span>
                      <p className="flex-1 text-sm truncate">{entry.name}</p>
                      <p className="font-mono text-sm text-[var(--bp-text)]">{entry.total_xp} XP</p>
                      <p className="text-[10px] text-[var(--bp-text-faint)]">LVL {entry.level}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <p className="text-[10px] font-mono text-[var(--bp-text-faint)]">Generated {new Date(data.generated_at).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
