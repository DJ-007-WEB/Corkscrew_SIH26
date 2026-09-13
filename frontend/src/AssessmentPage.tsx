import { useEffect, useState } from "react";

import {
  getAssessmentDetail,
  getAssessmentHistory,
  getCurrentAssessment,
  startAdaptiveAssessment,
  submitAdaptiveAssessment,
  getStudentAssessment,
  listStudentAssessments,
  submitAssessment,
  submitStudentAssessment,
} from "./api";

import type {
  AdaptiveAssessment,
  AssessmentQuestionResult,
  AssessmentAttemptResult,
  AssessmentStudentDetail,
  AssessmentSummary,
} from "./types";

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

/* -------------------------------------------------------------------------- */
/* Legacy / built-in practice quiz                                           */
/* -------------------------------------------------------------------------- */

const LEGACY_QUESTIONS = [
  {
    tag: "Fundamentals",
    question: "Which gate creates an equal superposition from |0⟩?",
    options: ["X", "H", "Z", "CNOT"],
    answer: 1,
    explanation:
      "The Hadamard gate maps |0⟩ to (|0⟩ + |1⟩)/√2.",
  },
  {
    tag: "Fundamentals",
    question: "What does a CNOT do when its control is |1⟩?",
    options: [
      "Measures the target",
      "Applies X to the target",
      "Applies Z to the control",
      "Does nothing",
    ],
    answer: 1,
    explanation:
      "CNOT conditionally applies an X gate to its target when the control is |1⟩.",
  },
  {
    tag: "Fundamentals",
    question:
      "What determines the probability of a basis-state measurement?",
    options: [
      "Amplitude magnitude squared",
      "Circuit title",
      "Gate color",
      "Qubit label",
    ],
    answer: 0,
    explanation:
      "The Born rule says a basis state's probability is the squared magnitude of its amplitude.",
  },
  {
    tag: "Fundamentals",
    question: "Which backend runs Corkscrew's circuit simulations tonight?",
    options: ["PennyLane", "Cirq", "Qiskit Aer", "qBraid"],
    answer: 2,
    explanation:
      "This round uses Qiskit Aer only; other backends are roadmap items.",
  },
  {
    tag: "Bell State",
    question:
      "Measuring both qubits of (|00⟩ + |11⟩)/√2 can give…",
    options: [
      "00 or 11 only",
      "01 or 10 only",
      "Any of 00/01/10/11 equally",
      "Always 00",
    ],
    answer: 0,
    explanation:
      "Bell correlation: only 00 (P=0.5) or 11 (P=0.5); cross outcomes have zero probability.",
  },
  {
    tag: "Bell State",
    question: "Which circuit builds |Φ+⟩ from |00⟩?",
    options: [
      "H(q0) then CNOT(q0→q1)",
      "CNOT then H(q0)",
      "X(q0) then X(q1)",
      "Z(q0) only",
    ],
    answer: 0,
    explanation:
      "Hadamard creates superposition on q0, CNOT entangles it onto q1.",
  },
  {
    tag: "Deutsch-Jozsa",
    question: "A balanced oracle on n=1 leaves the input qubit…",
    options: [
      "|0⟩ always",
      "|1⟩ always",
      "Random each shot",
      "Unchanged |+⟩",
    ],
    answer: 1,
    explanation:
      "Interference kills the |0⟩ amplitude for balanced functions; constant functions give |0⟩.",
  },
  {
    tag: "Deutsch-Jozsa",
    question:
      "How many queries does DJ need vs deterministic classical (worst case)?",
    options: [
      "1 vs up to 2ⁿ⁻¹+1",
      "N vs 1",
      "Equal",
      "0 vs N",
    ],
    answer: 0,
    explanation:
      "One quantum query decides constant vs balanced under the promise; classical may need half the inputs plus one.",
  },
  {
    tag: "Grover",
    question: "One Grover round on 2 qubits targeting |11⟩ gives…",
    options: [
      "P(11) = 1.0",
      "Uniform 0.25 each",
      "P(00) = 1.0",
      "P(11) = 0.5",
    ],
    answer: 0,
    explanation:
      "A single oracle+diffusion rotation fully amplifies the marked state for N=4.",
  },
  {
    tag: "Grover",
    question: "Two rounds on the same 2-qubit target give…",
    options: [
      "Overshoot back toward uniform",
      "P = 1.0 still",
      "Always |00⟩",
      "An error",
    ],
    answer: 0,
    explanation:
      "Grover rotations overshoot past the target — more iterations are not always better.",
  },
  {
    tag: "Teleportation",
    question: "Teleportation of |ψ⟩ requires…",
    options: [
      "A Bell pair + 2 classical bits",
      "3 classical bits only",
      "Cloning q[0]",
      "FTL signalling",
    ],
    answer: 0,
    explanation:
      "Shared entanglement plus 2 classical bits; the original is destroyed, nothing is cloned, nothing travels FTL.",
  },
  {
    tag: "Teleportation",
    question: "Alice's two bits alone reveal…",
    options: [
      "Nothing about |ψ⟩",
      "The full state",
      "One amplitude",
      "The phase only",
    ],
    answer: 0,
    explanation:
      "Each of 00/01/10/11 occurs with 0.25 regardless of payload; Bob's corrections recover it.",
  },
];

