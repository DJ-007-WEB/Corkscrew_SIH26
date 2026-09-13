import { useEffect, useMemo, useState } from "react";
import { getAssessmentDetail, getAssessmentHistory, getCurrentAssessment, startAdaptiveAssessment, submitAdaptiveAssessment } from "./api";
import type { AdaptiveAssessment, AssessmentQuestionResult } from "./types";

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

export default function AssessmentPage({ token }: { token?: string | null }) {
  const [current, setCurrent] = useState<AdaptiveAssessment | null>(null);
  const [history, setHistory] = useState<AdaptiveAssessment[]>([]);
  const [selectedPast, setSelectedPast] = useState<AdaptiveAssessment | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestCompleted = useMemo(() => history.find((item) => item.submitted) ?? null, [history]);
  const review = selectedPast ?? (current?.submitted ? current : latestCompleted);

  useEffect(() => {
    if (token) void load();
  }, [token]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [active, past] = await Promise.all([getCurrentAssessment(token), getAssessmentHistory(token)]);
      setCurrent(active);
      setAnswers(active?.selected_answers ?? {});
      setHistory(past.assessments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load assessments");
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSelectedPast(null);
    try {
      const assessment = await startAdaptiveAssessment(token);
      setCurrent(assessment);
      setAnswers({});
      const past = await getAssessmentHistory(token);
      setHistory(past.assessments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start assessment");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!token || !current) return;
    setLoading(true);
    setError(null);
    try {
      const graded = await submitAdaptiveAssessment(token, current.assessment_id, answers);
      setCurrent(graded);
      const past = await getAssessmentHistory(token);
      setHistory(past.assessments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit assessment");
    } finally {
      setLoading(false);
    }
  }

  async function openPast(assessmentId: string) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setSelectedPast(await getAssessmentDetail(token, assessmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open assessment");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return <div className="max-w-3xl"><p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Assessment</p><h1 className="font-display text-3xl mt-2">Sign in to start adaptive assessments</h1><p className="text-sm leading-7 text-[var(--bp-text-dim)] mt-3">Your BKT mastery and assessment history are saved to your student account.</p></div>;
  }

  const activeQuestions = current && !current.submitted ? current.questions : [];
  const canSubmit = activeQuestions.length === 7 && activeQuestions.every((question) => answers[question.id]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
      <section className="bp-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Assessment</p>
            <h1 className="font-display text-3xl mt-2">Adaptive assessment</h1>
            <p className="text-sm leading-7 text-[var(--bp-text-dim)] mt-3 max-w-3xl">Seven questions selected from your concept mastery, ability estimate, previous attempts, and recent mistakes.</p>
          </div>
          <button onClick={start} disabled={loading} className="ml-auto rounded bg-[var(--bp-cyan)] px-4 py-2 text-xs font-mono font-semibold text-[#081527] disabled:opacity-40">Start new</button>
        </div>
        {error && <p className="mt-4 rounded border border-[var(--bp-coral)]/50 bg-[var(--bp-coral)]/10 p-3 text-sm text-[var(--bp-coral)]">{error}</p>}
        {loading && <p className="mt-4 text-xs font-mono text-[var(--bp-text-faint)]">Loading assessment data...</p>}

        {activeQuestions.length > 0 ? <div className="mt-7 space-y-5">
          {activeQuestions.map((question, index) => <section key={question.id} className="rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">Question {index + 1} · {question.difficulty_level} · {question.primary_concept_id}</p>
            <p className="mt-2 text-sm font-medium leading-relaxed">{question.question}</p>
            <div className="mt-4 space-y-2">{OPTION_KEYS.map((key) => <label key={key} className={`flex cursor-pointer gap-3 rounded border px-3 py-2 text-sm ${answers[question.id] === key ? "border-[var(--bp-cyan)] bg-[var(--bp-cyan-dim)]" : "border-[var(--bp-border)] text-[var(--bp-text-dim)]"}`}>
              <input type="radio" name={question.id} checked={answers[question.id] === key} onChange={() => setAnswers({ ...answers, [question.id]: key })} />
              <span className="font-mono text-xs">{key}</span>
              <span>{question.options[key]}</span>
            </label>)}</div>
          </section>)}
          <button onClick={submit} disabled={!canSubmit || loading} className="rounded bg-[var(--bp-mint)] px-4 py-2 text-xs font-mono font-semibold text-[#081527] disabled:opacity-40">Submit assessment</button>
        </div> : <div className="mt-7 rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-5">
          <p className="text-sm text-[var(--bp-text-dim)]">{current?.submitted ? "Your latest assessment is graded below. Start another when you are ready." : "No active assessment is open."}</p>
        </div>}

        {review && <Review assessment={review} />}
      </section>

      <aside className="space-y-3">
        {review?.recommendation && <section className="bp-panel p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-amber)]">Recommended next</p>
          <h2 className="font-display text-lg mt-1">{review.recommendation.title}</h2>
          <p className="mt-2 text-xs leading-6 text-[var(--bp-text-dim)]">{review.recommendation.reason}</p>
          <p className="mt-3 text-[11px] font-mono text-[var(--bp-text-faint)]">{review.recommendation.module_id} · {review.recommendation.subtopic_id} · {review.recommendation.concept_id}</p>
        </section>}
        <section className="bp-panel p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Past attempts</p>
          <div className="mt-3 space-y-2">
            {history.length === 0 && <p className="text-xs text-[var(--bp-text-faint)]">No adaptive attempts yet.</p>}
            {history.map((item) => <button key={item.assessment_id} onClick={() => openPast(item.assessment_id)} className="w-full rounded border border-[var(--bp-border)] px-3 py-2 text-left hover:border-[var(--bp-cyan)]">
              <span className="block text-xs font-mono text-[var(--bp-text)]">{item.submitted ? `${item.score}/${item.total} · ${item.percentage.toFixed(0)}%` : "In progress"}</span>
              <span className="mt-1 block text-[11px] text-[var(--bp-text-faint)]">{new Date(item.created_at).toLocaleString()}</span>
            </button>)}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Review({ assessment }: { assessment: AdaptiveAssessment }) {
  return <section className="mt-8 border-t border-[var(--bp-border)] pt-6">
    <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-mint)]">Review</p>
    <h2 className="font-display text-2xl mt-2">Score {assessment.score}/{assessment.total} · {assessment.percentage.toFixed(1)}%</h2>
    <div className="mt-5 space-y-4">{assessment.results.map((result, index) => <QuestionReview key={result.id} result={result} index={index} />)}</div>
  </section>;
}

function QuestionReview({ result, index }: { result: AssessmentQuestionResult; index: number }) {
  return <section className="rounded border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">Question {index + 1} · {result.module_id} · {result.subtopic_id} · {result.primary_concept_id} · {result.difficulty_level}</p>
    <p className="mt-2 text-sm font-medium leading-relaxed">{result.question}</p>
    <div className="mt-3 space-y-2">{OPTION_KEYS.map((key) => {
      const correct = key === result.correct_answer;
      const selected = key === result.selected_answer;
      const style = correct ? "border-[var(--bp-mint)]/70 bg-[var(--bp-mint)]/10 text-[var(--bp-mint)]" : selected ? "border-[var(--bp-coral)]/70 bg-[var(--bp-coral)]/10 text-[var(--bp-coral)]" : "border-[var(--bp-border)] text-[var(--bp-text-dim)]";
      return <div key={key} className={`rounded border px-3 py-2 text-sm ${style}`}><span className="mr-2 font-mono text-xs">{key}</span>{result.options[key]}{correct && <span className="ml-2 text-xs">Correct</span>}{selected && !correct && <span className="ml-2 text-xs">Selected</span>}</div>;
    })}</div>
    <p className={`mt-3 text-xs font-mono ${result.is_correct ? "text-[var(--bp-mint)]" : "text-[var(--bp-coral)]"}`}>{result.is_correct ? "Correct" : "Incorrect"} · Selected {result.selected_answer || "none"} · Correct {result.correct_answer}</p>
    <p className="mt-2 text-sm leading-6 text-[var(--bp-text-dim)]">{result.explanation}</p>
  </section>;
}
