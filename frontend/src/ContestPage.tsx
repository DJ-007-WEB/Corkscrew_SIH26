import { useEffect, useRef, useState } from "react";
import { answerDuel, cancelDuel, createDuel, getDuel, getLeaderboard, getMyStats, getUserProfile, joinDuel, listChallenges, startSprint, submitChallenge, submitDuel, submitSprint } from "./api";
import type { ChallengeResult, ChallengeTask, Circuit, DuelState, LeaderboardEntry, SprintResult, SprintStart, UserProfile, UserStats } from "./types";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">{label}</p>
      <p className="font-display text-2xl mt-1">{value}</p>
      {sub && <p className="text-[11px] text-[var(--bp-text-dim)] mt-1">{sub}</p>}
    </div>
  );
}

function formatTime(totalSec: number) {
  const s = Math.max(0, Math.ceil(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type ContestTab = "overview" | "sprint" | "challenge" | "duel";

export default function ContestPage({ token, circuit, onOpenBuilder }: { token: string; circuit: Circuit; onOpenBuilder: () => void }) {
  const [tab, setTab] = useState<ContestTab>("overview");
  const [stats, setStats] = useState<UserStats | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<"all" | "weekly">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Public profile modal (LeetCode-style player overview).
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  async function openProfile(userId: string) {
    if (!userId) return;
    setProfile(null);
    setProfileError(null);
    setProfileLoading(true);
    try {
      setProfile(await getUserProfile(token, userId));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not load profile");
    } finally {
      setProfileLoading(false);
    }
  }

  function closeProfile() {
    setProfile(null);
    setProfileError(null);
    setProfileLoading(false);
  }

  // Sprint state
  const [sprint, setSprint] = useState<SprintStart | null>(null);
  const [sprintAnswers, setSprintAnswers] = useState<Record<string, number>>({});
  const [sprintLeft, setSprintLeft] = useState(0);
  const [sprintBusy, setSprintBusy] = useState(false);
  const [sprintError, setSprintError] = useState<string | null>(null);
  const [sprintResult, setSprintResult] = useState<SprintResult | null>(null);
  const sprintTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sprintRef = useRef<SprintStart | null>(null);
  const answersRef = useRef<Record<string, number>>({});
  sprintRef.current = sprint;
  answersRef.current = sprintAnswers;

  // Challenge state
  const [tasks, setTasks] = useState<ChallengeTask[]>([]);
  const [taskId, setTaskId] = useState<string>("flip-to-one");
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeResult, setChallengeResult] = useState<ChallengeResult | null>(null);

  // Duel state
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [duelBusy, setDuelBusy] = useState(false);
  const [duelError, setDuelError] = useState<string | null>(null);
  const [duelLeft, setDuelLeft] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([getMyStats(token), getLeaderboard(token, period)])
      .then(([me, entries]) => {
        setStats(me);
        setBoard(entries);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load contests"))
      .finally(() => setLoading(false));
  }, [token, period]);

  useEffect(() => {
    listChallenges().then((list) => {
      setTasks(list);
      if (list.length > 0) setTaskId((prev) => (list.some((t) => t.id === prev) ? prev : list[0].id));
    }).catch(() => {});
  }, []);

  useEffect(() => () => {
    if (sprintTimer.current) clearInterval(sprintTimer.current);
  }, []);

  // Duel polling: refresh room state every 2s while waiting or live.
  useEffect(() => {
    if (!duel || duel.status === "finished" || tab !== "duel") return;
    const code = duel.code;
    const id = setInterval(async () => {
      try {
        const state = await getDuel(token, code);
        setDuel(state);
        if (state.status === "finished" && state.stats) setStats(state.stats);
      } catch {
        // Polling is best-effort; errors surface on the next user action.
      }
    }, 2000);
    return () => clearInterval(id);
  }, [duel?.code, duel?.status, tab, token]);

  // Duel countdown ticks locally between server polls.
  useEffect(() => {
    if (duel) setDuelLeft(duel.time_left_sec);
  }, [duel?.time_left_sec]);

  useEffect(() => {
    if (!duel || duel.status !== "live" || tab !== "duel") return;
    const id = setInterval(() => setDuelLeft((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(id);
  }, [duel?.code, duel?.status, tab]);

  function stopSprintTimer() {
    if (sprintTimer.current) {
      clearInterval(sprintTimer.current);
      sprintTimer.current = null;
    }
  }

  async function doSubmitSprint() {
    const active = sprintRef.current;
    if (!active || sprintBusy) return;
    stopSprintTimer();
    setSprintBusy(true);
    setSprintError(null);
    try {
      const result = await submitSprint(token, active.attempt_id, answersRef.current);
      setSprintResult(result);
      setStats(result.stats);
      setSprint(null);
    } catch (err) {
      setSprintError(err instanceof Error ? err.message : "Could not submit sprint");
      // Restart a short grace timer so the user can retry submitting.
      setSprintLeft(60);
      sprintTimer.current = setInterval(() => {
        setSprintLeft((left) => {
          if (left <= 1) {
            if (sprintTimer.current) clearInterval(sprintTimer.current);
            return 0;
          }
          return left - 1;
        });
      }, 1000);
    } finally {
      setSprintBusy(false);
    }
  }

  async function beginSprint() {
    stopSprintTimer();
    setSprintBusy(true);
    setSprintError(null);
    setSprintResult(null);
    try {
      const started = await startSprint(token);
      setSprint(started);
      setSprintAnswers({});
      setSprintLeft(started.duration_sec);
      sprintTimer.current = setInterval(() => {
        setSprintLeft((left) => {
          if (left <= 1) {
            void doSubmitSprint();
            return 0;
          }
          return left - 1;
        });
      }, 1000);
    } catch (err) {
      setSprintError(err instanceof Error ? err.message : "Could not start sprint");
    } finally {
      setSprintBusy(false);
    }
  }

  function quitSprint() {
    stopSprintTimer();
    setSprint(null);
    setSprintAnswers({});
    setSprintError(null);
  }

  async function doSubmitChallenge() {    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (circuit.qubits !== task.qubits) {
      setChallengeError(`This task needs exactly ${task.qubits} qubit(s). Your builder circuit has ${circuit.qubits} — adjust qubits in Circuit Builder first.`);
      return;
    }
    if (circuit.gates.length === 0) {
      setChallengeError("Your builder circuit is empty. Open Circuit Builder, place some gates, then submit.");
      return;
    }
    setChallengeBusy(true);
    setChallengeError(null);
    try {
      const result = await submitChallenge(token, taskId, circuit);
      setChallengeResult(result);
      setStats(result.stats);
    } catch (err) {
      setChallengeError(err instanceof Error ? err.message : "Could not submit challenge");
    } finally {
      setChallengeBusy(false);
    }
  }

  async function beginDuel() {
    setDuelBusy(true);
    setDuelError(null);
    try {
      const { code } = await createDuel(token);
      setDuel(await getDuel(token, code));
      setJoinCode("");
    } catch (err) {
      setDuelError(err instanceof Error ? err.message : "Could not create duel room");
    } finally {
      setDuelBusy(false);
    }
  }

  async function joinDuelRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setDuelError("Enter the 6-character room code your opponent shared.");
      return;
    }
    setDuelBusy(true);
    setDuelError(null);
    try {
      setDuel(await joinDuel(token, code));
      setJoinCode("");
    } catch (err) {
      setDuelError(err instanceof Error ? err.message : "Could not join duel room");
    } finally {
      setDuelBusy(false);
    }
  }

  async function answerDuelQuestion(questionId: string, option: number) {
    if (!duel || duel.status !== "live" || duel.my_submitted) return;
    setDuel((prev) => (prev ? { ...prev, my_answers: { ...prev.my_answers, [questionId]: option } } : prev));
    try {
      const state = await answerDuel(token, duel.code, questionId, option);
      setDuel(state);
      if (state.status === "finished" && state.stats) setStats(state.stats);
    } catch (err) {
      setDuelError(err instanceof Error ? err.message : "Could not record answer");
    }
  }

  async function submitDuelAnswers() {
    if (!duel) return;
    setDuelBusy(true);
    setDuelError(null);
    try {
      const state = await submitDuel(token, duel.code);
      setDuel(state);
      if (state.stats) setStats(state.stats);
    } catch (err) {
      setDuelError(err instanceof Error ? err.message : "Could not submit duel");
    } finally {
      setDuelBusy(false);
    }
  }

  async function leaveDuel() {
    if (!duel) return;
    setDuelBusy(true);
    try {
      if (duel.status === "waiting" && duel.is_host) await cancelDuel(token, duel.code);
    } catch {
      // Leaving a waiting room best-effort; the room simply stays until expiry.
    } finally {
      setDuel(null);
      setDuelBusy(false);
    }
  }

  const progress = stats ? Math.min(100, Math.round((stats.xp_into_level / stats.xp_for_next_level) * 100)) : 0;
  const activeTask = tasks.find((t) => t.id === taskId);

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-amber)]">Compete · Learn · Repeat</p>
        <h1 className="font-display text-3xl mt-2">Quantum Contests</h1>
        <p className="text-sm text-[var(--bp-text-dim)] mt-2">
          Earn XP by running circuits, saving work and finishing assessments. Keep a daily streak to climb the global leaderboard.
        </p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(["overview", "sprint", "challenge", "duel"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded border text-xs font-mono transition-colors"
            style={{
              borderColor: tab === t ? "var(--bp-cyan)" : "var(--bp-border)",
              color: tab === t ? "var(--bp-cyan)" : "var(--bp-text-faint)",
              background: tab === t ? "var(--bp-cyan-dim)" : "transparent",
            }}
          >
            {t === "overview" ? "Overview" : t === "sprint" ? "⚡ Sprint Quiz" : t === "challenge" ? "⊕ Circuit Challenge" : "⚔ 1v1 Duel"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {loading && <p className="text-xs font-mono text-[var(--bp-text-faint)]">Loading your arena…</p>}
          {error && <p className="text-sm text-[var(--bp-coral)]">{error}</p>}

          {stats && (
            <section className="bp-panel p-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="font-display text-xl">{stats.name}</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-[var(--bp-cyan)]/40 text-[var(--bp-cyan)]">
                  LVL {stats.level}
                </span>
                {stats.rank !== null && (
                  <span className="text-[11px] font-mono text-[var(--bp-text-dim)]">Global rank #{stats.rank}</span>
                )}
              </div>
              <div className="mt-3 h-2 rounded bg-[var(--bp-bg)] overflow-hidden">
                <div className="h-full rounded transition-all" style={{ width: `${progress}%`, background: "var(--bp-cyan)" }} />
              </div>
              <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-1.5">
                {stats.xp_into_level} / {stats.xp_for_next_level} XP to level {stats.level + 1} · {stats.total_xp} total XP
              </p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Streak" value={`🔥 ${stats.streak_count}`} sub={`Best ${stats.best_streak} day${stats.best_streak === 1 ? "" : "s"}`} />
                <StatCard label="Total XP" value={String(stats.total_xp)} sub={`Level ${stats.level}`} />
                <StatCard label="Contests" value={String(stats.contests_played)} sub="Timed events played" />
                <StatCard label="Duels won" value={String(stats.duels_won)} sub="1v1 victories" />
              </div>
            </section>
          )}

          <section className="bp-panel p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl">Global Leaderboard</h2>
              <div className="ml-auto flex gap-1.5">
                {(["all", "weekly"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className="px-3 py-1.5 rounded border text-[11px] font-mono transition-colors"
                    style={{
                      borderColor: period === p ? "var(--bp-cyan)" : "var(--bp-border)",
                      color: period === p ? "var(--bp-cyan)" : "var(--bp-text-faint)",
                    }}
                  >
                    {p === "all" ? "All-time" : "This week"}
                  </button>
                ))}
              </div>
            </div>
            {!loading && !board.length && (
              <p className="text-sm text-[var(--bp-text-dim)] mt-4">
                No ranked players yet — run a circuit or finish the assessment to claim the top spot.
              </p>
            )}
            {board.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Player</th>
                      <th className="py-2 pr-3 text-right">XP</th>
                      <th className="py-2 pr-3 text-right">Lvl</th>
                      <th className="py-2 text-right">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((entry) => (
                      <tr
                        key={`${entry.rank}-${entry.name}`}
                        className="border-t border-[var(--bp-border)]"
                        style={entry.is_me ? { background: "var(--bp-cyan-dim)" } : undefined}
                      >
                        <td className="py-2 pr-3 font-mono text-[var(--bp-text-dim)]">
                          {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            onClick={() => void openProfile(entry.user_id)}
                            disabled={!entry.user_id}
                            className="hover:text-[var(--bp-cyan)] hover:underline underline-offset-2 disabled:hover:no-underline disabled:hover:text-inherit text-left"
                            title={entry.user_id ? `View ${entry.name}'s profile` : undefined}
                          >
                            {entry.name}
                          </button>
                          {entry.is_me && <span className="ml-2 text-[10px] font-mono text-[var(--bp-cyan)]">YOU</span>}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">{entry.total_xp}</td>
                        <td className="py-2 pr-3 text-right font-mono text-[var(--bp-text-dim)]">{entry.level}</td>
                        <td className="py-2 text-right font-mono text-[var(--bp-text-dim)]">
                          {entry.streak_count > 0 ? `🔥${entry.streak_count}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bp-panel p-5">
            <h2 className="font-display text-xl">More arenas</h2>
            <div className="mt-4 grid sm:grid-cols-3 gap-3">
              <button onClick={() => setTab("sprint")} className="rounded border border-[var(--bp-border)] p-3 text-left hover:border-[var(--bp-cyan)] transition-colors">
                <p className="text-xs font-mono text-[var(--bp-mint)]">● SPRINT QUIZ · LIVE</p>
                <p className="text-xs text-[var(--bp-text-dim)] mt-2">8 timed questions. Speed bonus, skip without penalty.</p>
              </button>
              <button onClick={() => setTab("challenge")} className="rounded border border-[var(--bp-border)] p-3 text-left hover:border-[var(--bp-cyan)] transition-colors">
                <p className="text-xs font-mono text-[var(--bp-mint)]">● CIRCUIT CHALLENGE · LIVE</p>
                <p className="text-xs text-[var(--bp-text-dim)] mt-2">Build-to-spec tasks graded by real simulation.</p>
              </button>
              <button onClick={() => setTab("duel")} className="rounded border border-[var(--bp-border)] p-3 text-left hover:border-[var(--bp-cyan)] transition-colors">
                <p className="text-xs font-mono text-[var(--bp-mint)]">● LIVE 1V1 DUELS · LIVE</p>
                <p className="text-xs text-[var(--bp-text-dim)] mt-2">Room codes, live progress, winner-takes-XP.</p>
              </button>
            </div>
          </section>
        </>
      )}

      {tab === "sprint" && (
        <section className="bp-panel p-5 sm:p-6 space-y-5">
          {!sprint && !sprintResult && (
            <div>
              <h2 className="font-display text-xl">⚡ Sprint Quiz</h2>
              <p className="text-sm text-[var(--bp-text-dim)] mt-2 leading-relaxed">
                8 questions in 8 minutes. +10 per correct answer, −2 per wrong answer, skipped questions cost nothing.
                Finish fast for up to +20 speed bonus. The timer is enforced server-side — late submits don't count.
                You earn XP only for questions you solve correctly for the first time.
              </p>
              {sprintError && <p className="text-sm text-[var(--bp-coral)] mt-3">{sprintError}</p>}
              <button
                onClick={beginSprint}
                disabled={sprintBusy}
                className="mt-4 px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-40"
                style={{ background: "var(--bp-cyan)", color: "#081527" }}
              >
                {sprintBusy ? "Starting…" : "Start sprint →"}
              </button>
            </div>
          )}

          {sprint && (
            <div>
              <div className="flex flex-wrap items-center gap-3 sticky top-0 py-2">
                <h2 className="font-display text-xl">Sprint in progress</h2>
                <span
                  className="ml-auto font-mono text-lg px-3 py-1 rounded border"
                  style={{
                    borderColor: sprintLeft < 60 ? "var(--bp-coral)" : "var(--bp-cyan)",
                    color: sprintLeft < 60 ? "var(--bp-coral)" : "var(--bp-cyan)",
                  }}
                >
                  ⏱ {formatTime(sprintLeft)}
                </span>
              </div>
              <p className="text-[11px] font-mono text-[var(--bp-text-faint)]">
                Answered {Object.keys(sprintAnswers).length}/{sprint.questions.length} · auto-submits at 0:00
              </p>
              {sprint.questions.map((q, index) => (
                <div key={q.id} className="mt-4 rounded border border-[var(--bp-border)] p-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{q.tag}</p>
                  <p className="text-sm font-medium mt-1">{index + 1}. {q.question}</p>
                  <div className="mt-3 space-y-2">
                    {q.options.map((option, optionIndex) => (
                      <label key={option} className="flex items-center gap-2 text-sm text-[var(--bp-text-dim)] cursor-pointer">
                        <input
                          type="radio"
                          name={`sprint-${q.id}`}
                          checked={sprintAnswers[q.id] === optionIndex}
                          onChange={() => setSprintAnswers((prev) => ({ ...prev, [q.id]: optionIndex }))}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {sprintError && <p className="text-sm text-[var(--bp-coral)] mt-3">{sprintError}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={doSubmitSprint}
                  disabled={sprintBusy}
                  className="px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-40"
                  style={{ background: "var(--bp-cyan)", color: "#081527" }}
                >
                  {sprintBusy ? "Submitting…" : "Submit sprint"}
                </button>
                <button onClick={quitSprint} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono">
                  Quit (no score)
                </button>
              </div>
            </div>
          )}

          {sprintResult && (
            <div>
              <h2 className="font-display text-xl">Sprint result</h2>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Correct" value={`${sprintResult.correct}/${sprintResult.total}`} sub={`${sprintResult.wrong} wrong · ${sprintResult.skipped} skipped`} />
                <StatCard label="Time" value={formatTime(sprintResult.time_sec)} sub="Elapsed" />
                <StatCard label="Score" value={String(sprintResult.base_score)} sub={`+${sprintResult.time_bonus} speed bonus`} />
                <StatCard
                  label="XP earned"
                  value={`+${sprintResult.xp_earned}`}
                  sub={sprintResult.already_solved ? "Already solved — no extra XP" : "Added to your total"}
                />
              </div>
              <div className="mt-5 space-y-3">
                {sprintResult.results.map((r) => (
                  <div key={r.id} className="rounded border border-[var(--bp-border)] p-4">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{r.tag}</p>
                    <p className="text-sm font-medium mt-1">{r.question}</p>
                    <p className={`mt-2 text-xs ${r.is_correct ? "text-[var(--bp-mint)]" : "text-[var(--bp-coral)]"}`}>
                      {!r.answered && "Skipped. "}
                      {r.answered && (r.is_correct ? "Correct. " : `You picked: ${r.options[r.your_option ?? 0]}. `)}
                      Correct answer: {r.options[r.correct_option]}.
                    </p>
                    <p className="text-xs text-[var(--bp-text-dim)] mt-1 leading-relaxed">{r.explanation}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={beginSprint}
                disabled={sprintBusy}
                className="mt-5 px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-40"
                style={{ background: "var(--bp-cyan)", color: "#081527" }}
              >
                {sprintBusy ? "Starting…" : "Run it again →"}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "challenge" && (
        <section className="bp-panel p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="font-display text-xl">⊕ Circuit Challenge</h2>
            <p className="text-sm text-[var(--bp-text-dim)] mt-2 leading-relaxed">
              Pick a task, build the circuit in Circuit Builder, then submit your <em>current builder circuit</em> here.
              Submissions are simulated server-side with Qiskit Aer — pass for +50 XP plus up to +30 for using fewer gates.
            </p>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTaskId(t.id); setChallengeResult(null); setChallengeError(null); }}
                className="px-3 py-1.5 rounded border text-[11px] font-mono transition-colors"
                style={{
                  borderColor: taskId === t.id ? "var(--bp-cyan)" : "var(--bp-border)",
                  color: taskId === t.id ? "var(--bp-cyan)" : "var(--bp-text-faint)",
                }}
              >
                {t.title}
              </button>
            ))}
          </div>

          {activeTask && (
            <div className="rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4">
              <p className="font-medium text-sm">{activeTask.title}</p>
              <p className="text-sm text-[var(--bp-text-dim)] mt-1 leading-relaxed">{activeTask.description}</p>
              <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-2">
                Requires {activeTask.qubits} qubit{activeTask.qubits > 1 ? "s" : ""} · max {activeTask.max_gates} gates
              </p>
              <p className="text-xs text-[var(--bp-text-dim)] mt-2">💡 Hint: {activeTask.hint}</p>
            </div>
          )}

          <div className="rounded border border-[var(--bp-border)] p-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">Your builder circuit</p>
            <p className="text-sm font-mono mt-1">
              {circuit.qubits} qubit{circuit.qubits > 1 ? "s" : ""} · {circuit.gates.length} gate{circuit.gates.length !== 1 ? "s" : ""}
              {circuit.gates.length > 0 && (
                <span className="text-[var(--bp-text-dim)]"> — {circuit.gates.map((g) => g.type).join(" → ")}</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={onOpenBuilder} className="px-4 py-2 rounded border border-[var(--bp-border-strong)] text-xs font-mono hover:border-[var(--bp-cyan)]">
                Open Circuit Builder →
              </button>
              <button
                onClick={doSubmitChallenge}
                disabled={challengeBusy}
                className="px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-40"
                style={{ background: "var(--bp-cyan)", color: "#081527" }}
              >
                {challengeBusy ? "Simulating…" : "Submit circuit"}
              </button>
            </div>
            {challengeError && <p className="text-sm text-[var(--bp-coral)] mt-3">{challengeError}</p>}
          </div>

          {challengeResult && (
            <div className={`rounded border p-4 ${challengeResult.passed ? "border-[var(--bp-mint)]/50" : "border-[var(--bp-coral)]/40"}`}>
              <p className={`font-display text-lg ${challengeResult.passed ? "text-[var(--bp-mint)]" : "text-[var(--bp-coral)]"}`}>
                {challengeResult.passed
                  ? challengeResult.already_solved
                    ? "✓ Correct — already solved, +0 XP"
                    : `✓ Passed — +${challengeResult.xp_earned} XP`
                  : challengeResult.already_solved
                    ? "✗ Not quite — already solved, no XP change"
                    : "✗ Not quite — +0 XP"}
              </p>
              <p className="text-sm text-[var(--bp-text-dim)] mt-1">{challengeResult.message}</p>
              <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-2">
                Measured: {Object.entries(challengeResult.probabilities).map(([k, v]) => `${k}:${v.toFixed(3)}`).join("  ")} · {challengeResult.gates_used} gates used
              </p>
              {!challengeResult.passed && (
                <button onClick={onOpenBuilder} className="mt-3 px-4 py-2 rounded border border-[var(--bp-border-strong)] text-xs font-mono hover:border-[var(--bp-cyan)]">
                  Tweak in Builder and resubmit →
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {tab === "duel" && (
        <section className="bp-panel p-5 sm:p-6 space-y-5">
          {!duel && (
            <div>
              <h2 className="font-display text-xl">⚔ Live 1v1 Duel</h2>
              <p className="text-sm text-[var(--bp-text-dim)] mt-2 leading-relaxed">
                Same 5-question set, 5 minutes. Create a room, share the 6-character code with a friend,
                then answer live — progress polls every 2s, grading is server-side at the deadline.
                Winner +50 XP, loser +10 XP participation.
              </p>
              {duelError && <p className="text-sm text-[var(--bp-coral)] mt-3">{duelError}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={beginDuel}
                  disabled={duelBusy}
                  className="px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-40"
                  style={{ background: "var(--bp-cyan)", color: "#081527" }}
                >
                  {duelBusy ? "Creating…" : "Create room →"}
                </button>
              </div>
              <div className="mt-4 rounded border border-[var(--bp-border)] p-4">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">Join with code</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. Q7X2KD"
                    maxLength={6}
                    className="px-3 py-2 rounded border border-[var(--bp-border)] bg-[var(--bp-bg)] font-mono text-sm uppercase tracking-widest w-40"
                  />
                  <button
                    onClick={joinDuelRoom}
                    disabled={duelBusy}
                    className="px-4 py-2 rounded border border-[var(--bp-border-strong)] text-xs font-mono hover:border-[var(--bp-cyan)] disabled:opacity-40"
                  >
                    Join room
                  </button>
                </div>
              </div>
            </div>
          )}

          {duel && duel.status === "waiting" && (
            <div>
              <h2 className="font-display text-xl">Waiting for opponent…</h2>
              <p className="text-sm text-[var(--bp-text-dim)] mt-2">
                Share this code — the duel goes live as soon as your opponent joins.
              </p>
              <p className="mt-3 font-mono text-4xl tracking-[0.3em] text-[var(--bp-cyan)]">{duel.code}</p>
              <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-2">
                Host: {duel.host_name} · polling every 2s
              </p>
              {duelError && <p className="text-sm text-[var(--bp-coral)] mt-3">{duelError}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={leaveDuel} disabled={duelBusy} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono disabled:opacity-40">
                  {duel.is_host ? "Cancel room" : "Leave"}
                </button>
              </div>
            </div>
          )}

          {duel && duel.status === "live" && (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-xl">Duel live — {duel.code}</h2>
                <span
                  className="ml-auto font-mono text-lg px-3 py-1 rounded border"
                  style={{
                    borderColor: duelLeft < 60 ? "var(--bp-coral)" : "var(--bp-cyan)",
                    color: duelLeft < 60 ? "var(--bp-coral)" : "var(--bp-cyan)",
                  }}
                >
                  ⏱ {formatTime(duelLeft)}
                </span>
              </div>
              <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-1">
                You vs {duel.opponent_name || "opponent"} · opponent answered {duel.opponent_answered}/{duel.questions.length}
                {duel.opponent_submitted ? " · opponent submitted ✓" : ""} · {duel.my_submitted ? "you submitted ✓" : "answer below, then submit"}
              </p>
              {duel.questions.map((q, index) => (
                <div key={q.id} className="mt-4 rounded border border-[var(--bp-border)] p-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{q.tag}</p>
                  <p className="text-sm font-medium mt-1">{index + 1}. {q.question}</p>
                  <div className="mt-3 space-y-2">
                    {q.options.map((option, optionIndex) => (
                      <label key={option} className="flex items-center gap-2 text-sm text-[var(--bp-text-dim)] cursor-pointer">
                        <input
                          type="radio"
                          name={`duel-${q.id}`}
                          checked={duel.my_answers[q.id] === optionIndex}
                          disabled={duel.my_submitted}
                          onChange={() => void answerDuelQuestion(q.id, optionIndex)}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {duelError && <p className="text-sm text-[var(--bp-coral)] mt-3">{duelError}</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={submitDuelAnswers}
                  disabled={duelBusy || duel.my_submitted}
                  className="px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-40"
                  style={{ background: "var(--bp-cyan)", color: "#081527" }}
                >
                  {duel.my_submitted ? "Submitted — waiting on opponent/timer" : duelBusy ? "Submitting…" : "Submit duel"}
                </button>
                <button onClick={leaveDuel} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono">
                  Leave
                </button>
              </div>
            </div>
          )}

          {duel && duel.status === "finished" && (
            <div>
              <h2 className="font-display text-xl">
                {duel.is_winner === null ? "Duel tied" : duel.is_winner ? `🏆 ${duel.winner_name || "You"} win!` : `⚔ ${duel.winner_name} wins`}
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {duel.host_result && (
                  <StatCard label={`${duel.host_name} (host)`} value={`${duel.host_result.correct}/${duel.host_result.answered}`} sub={`${formatTime(duel.host_result.elapsed_sec)} · +${duel.host_result.xp_earned} XP`} />
                )}
                {duel.guest_result && (
                  <StatCard label={`${duel.guest_name || "Guest"} (guest)`} value={`${duel.guest_result.correct}/${duel.guest_result.answered}`} sub={`${formatTime(duel.guest_result.elapsed_sec)} · +${duel.guest_result.xp_earned} XP`} />
                )}
              </div>
              {duel.results.length > 0 && (
                <div className="mt-5 space-y-3">
                  {duel.results.map((r) => (
                    <div key={r.id} className="rounded border border-[var(--bp-border)] p-4">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{r.tag}</p>
                      <p className="text-sm font-medium mt-1">{r.question}</p>
                      <p className={`mt-2 text-xs ${r.is_correct ? "text-[var(--bp-mint)]" : "text-[var(--bp-coral)]"}`}>
                        {!r.answered && "You skipped. "}
                        {r.answered && (r.is_correct ? "Correct. " : `You picked: ${r.options[r.your_option ?? 0]}. `)}
                        Correct answer: {r.options[r.correct_option]}.
                      </p>
                      <p className="text-xs text-[var(--bp-text-dim)] mt-1 leading-relaxed">{r.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={beginDuel}
                  disabled={duelBusy}
                  className="px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-40"
                  style={{ background: "var(--bp-cyan)", color: "#081527" }}
                >
                  Rematch (new room) →
                </button>
                <button onClick={leaveDuel} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono">
                  Back to lobby
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {(profileLoading || profileError || profile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeProfile}>
          <div className="bp-panel w-full max-w-lg p-5 sm:p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">Player profile</p>
                {profileLoading && <p className="text-xs font-mono text-[var(--bp-text-faint)] mt-2">Loading profile…</p>}
                {profileError && <p className="text-sm text-[var(--bp-coral)] mt-2">{profileError}</p>}
                {profile && (
                  <div className="flex items-center gap-3 mt-2">
                    {profile.picture && <img src={profile.picture} alt="" className="w-10 h-10 rounded-full border border-[var(--bp-border)]" />}
                    <div>
                      <h2 className="font-display text-xl leading-tight">{profile.name}</h2>
                      <p className="text-[11px] font-mono text-[var(--bp-text-dim)]">
                        LVL {profile.level}
                        {profile.rank !== null && ` · Global rank #${profile.rank}`}
                        {profile.is_me && <span className="ml-2 text-[var(--bp-cyan)]">YOU</span>}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={closeProfile} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono hover:border-[var(--bp-cyan)]">
                ✕
              </button>
            </div>

            {profile && (
              <>
                <div className="mt-3 h-2 rounded bg-[var(--bp-bg)] overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{ width: `${Math.min(100, Math.round((profile.xp_into_level / profile.xp_for_next_level) * 100))}%`, background: "var(--bp-cyan)" }}
                  />
                </div>
                <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-1.5">
                  {profile.xp_into_level} / {profile.xp_for_next_level} XP to level {profile.level + 1} · {profile.total_xp} total XP
                </p>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Streak" value={`🔥 ${profile.streak_count}`} sub={`Best ${profile.best_streak} day${profile.best_streak === 1 ? "" : "s"}`} />
                  <StatCard label="Total XP" value={String(profile.total_xp)} sub={`Level ${profile.level}`} />
                  <StatCard label="Contests" value={String(profile.contests_played)} sub="Timed events played" />
                  <StatCard label="Duels won" value={String(profile.duels_won)} sub="1v1 victories" />
                </div>
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">Recent activity</p>
                  {!profile.recent_activity.length && (
                    <p className="text-xs text-[var(--bp-text-dim)] mt-2">No scoring activity yet.</p>
                  )}
                  {profile.recent_activity.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {profile.recent_activity.map((a, i) => (
                        <li key={`${a.created_at}-${a.kind}-${i}`} className="flex items-baseline gap-2 text-xs">
                          <span className="font-mono text-[var(--bp-mint)]">+{a.points}</span>
                          <span className="text-[var(--bp-text-dim)]">{a.kind.replace(/_/g, " ")}</span>
                          <span className="ml-auto font-mono text-[10px] text-[var(--bp-text-faint)]">
                            {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
