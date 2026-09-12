import { useMemo, useState } from "react";
import { submitAssessment } from "./api";
import ModuleRoadmap from "./ModuleRoadmap";
import { learningModules } from "./moduleData";

type AssessmentQuestion = { id: string; tag: string; question: string; options: string[]; answer: number; explanation?: string };
type AssessmentSet = { id: string; label: string; description: string; questions: AssessmentQuestion[] };

const FUNDAMENTALS: AssessmentQuestion[] = [
  { id: "fundamentals-h", tag: "Fundamentals", question: "Which gate creates an equal superposition from |0⟩?", options: ["X", "H", "Z", "CNOT"], answer: 1, explanation: "The Hadamard gate maps |0⟩ to (|0⟩ + |1⟩)/√2." },
  { id: "fundamentals-cnot", tag: "Fundamentals", question: "What does a CNOT do when its control is |1⟩?", options: ["Measures the target", "Applies X to the target", "Applies Z to the control", "Does nothing"], answer: 1, explanation: "CNOT conditionally applies an X gate to its target when the control is |1⟩." },
  { id: "fundamentals-born", tag: "Fundamentals", question: "What determines the probability of a basis-state measurement?", options: ["Amplitude magnitude squared", "Circuit title", "Gate color", "Qubit label"], answer: 0, explanation: "The Born rule says a basis state's probability is the squared magnitude of its amplitude." },
  { id: "fundamentals-aer", tag: "Fundamentals", question: "Which backend runs the circuit simulations?", options: ["PennyLane", "Cirq", "Qiskit Aer", "qBraid"], answer: 2, explanation: "Qiskit Aer powers the current circuit simulations." },
  { id: "fundamentals-bell", tag: "Bell State", question: "Measuring both qubits of (|00⟩ + |11⟩)/√2 can give…", options: ["00 or 11 only", "01 or 10 only", "Any of 00/01/10/11 equally", "Always 00"], answer: 0, explanation: "A Bell state gives correlated outcomes: 00 and 11 each have probability 0.5." },
];

const MODULE_ASSESSMENTS: AssessmentSet[] = learningModules.flatMap((module) => [
  ...module.topics.map((topic) => ({ id: `${module.id}-${topic.id}`, label: `${topic.id} · ${topic.title}`, description: `5-question subtopic quiz from ${module.title}.`, questions: topic.questions.map((question) => ({ ...question, tag: `${topic.id} · ${topic.title}` })) })),
  { id: `${module.id}-final`, label: `${module.title} · Final assessment`, description: `10-question cumulative assessment for ${module.title}.`, questions: module.finalQuestions.map((question) => ({ ...question, tag: `${module.title} · Final` })) },
]);

const ASSESSMENTS: AssessmentSet[] = [{ id: "fundamentals", label: "Quantum Fundamentals Check", description: "A short practice assessment covering core circuit concepts.", questions: FUNDAMENTALS }, ...MODULE_ASSESSMENTS];

export default function AssessmentPage({ token }: { token?: string | null }) {
  const [assessmentId, setAssessmentId] = useState(ASSESSMENTS[0].id);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(learningModules[0].id);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const assessment = useMemo(() => ASSESSMENTS.find((item) => item.id === assessmentId) ?? ASSESSMENTS[0], [assessmentId]);
  const score = assessment.questions.filter((item, index) => answers[index] === item.answer).length;

  function chooseAssessment(id: string) {
    setAssessmentId(id);
    setAnswers({});
    setSubmitted(false);
    setSaveState("idle");
  }

  async function submit() {
    setSubmitted(true);
    if (!token) return;
    setSaveState("saving");
    try {
      await submitAssessment(token, score, assessment.questions.length);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
      <main className="min-w-0 space-y-5">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Assessment engine</p>
          <h1 className="font-display text-3xl mt-2">Practice assessments</h1>
          <p className="text-sm text-[var(--bp-text-dim)] mt-2">Choose a 5-question subtopic quiz or a 10-question module assessment. {token ? "Your score is saved to your learner profile." : "Log in to have your score saved to your learner profile."}</p>
        </div>
        <section className="bp-panel p-5">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{assessment.questions.length} questions</p>
          <h2 className="font-display text-xl mt-1">{assessment.label}</h2>
          <p className="text-sm text-[var(--bp-text-dim)] mt-2">{assessment.description}</p>
        </section>
        {assessment.questions.map((item, index) => (
          <section key={item.id} className="bp-panel p-5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{item.tag}</p>
            <p className="text-sm font-medium mt-1">{index + 1}. {item.question}</p>
            <div className="mt-4 space-y-2">{item.options.map((option, optionIndex) => <label key={option} className="flex items-center gap-2 text-sm text-[var(--bp-text-dim)] cursor-pointer"><input type="radio" name={`${assessment.id}-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers({ ...answers, [index]: optionIndex })} />{option}</label>)}</div>
            {submitted && <p className={`mt-4 text-xs leading-relaxed ${answers[index] === item.answer ? "text-[var(--bp-mint)]" : "text-[var(--bp-coral)]"}`}>{answers[index] === item.answer ? "Correct. " : `Correct answer: ${item.options[item.answer]}. `}{item.explanation ?? "Review the corresponding lesson section before trying again."}</p>}
          </section>
        ))}
        <button onClick={submit} className="px-5 py-2 rounded-md font-mono text-sm font-medium" style={{ background: "var(--bp-cyan)", color: "#081527" }}>Submit assessment</button>
        {submitted && <p className="text-sm font-mono text-[var(--bp-text)]">Score: {score} / {assessment.questions.length}{token && saveState === "saving" && " · Saving…"}{token && saveState === "saved" && " · Saved to your profile"}{token && saveState === "error" && " · Could not save (backend/DB may be unavailable)"}</p>}
        <p className="text-xs text-[var(--bp-text-faint)]">Contest and leaderboard feature updates are under Contests; timed practice assessments are local and safe to retry.</p>
      </main>
      <ModuleRoadmap modules={learningModules} expandedModuleId={expandedModuleId} selectedTopicId={assessmentId.endsWith("-final") ? undefined : assessmentId} onExpandModule={setExpandedModuleId} onSelectTopic={(module, topicId) => { setExpandedModuleId(module.id); chooseAssessment(`${module.id}-${topicId}`); }} onSelectFinal={(module) => { setExpandedModuleId(module.id); chooseAssessment(`${module.id}-final`); }} />
    </div>
  );
}