function LegacyQuiz({ token }: { token: string | null }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const score = LEGACY_QUESTIONS.reduce(
    (total, item, index) =>
      total + (answers[index] === item.answer ? 1 : 0),
    0
  );

  async function handleSubmit() {
    setSubmitted(true);

    if (!token) return;

    setSaveState("saving");

    try {
      await submitAssessment(
        token,
        score,
        LEGACY_QUESTIONS.length
      );
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="space-y-5">
      <div className="bp-panel p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-amber)]">
          Practice quiz
        </p>

        <p className="text-sm text-[var(--bp-text-dim)] mt-2 leading-7">
          No instructor-published assessments are available yet, so you can
          use this built-in practice quiz covering fundamentals, Bell states,
          Deutsch-Jozsa, Grover, and Teleportation.
          {token
            ? " Your score is saved to your learner profile."
            : " Log in to have your score saved."}
        </p>
      </div>

      {LEGACY_QUESTIONS.map((item, index) => (
        <section key={item.question} className="bp-panel p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
            {item.tag}
          </p>

          <p className="text-sm font-medium mt-1">
            {index + 1}. {item.question}
          </p>

          <div className="mt-4 space-y-2">
            {item.options.map((option, optionIndex) => (
              <label
                key={option}
                className="flex items-center gap-2 text-sm text-[var(--bp-text-dim)]"
              >
                <input
                  type="radio"
                  name={`legacy-${index}`}
                  checked={answers[index] === optionIndex}
                  disabled={submitted}
                  onChange={() =>
                    setAnswers({
                      ...answers,
                      [index]: optionIndex,
                    })
                  }
                />
                {option}
              </label>
            ))}
          </div>

          {submitted && (
            <p
              className={`mt-4 text-xs leading-relaxed ${
                answers[index] === item.answer
                  ? "text-[var(--bp-mint)]"
                  : "text-[var(--bp-coral)]"
              }`}
            >
              {answers[index] === item.answer
                ? "Correct. "
                : `Correct answer: ${item.options[item.answer]}. `}
              {item.explanation}
            </p>
          )}
        </section>
      ))}

      {!submitted && (
        <button
          onClick={handleSubmit}
          className="px-5 py-2 rounded-md font-mono text-sm font-medium"
          style={{
            background: "var(--bp-cyan)",
            color: "#081527",
          }}
        >
          Submit practice quiz
        </button>
      )}

      {submitted && (
        <div className="bp-panel p-4">
          <p className="text-sm font-mono text-[var(--bp-text)]">
            Score: {score} / {LEGACY_QUESTIONS.length}
          </p>

          {token && (
            <p className="mt-1 text-xs text-[var(--bp-text-faint)]">
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved to your profile"}
              {saveState === "error" &&
                "Could not save. Backend/DB may be unavailable."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Instructor-published assessment                                            */
/* -------------------------------------------------------------------------- */

function TakeAssessment({
  token,
  id,
  onBack,
}: {
  token: string | null;
  id: string;
  onBack: () => void;
}) {
  const [detail, setDetail] =
    useState<AssessmentStudentDetail | null>(null);

  const [answers, setAnswers] =
    useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] =
    useState<AssessmentAttemptResult | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setResult(null);
    setAnswers({});

    getStudentAssessment(id)
      .then(setDetail)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Could not load assessment"
        )
      )
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      setResult(
        await submitStudentAssessment(token, id, answers)
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not submit assessment"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p className="text-xs font-mono text-[var(--bp-text-faint)]">
        Loading assessment…
      </p>
    );
  }

  if (error && !detail) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-text-dim)]"
        >
          ← Back to assessments
        </button>

        <p className="text-sm text-[var(--bp-coral)]">
          {error}
        </p>
      </div>
    );
  }

  if (!detail) return null;

  const allAnswered =
    detail.questions.length > 0 &&
    detail.questions.every(
      (question) => answers[question.id] !== undefined
    );

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)]"
      >
        ← Back to assessments
      </button>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
          Instructor assessment
        </p>

        <h1 className="font-display text-3xl mt-2">
          {detail.title}
        </h1>

        {detail.description && (
          <p className="text-sm text-[var(--bp-text-dim)] mt-2 leading-7">
            {detail.description}
          </p>
        )}

        {!token && (
          <p className="text-xs text-[var(--bp-text-faint)] mt-2">
            You're not logged in — you'll still be graded, but
            your score won't be saved.
          </p>
        )}
      </div>

      {detail.questions.map((question, index) => {
        const graded = result?.results.find(
          (item) => item.id === question.id
        );

        return (
          <section key={question.id} className="bp-panel p-5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
              {question.tag}
            </p>

            <p className="text-sm font-medium mt-1 leading-relaxed">
              {index + 1}. {question.question}
            </p>

            <div className="mt-4 space-y-2">
              {question.options.map((option, optionIndex) => (
                <label
                  key={option}
                  className={`flex items-center gap-3 rounded border px-3 py-2 text-sm transition-colors ${
                    answers[question.id] === optionIndex
                      ? "border-[var(--bp-cyan)] bg-[var(--bp-cyan-dim)]"
                      : "border-[var(--bp-border)] text-[var(--bp-text-dim)]"
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    disabled={!!result}
                    checked={
                      answers[question.id] === optionIndex
                    }
                    onChange={() =>
                      setAnswers({
                        ...answers,
                        [question.id]: optionIndex,
                      })
                    }
                  />

                  <span className="font-mono text-xs">
                    {String.fromCharCode(65 + optionIndex)}
                  </span>

                  {option}
                </label>
              ))}
            </div>

            {graded && (
              <div
                className={`mt-4 rounded border p-3 ${
                  graded.is_correct
                    ? "border-[var(--bp-mint)]/40 bg-[var(--bp-mint)]/5"
                    : "border-[var(--bp-coral)]/40 bg-[var(--bp-coral)]/5"
                }`}
              >
                <p
                  className={`text-xs font-mono ${
                    graded.is_correct
                      ? "text-[var(--bp-mint)]"
                      : "text-[var(--bp-coral)]"
                  }`}
                >
                  {graded.is_correct
                    ? "Correct"
                    : `Incorrect · Correct answer: ${
                        graded.options[graded.correct_option]
                      }`}
                </p>

                <p className="mt-2 text-xs leading-6 text-[var(--bp-text-dim)]">
                  {graded.explanation}
                </p>
              </div>
            )}
          </section>
        );
      })}

      {error && (
        <p className="text-sm text-[var(--bp-coral)]">
          {error}
        </p>
      )}

      {!result && (
        <button
          onClick={handleSubmit}
          disabled={submitting || !allAnswered}
          className="px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-40"
          style={{
            background: "var(--bp-cyan)",
            color: "#081527",
          }}
        >
          {submitting
            ? "Submitting…"
            : allAnswered
              ? "Submit assessment"
              : "Answer all questions"}
        </button>
      )}

      {result && (
        <div className="bp-panel p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-mint)]">
            Assessment complete
          </p>

          <p className="text-2xl font-display mt-2">
            {result.score} / {result.total}
          </p>

          <p className="mt-1 text-sm text-[var(--bp-text-dim)]">
            {result.percentage.toFixed(1)}%
            {result.saved
              ? " · Saved to your profile"
              : " · Not saved"}
          </p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Adaptive assessment                                                        */
/* -------------------------------------------------------------------------- */

function AdaptiveAssessmentPage({
  token,
}: {
  token: string | null;
}) {
  const [current, setCurrent] =
    useState<AdaptiveAssessment | null>(null);

  const [history, setHistory] =
    useState<AdaptiveAssessment[]>([]);

  const [selectedPast, setSelectedPast] =
    useState<AdaptiveAssessment | null>(null);

  const [answers, setAnswers] =
    useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review =
    selectedPast ??
    (current?.submitted ? current : null);

  useEffect(() => {
    if (token) {
      void load();
    }
  }, [token]);

  async function load() {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const [active, past] = await Promise.all([
        getCurrentAssessment(token),
        getAssessmentHistory(token),
      ]);

      setCurrent(active);
      setAnswers(active?.selected_answers ?? {});
      setHistory(past.assessments);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load adaptive assessments"
      );
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
      const assessment =
        await startAdaptiveAssessment(token);

      setCurrent(assessment);
      setAnswers({});

      const past =
        await getAssessmentHistory(token);

      setHistory(past.assessments);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start adaptive assessment"
      );
    } finally {
      setLoading(false);
    }
  }

  function returnToCurrent() {
    setSelectedPast(null);
  }

  async function submit() {
    if (!token || !current) return;

    setLoading(true);
    setError(null);

    try {
      const graded =
        await submitAdaptiveAssessment(
          token,
          current.assessment_id,
          answers
        );

      setCurrent(graded);

      const past =
        await getAssessmentHistory(token);

      setHistory(past.assessments);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not submit adaptive assessment"
      );
    } finally {
      setLoading(false);
    }
  }

  async function openPast(assessmentId: string) {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      setSelectedPast(
        await getAssessmentDetail(
          token,
          assessmentId
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not open assessment"
      );
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="bp-panel p-5">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
          Adaptive assessment
        </p>

        <h2 className="font-display text-xl mt-2">
          Sign in to start adaptive assessments
        </h2>

        <p className="text-sm leading-7 text-[var(--bp-text-dim)] mt-3">
          Your BKT mastery, ability estimate, and adaptive
          assessment history are saved to your student account.
        </p>
      </div>
    );
  }

  const activeQuestions =
    !selectedPast &&
    current &&
    !current.submitted
      ? current.questions
      : [];

  const canSubmit =
    activeQuestions.length === 7 &&
    activeQuestions.every(
      (question) => answers[question.id]
    );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
      <section className="bp-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
              Adaptive engine
            </p>

            <h2 className="font-display text-3xl mt-2">
              Adaptive assessment
            </h2>

            <p className="text-sm leading-7 text-[var(--bp-text-dim)] mt-3 max-w-3xl">
              Seven questions are selected from your concept
              mastery, ability estimate, previous attempts,
              and recent mistakes.
            </p>
          </div>

          <button
            onClick={start}
            disabled={loading}
            className="ml-auto rounded bg-[var(--bp-cyan)] px-4 py-2 text-xs font-mono font-semibold text-[#081527] disabled:opacity-40"
          >
            Start new
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded border border-[var(--bp-coral)]/50 bg-[var(--bp-coral)]/10 p-3 text-sm text-[var(--bp-coral)]">
            {error}
          </p>
        )}

        {loading && (
          <p className="mt-4 text-xs font-mono text-[var(--bp-text-faint)]">
            Loading assessment data...
          </p>
        )}

        {selectedPast && (
          <button
            onClick={returnToCurrent}
            className="mt-5 rounded border border-[var(--bp-border)] px-3 py-2 text-xs font-mono hover:border-[var(--bp-cyan)]"
          >
            Back to current assessment
          </button>
        )}

        {activeQuestions.length > 0 ? (
          <div className="mt-7 space-y-5">
            {activeQuestions.map((question, index) => (
              <section
                key={question.id}
                className="rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4"
              >
                <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">
                  Question {index + 1}
                </p>

                <p className="mt-2 text-sm font-medium leading-relaxed">
                  {question.question}
                </p>

                <div className="mt-4 space-y-2">
                  {OPTION_KEYS.map((key) => (
                    <label
                      key={key}
                      className={`flex cursor-pointer gap-3 rounded border px-3 py-2 text-sm ${
                        answers[question.id] === key
                          ? "border-[var(--bp-cyan)] bg-[var(--bp-cyan-dim)]"
                          : "border-[var(--bp-border)] text-[var(--bp-text-dim)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={
                          answers[question.id] === key
                        }
                        onChange={() =>
                          setAnswers({
                            ...answers,
                            [question.id]: key,
                          })
                        }
                      />

                      <span className="font-mono text-xs">
                        {key}
                      </span>

                      <span>
                        {question.options[key]}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <button
              onClick={submit}
              disabled={!canSubmit || loading}
              className="rounded bg-[var(--bp-mint)] px-4 py-2 text-xs font-mono font-semibold text-[#081527] disabled:opacity-40"
            >
              Submit adaptive assessment
            </button>
          </div>
        ) : (
          !review && (
            <div className="mt-7 rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-5">
              <p className="text-sm text-[var(--bp-text-dim)]">
                {current?.submitted
                  ? "Your current adaptive assessment is graded. Start another when you are ready, or open a past attempt from the right."
                  : "No active adaptive assessment is open. Start one when you are ready."}
              </p>
            </div>
          )
        )}

        {review && (
          <Review
            assessment={review}
            analysisCollapsed={Boolean(selectedPast)}
          />
        )}
      </section>

      <aside className="space-y-3">
        {review?.recommendation && (
          <section className="bp-panel p-4">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-amber)]">
              Recommended next
            </p>

            <h3 className="font-display text-lg mt-1">
              {review.recommendation.title}
            </h3>

            <p className="mt-2 text-xs leading-6 text-[var(--bp-text-dim)]">
              {review.recommendation.reason}
            </p>

            <p className="mt-3 text-[11px] font-mono text-[var(--bp-text-faint)]">
              {review.recommendation.module_id} ·{" "}
              {review.recommendation.subtopic_id} ·{" "}
              {review.recommendation.concept_id}
            </p>
          </section>
        )}

        <section className="bp-panel p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
            Past adaptive attempts
          </p>

          <div className="mt-3 space-y-2">
            {history.length === 0 && (
              <p className="text-xs text-[var(--bp-text-faint)]">
                No adaptive attempts yet.
              </p>
            )}

            {history.map((item) => (
              <button
                key={item.assessment_id}
                onClick={() =>
                  openPast(item.assessment_id)
                }
                className="w-full rounded border border-[var(--bp-border)] px-3 py-2 text-left hover:border-[var(--bp-cyan)]"
              >
                <span className="block text-xs font-mono text-[var(--bp-text)]">
                  {item.submitted
                    ? `${item.score}/${item.total} · ${item.percentage.toFixed(
                        0
                      )}%`
                    : "In progress"}
                </span>

                <span className="mt-1 block text-[11px] text-[var(--bp-text-faint)]">
                  {new Date(
                    item.created_at
                  ).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Adaptive review                                                            */
/* -------------------------------------------------------------------------- */

function Review({
  assessment,
  analysisCollapsed,
}: {
  assessment: AdaptiveAssessment;
  analysisCollapsed: boolean;
}) {
  return (
    <section className="mt-8 border-t border-[var(--bp-border)] pt-6">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-mint)]">
        Adaptive review
      </p>

      <h3 className="font-display text-2xl mt-2">
        Score {assessment.score}/{assessment.total} ·{" "}
        {assessment.percentage.toFixed(1)}%
      </h3>

      {analysisCollapsed ? (
        <details className="mt-5 rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4">
          <summary className="cursor-pointer text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
            Quiz analysis
          </summary>

          <QuizAnalysis
            assessment={assessment}
            embedded
          />
        </details>
      ) : (
        <QuizAnalysis assessment={assessment} />
      )}

      <div className="mt-5 space-y-4">
        {assessment.results.map(
          (result, index) => (
            <QuestionReview
              key={result.id}
              result={result}
              index={index}
            />
          )
        )}
      </div>
    </section>
  );
}

function QuizAnalysis({
  assessment,
  embedded = false,
}: {
  assessment: AdaptiveAssessment;
  embedded?: boolean;
}) {
  const bySubtopic = new Map<
    string,
    AssessmentQuestionResult[]
  >();

  assessment.results.forEach((result) => {
    bySubtopic.set(result.subtopic_id, [
      ...(bySubtopic.get(result.subtopic_id) ?? []),
      result,
    ]);
  });

  const subtopics = [...bySubtopic.entries()].map(
    ([subtopicId, results]) => {
      const correct = results.filter(
        (result) => result.is_correct
      ).length;

      const masteryValues = results
        .map(
          (result) =>
            assessment.bkt_after[
              result.primary_concept_id
            ]
        )
        .filter(
          (value): value is number =>
            typeof value === "number"
        );

      const mastery = masteryValues.length
        ? masteryValues.reduce(
            (sum, value) => sum + value,
            0
          ) / masteryValues.length
        : 0.35;

      return {
        subtopicId,
        correct,
        total: results.length,
        mastery,
        concepts: [
          ...new Set(
            results.map(
              (result) =>
                result.primary_concept_id
            )
          ),
        ],
      };
    }
  );

  const weak = subtopics.filter(
    (item) =>
      item.correct < item.total ||
      item.mastery < 0.6
  );

  const strong = subtopics.filter(
    (item) =>
      item.correct === item.total &&
      item.mastery >= 0.6
  );

  const failed = assessment.results.filter(
    (result) => !result.is_correct
  ).length;

  return (
    <div
      className={
        embedded
          ? "mt-4"
          : "mt-5 rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4"
      }
    >
      {!embedded && (
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
          Quiz analysis
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Progress"
          value={`${assessment.score}/${assessment.total}`}
        />

        <Metric
          label="Failed"
          value={String(failed)}
        />

        <Metric
          label="Ability"
          value={(
            assessment.irt_ability_after ??
            assessment.irt_ability_before
          ).toFixed(2)}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <AnalysisList
          title="Strong topics"
          items={
            strong.length
              ? strong
              : subtopics.filter(
                  (item) =>
                    item.correct === item.total
                )
          }
        />

        <AnalysisList
          title="Weak topics"
          items={weak}
        />
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">
          Subtopic mastery in this quiz
        </p>

        {subtopics.map((item) => (
          <div
            key={item.subtopicId}
            className="rounded border border-[var(--bp-border)] px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3 text-xs font-mono">
              <span>{item.subtopicId}</span>
              <span>
                {Math.round(
                  item.mastery * 100
                )}
                %
              </span>
            </div>

            <div className="mt-2 h-2 rounded bg-[var(--bp-ink)]">
              <div
                className="h-2 rounded bg-[var(--bp-cyan)]"
                style={{
                  width: `${Math.max(
                    4,
                    Math.round(
                      item.mastery * 100
                    )
                  )}%`,
                }}
              />
            </div>

            <p className="mt-2 text-[11px] text-[var(--bp-text-faint)]">
              {item.correct}/{item.total} correct ·{" "}
              {item.concepts.join(", ")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-[var(--bp-border)] bg-[var(--bp-ink)] p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">
        {label}
      </p>

      <p className="mt-1 font-display text-xl">
        {value}
      </p>
    </div>
  );
}

function AnalysisList({
  title,
  items,
}: {
  title: string;
  items: {
    subtopicId: string;
    correct: number;
    total: number;
    mastery: number;
    concepts: string[];
  }[];
}) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">
        {title}
      </p>

      <div className="mt-2 space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-[var(--bp-text-faint)]">
            No topics in this group yet.
          </p>
        )}

        {items.map((item) => (
          <div
            key={`${title}-${item.subtopicId}`}
            className="rounded border border-[var(--bp-border)] px-3 py-2 text-xs text-[var(--bp-text-dim)]"
          >
            <span className="font-mono text-[var(--bp-text)]">
              {item.subtopicId}
            </span>{" "}
            · {item.correct}/{item.total} correct ·
            mastery{" "}
            {Math.round(item.mastery * 100)}%
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionReview({
  result,
  index,
}: {
  result: AssessmentQuestionResult;
  index: number;
}) {
  return (
    <section className="rounded border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">
        Question {index + 1} · {result.module_id} ·{" "}
        {result.subtopic_id} ·{" "}
        {result.primary_concept_id} ·{" "}
        {result.difficulty_level}
      </p>

      <p className="mt-2 text-sm font-medium leading-relaxed">
        {result.question}
      </p>

      <div className="mt-3 space-y-2">
        {OPTION_KEYS.map((key) => {
          const correct =
            key === result.correct_answer;

          const selected =
            key === result.selected_answer;

          const style = correct
            ? "border-[var(--bp-mint)]/70 bg-[var(--bp-mint)]/10 text-[var(--bp-mint)]"
            : selected
              ? "border-[var(--bp-coral)]/70 bg-[var(--bp-coral)]/10 text-[var(--bp-coral)]"
              : "border-[var(--bp-border)] text-[var(--bp-text-dim)]";

          return (
            <div
              key={key}
              className={`rounded border px-3 py-2 text-sm ${style}`}
            >
              <span className="mr-2 font-mono text-xs">
                {key}
              </span>

              {result.options[key]}

              {correct && (
                <span className="ml-2 text-xs">
                  Correct
                </span>
              )}

              {selected && !correct && (
                <span className="ml-2 text-xs">
                  Selected
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p
        className={`mt-3 text-xs font-mono ${
          result.is_correct
            ? "text-[var(--bp-mint)]"
            : "text-[var(--bp-coral)]"
        }`}
      >
        {result.is_correct
          ? "Correct"
          : "Incorrect"}{" "}
        · Selected{" "}
        {result.selected_answer || "none"} · Correct{" "}
        {result.correct_answer}
      </p>

      <p className="mt-2 text-sm leading-6 text-[var(--bp-text-dim)]">
        {result.correct_answer_explanation ??
          result.explanation}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Main assessment page                                                       */
/* -------------------------------------------------------------------------- */

export default function AssessmentPage({
  token,
}: {
  token: string | null;
}) {
  const [assessments, setAssessments] =
    useState<AssessmentSummary[] | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [activeId, setActiveId] =
    useState<string | null>(null);

  const [showAdaptive, setShowAdaptive] =
    useState(false);

  useEffect(() => {
    listStudentAssessments()
      .then(setAssessments)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Could not load assessments"
        )
      );
  }, []);

  /* Instructor assessment currently selected */
  if (activeId) {
    return (
      <TakeAssessment
        token={token}
        id={activeId}
        onBack={() => setActiveId(null)}
      />
    );
  }

  /* Adaptive assessment currently selected */
  if (showAdaptive) {
    return (
      <div className="space-y-5">
        <button
          onClick={() => setShowAdaptive(false)}
          className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)]"
        >
          ← Back to assessments
        </button>

        <AdaptiveAssessmentPage token={token} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
          Assessment engine
        </p>

        <h1 className="font-display text-3xl mt-2">
          Assessments
        </h1>

        <p className="text-sm leading-7 text-[var(--bp-text-dim)] mt-3 max-w-3xl">
          Test your quantum computing knowledge through
          instructor-published assessments or take an adaptive
          assessment that adjusts to your current mastery.
        </p>
      </div>

      {error && (
        <p className="text-sm text-[var(--bp-coral)]">
          {error}
        </p>
      )}

      {/* Adaptive assessment */}
      <section className="bp-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[240px]">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-amber)]">
              AI-powered
            </p>

            <h2 className="font-display text-xl mt-1">
              Adaptive assessment
            </h2>

            <p className="text-sm leading-6 text-[var(--bp-text-dim)] mt-2">
              Seven questions selected using your concept
              mastery, ability estimate, previous attempts,
              and recent mistakes. Your results update your
              learning profile.
            </p>
          </div>

          <button
            onClick={() => setShowAdaptive(true)}
            className="rounded bg-[var(--bp-cyan)] px-4 py-2 text-xs font-mono font-semibold text-[#081527]"
          >
            Open adaptive assessment →
          </button>
        </div>
      </section>

      {/* Instructor assessments */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">
              Instructor assessments
            </p>

            <h2 className="font-display text-2xl mt-1">
              Published assessments
            </h2>
          </div>
        </div>

        <p className="text-xs text-[var(--bp-text-faint)] mt-2">
          Assessments created and published by your
          instructor appear here.
        </p>
      </section>

      {assessments === null && !error && (
        <p className="text-xs font-mono text-[var(--bp-text-faint)]">
          Loading assessments…
        </p>
      )}

      {assessments &&
        assessments.length > 0 && (
          <div className="space-y-2">
            {assessments.map((assessment) => (
              <button
                key={assessment.id}
                onClick={() =>
                  setActiveId(assessment.id)
                }
                className="bp-panel p-4 w-full text-left flex items-center gap-3 hover:border-[var(--bp-cyan)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {assessment.title}
                  </p>

                  {assessment.description && (
                    <p className="text-xs text-[var(--bp-text-faint)] mt-0.5">
                      {assessment.description}
                    </p>
                  )}

                  <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-1">
                    {assessment.question_count} question
                    {assessment.question_count === 1
                      ? ""
                      : "s"}
                  </p>
                </div>

                <span className="text-xs font-mono text-[var(--bp-cyan)] shrink-0">
                  Take →
                </span>
              </button>
            ))}
          </div>
        )}

      {/* No instructor assessments → legacy practice */}
      {assessments &&
        assessments.length === 0 &&
        !error && (
          <LegacyQuiz token={token} />
        )}

      {/* Learning quiz reminder */}
      <div className="rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">
          Tip
        </p>

        <p className="text-xs text-[var(--bp-text-dim)] mt-1 leading-6">
          Looking for lesson-by-lesson quizzes? Each
          Learning subtopic can have its own short quiz.
          Head to the Learning section to practice a
          specific concept.
        </p>
      </div>
    </div>
  );
}