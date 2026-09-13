import { useEffect, useRef, useState } from "react";
import {
  createAssessment,
  deleteAssessment,
  getInstructorAssessment,
  listInstructorAssessments,
  parseAssessmentPdf,
  updateAssessment,
} from "./api";
import type { AssessmentQuestionIn, AssessmentSummary } from "./types";

function blankQuestion(): AssessmentQuestionIn {
  return { question: "", options: ["", "", "", ""], answer: 0, tag: "General", explanation: "" };
}

type View = { mode: "list" } | { mode: "create" } | { mode: "edit"; id: string };

export default function InstructorAssessments({ token }: { token: string }) {
  const [view, setView] = useState<View>({ mode: "list" });
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadList() {
    setListLoading(true);
    setListError(null);
    listInstructorAssessments(token)
      .then(setAssessments)
      .catch((err) => setListError(err instanceof Error ? err.message : "Could not load assessments"))
      .finally(() => setListLoading(false));
  }

  useEffect(() => {
    if (view.mode === "list") loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.mode]);

  async function togglePublished(a: AssessmentSummary) {
    setBusyId(a.id);
    try {
      await updateAssessment(token, a.id, { published: !a.published });
      loadList();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not update assessment");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: AssessmentSummary) {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    setBusyId(a.id);
    try {
      await deleteAssessment(token, a.id);
      loadList();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not delete assessment");
    } finally {
      setBusyId(null);
    }
  }

  if (view.mode === "create" || view.mode === "edit") {
    return (
      <AssessmentEditor
        token={token}
        assessmentId={view.mode === "edit" ? view.id : null}
        onDone={() => setView({ mode: "list" })}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Assessments</p>
          <p className="text-sm text-[var(--bp-text-dim)] mt-1">Published assessments appear immediately on students' Assessment page.</p>
        </div>
        <button onClick={() => setView({ mode: "create" })} className="px-4 py-2 rounded-md font-mono text-sm font-medium" style={{ background: "var(--bp-cyan)", color: "#081527" }}>
          + New assessment
        </button>
      </div>

      {listError && <p className="text-sm text-[var(--bp-coral)]">{listError}</p>}
      {listLoading && <p className="text-xs font-mono text-[var(--bp-text-faint)]">Loading…</p>}

      {!listLoading && assessments.length === 0 && !listError && (
        <div className="bp-panel p-6 text-center">
          <p className="text-sm text-[var(--bp-text-dim)]">No assessments yet. Create one to see it on students' Assessment page.</p>
        </div>
      )}

      <div className="space-y-2">
        {assessments.map((a) => (
          <div key={a.id} className="bp-panel p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[12rem]">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{a.title}</p>
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                  style={{ background: a.published ? "rgba(52,211,153,0.15)" : "var(--bp-border)", color: a.published ? "var(--bp-mint)" : "var(--bp-text-faint)" }}
                >
                  {a.published ? "Published" : "Draft"}
                </span>
              </div>
              {a.description && <p className="text-xs text-[var(--bp-text-faint)] mt-0.5">{a.description}</p>}
              <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-1">
                {a.question_count} question{a.question_count === 1 ? "" : "s"} · {a.attempts} attempt{a.attempts === 1 ? "" : "s"}
                {a.attempts > 0 && ` · avg ${a.average_percentage.toFixed(1)}%`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button disabled={busyId === a.id} onClick={() => setView({ mode: "edit", id: a.id })} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)]">
                Edit
              </button>
              <button disabled={busyId === a.id} onClick={() => togglePublished(a)} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)]">
                {a.published ? "Unpublish" : "Publish"}
              </button>
              <button disabled={busyId === a.id} onClick={() => remove(a)} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-coral)] hover:border-[var(--bp-coral)]">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssessmentEditor({
  token,
  assessmentId,
  onDone,
  onCancel,
}: {
  token: string;
  assessmentId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [published, setPublished] = useState(true);
  const [questions, setQuestions] = useState<AssessmentQuestionIn[]>([blankQuestion()]);
  const [loading, setLoading] = useState(!!assessmentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfWarnings, setPdfWarnings] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!assessmentId) return;
    getInstructorAssessment(token, assessmentId)
      .then((detail) => {
        setTitle(detail.title);
        setDescription(detail.description);
        setPublished(detail.published);
        setQuestions(detail.questions.map((q) => ({ question: q.question, options: q.options, answer: q.answer, tag: q.tag, explanation: q.explanation })));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load assessment"))
      .finally(() => setLoading(false));
  }, [assessmentId, token]);

  function updateQuestion(index: number, patch: Partial<AssessmentQuestionIn>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateOption(qIndex: number, oIndex: number, value: string) {
    setQuestions((qs) => qs.map((q, i) => (i === qIndex ? { ...q, options: q.options.map((o, j) => (j === oIndex ? value : o)) } : q)));
  }

  function addOption(qIndex: number) {
    setQuestions((qs) => qs.map((q, i) => (i === qIndex && q.options.length < 6 ? { ...q, options: [...q.options, ""] } : q)));
  }

  function removeOption(qIndex: number, oIndex: number) {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qIndex || q.options.length <= 2) return q;
        const options = q.options.filter((_, j) => j !== oIndex);
        const answer = q.answer >= options.length ? 0 : q.answer === oIndex ? 0 : q.answer > oIndex ? q.answer - 1 : q.answer;
        return { ...q, options, answer };
      }),
    );
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, blankQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions((qs) => (qs.length > 1 ? qs.filter((_, i) => i !== index) : qs));
  }

  async function handlePdfUpload(file: File) {
    setPdfBusy(true);
    setPdfWarnings([]);
    setError(null);
    try {
      const result = await parseAssessmentPdf(token, file);
      if (result.questions.length > 0) {
        setQuestions((qs) => (qs.length === 1 && !qs[0].question ? result.questions : [...qs, ...result.questions]));
      }
      setPdfWarnings(result.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse PDF");
    } finally {
      setPdfBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function validate(): string | null {
    if (!title.trim()) return "Give the assessment a title.";
    if (questions.length === 0) return "Add at least one question.";
    for (const q of questions) {
      if (!q.question.trim()) return "Every question needs its text filled in.";
      const filled = q.options.filter((o) => o.trim());
      if (filled.length < 2) return `"${q.question.slice(0, 40)}" needs at least 2 non-empty options.`;
      if (!q.options[q.answer]?.trim()) return `"${q.question.slice(0, 40)}" — the marked correct option is empty.`;
    }
    return null;
  }

  async function handleSave() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cleaned = questions.map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) }));
      if (assessmentId) {
        await updateAssessment(token, assessmentId, { title: title.trim(), description: description.trim(), questions: cleaned, published });
      } else {
        await createAssessment(token, title.trim(), description.trim(), cleaned, published);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assessment");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-xs font-mono text-[var(--bp-text-faint)]">Loading assessment…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{assessmentId ? "Edit assessment" : "New assessment"}</p>
        <button onClick={onCancel} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-text-dim)]">← Back to list</button>
      </div>

      <div className="bp-panel p-5 space-y-3">
        <label className="block text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className="mt-1.5 w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[var(--bp-cyan)]" placeholder="e.g. Week 3 Quiz — Entanglement" />
        </label>
        <label className="block text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
          Description (optional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} className="mt-1.5 w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[var(--bp-cyan)] resize-none" />
        </label>
        <label className="flex items-center gap-2 text-xs font-mono text-[var(--bp-text-dim)]">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Published — visible on students' Assessment page immediately
        </label>
      </div>

      <div className="bp-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Upload questions from a PDF</p>
          <button onClick={() => fileInput.current?.click()} disabled={pdfBusy} className="px-3 py-1.5 rounded border border-[var(--bp-border-strong)] text-[11px] font-mono text-[var(--bp-cyan)] hover:border-[var(--bp-cyan)] disabled:opacity-50">
            {pdfBusy ? "Parsing…" : "Choose PDF"}
          </button>
          <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handlePdfUpload(e.target.files[0])} />
        </div>
        <p className="text-[11px] text-[var(--bp-text-faint)] leading-relaxed">
          Expected format, one question per block: <span className="text-[var(--bp-text-dim)]">"1. Question text"</span> then{" "}
          <span className="text-[var(--bp-text-dim)]">"A) option"</span> lines and an{" "}
          <span className="text-[var(--bp-text-dim)]">"Answer: B"</span> line. Parsed questions are added below for you to review — nothing is published until you save.
        </p>
        {pdfWarnings.length > 0 && (
          <div className="mt-3 rounded border border-[var(--bp-border-strong)] p-3 space-y-1">
            {pdfWarnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-400 leading-relaxed">⚠ {w}</p>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q, qIndex) => (
          <div key={qIndex} className="bp-panel p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Question {qIndex + 1}</p>
              {questions.length > 1 && (
                <button onClick={() => removeQuestion(qIndex)} className="text-[11px] font-mono text-[var(--bp-coral)]">Remove</button>
              )}
            </div>
            <textarea
              value={q.question}
              onChange={(e) => updateQuestion(qIndex, { question: e.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="Question text"
              className="w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--bp-cyan)] resize-none"
            />
            <div className="flex flex-wrap gap-3 mt-3">
              <input value={q.tag} onChange={(e) => updateQuestion(qIndex, { tag: e.target.value })} maxLength={60} placeholder="Tag (e.g. Fundamentals)" className="flex-1 min-w-[10rem] bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-1.5 text-xs outline-none focus:border-[var(--bp-cyan)]" />
              <input value={q.explanation} onChange={(e) => updateQuestion(qIndex, { explanation: e.target.value })} maxLength={500} placeholder="Explanation shown after grading (optional)" className="flex-[2] min-w-[14rem] bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-1.5 text-xs outline-none focus:border-[var(--bp-cyan)]" />
            </div>
            <div className="mt-3 space-y-2">
              {q.options.map((option, oIndex) => (
                <div key={oIndex} className="flex items-center gap-2">
                  <input type="radio" name={`correct-${qIndex}`} checked={q.answer === oIndex} onChange={() => updateQuestion(qIndex, { answer: oIndex })} title="Mark as correct answer" />
                  <input value={option} onChange={(e) => updateOption(qIndex, oIndex, e.target.value)} maxLength={300} placeholder={`Option ${String.fromCharCode(65 + oIndex)}`} className="flex-1 bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-1.5 text-sm outline-none focus:border-[var(--bp-cyan)]" />
                  {q.options.length > 2 && (
                    <button onClick={() => removeOption(qIndex, oIndex)} className="text-[var(--bp-text-faint)] hover:text-[var(--bp-coral)] text-xs px-1">✕</button>
                  )}
                </div>
              ))}
              {q.options.length < 6 && (
                <button onClick={() => addOption(qIndex)} className="text-[11px] font-mono text-[var(--bp-cyan)]">+ Add option</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={addQuestion} className="px-4 py-2 rounded border border-[var(--bp-border-strong)] text-xs font-mono text-[var(--bp-cyan)] hover:border-[var(--bp-cyan)]">
        + Add question
      </button>

      {error && <p className="text-sm text-[var(--bp-coral)]">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-50" style={{ background: "var(--bp-cyan)", color: "#081527" }}>
          {saving ? "Saving…" : assessmentId ? "Save changes" : "Create assessment"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono">Cancel</button>
      </div>
    </div>
  );
}
