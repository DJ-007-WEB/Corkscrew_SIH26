import { useState } from "react";
import { submitAssessment } from "./api";

const QUESTIONS = [
  { tag: "Fundamentals", question: "Which gate creates an equal superposition from |0⟩?", options: ["X", "H", "Z", "CNOT"], answer: 1, explanation: "The Hadamard gate maps |0⟩ to (|0⟩ + |1⟩)/√2." },
  { tag: "Fundamentals", question: "What does a CNOT do when its control is |1⟩?", options: ["Measures the target", "Applies X to the target", "Applies Z to the control", "Does nothing"], answer: 1, explanation: "CNOT conditionally applies an X gate to its target when the control is |1⟩." },
  { tag: "Fundamentals", question: "What determines the probability of a basis-state measurement?", options: ["Amplitude magnitude squared", "Circuit title", "Gate color", "Qubit label"], answer: 0, explanation: "The Born rule says a basis state's probability is the squared magnitude of its amplitude." },
  { tag: "Fundamentals", question: "Which backend runs Corkscrew's circuit simulations tonight?", options: ["PennyLane", "Cirq", "Qiskit Aer", "qBraid"], answer: 2, explanation: "This round uses Qiskit Aer only; other backends are roadmap items." },
  { tag: "Bell State", question: "Measuring both qubits of (|00⟩ + |11⟩)/√2 can give…", options: ["00 or 11 only", "01 or 10 only", "Any of 00/01/10/11 equally", "Always 00"], answer: 0, explanation: "Bell correlation: only 00 (P=0.5) or 11 (P=0.5); cross outcomes have zero probability." },
  { tag: "Bell State", question: "Which circuit builds |Φ+⟩ from |00⟩?", options: ["H(q0) then CNOT(q0→q1)", "CNOT then H(q0)", "X(q0) then X(q1)", "Z(q0) only"], answer: 0, explanation: "Hadamard creates superposition on q0, CNOT entangles it onto q1." },
  { tag: "Deutsch-Jozsa", question: "A balanced oracle on n=1 leaves the input qubit…", options: ["|0⟩ always", "|1⟩ always", "Random each shot", "Unchanged |+⟩"], answer: 1, explanation: "Interference kills the |0⟩ amplitude for balanced functions; constant functions give |0⟩." },
  { tag: "Deutsch-Jozsa", question: "How many queries does DJ need vs deterministic classical (worst case)?", options: ["1 vs up to 2ⁿ⁻¹+1", "N vs 1", "Equal", "0 vs N"], answer: 0, explanation: "One quantum query decides constant vs balanced under the promise; classical may need half the inputs plus one." },
  { tag: "Grover", question: "One Grover round on 2 qubits targeting |11⟩ gives…", options: ["P(11) = 1.0", "Uniform 0.25 each", "P(00) = 1.0", "P(11) = 0.5"], answer: 0, explanation: "A single oracle+diffusion rotation fully amplifies the marked state for N=4." },
  { tag: "Grover", question: "Two rounds on the same 2-qubit target give…", options: ["Overshoot back toward uniform", "P = 1.0 still", "Always |00⟩", "An error"], answer: 0, explanation: "Grover rotations overshoot past the target — more iterations are not always better." },
  { tag: "Teleportation", question: "Teleportation of |ψ⟩ requires…", options: ["A Bell pair + 2 classical bits", "3 classical bits only", "Cloning q[0]", "FTL signalling"], answer: 0, explanation: "Shared entanglement plus 2 classical bits; the original is destroyed, nothing is cloned, nothing travels FTL." },
  { tag: "Teleportation", question: "Alice's two bits alone reveal…", options: ["Nothing about |ψ⟩", "The full state", "One amplitude", "The phase only"], answer: 0, explanation: "Each of 00/01/10/11 occurs with 0.25 regardless of payload; Bob's corrections recover it." },
];

export default function AssessmentPage({ token }: { token?: string | null }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const score = QUESTIONS.reduce((total, item, index) => total + (answers[index] === item.answer ? 1 : 0), 0);

  async function handleSubmit() {
    setSubmitted(true);
    if (!token) return;
    setSaveState("saving");
    try {
      await submitAssessment(token, score, QUESTIONS.length);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Assessment engine v0</p>
        <h1 className="font-display text-3xl mt-2">Quantum Fundamentals Check</h1>
        <p className="text-sm text-[var(--bp-text-dim)] mt-2">
          A practice assessment covering fundamentals plus the Bell, Deutsch-Jozsa, Grover, and Teleportation modules.
          {token ? " Your score is saved to your learner profile for your instructor's dashboard." : " Log in to have your score saved to your learner profile."}
        </p>
      </div>

      {QUESTIONS.map((item, index) => (
        <section key={item.question} className="bp-panel p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{item.tag}</p>
          <p className="text-sm font-medium mt-1">
            {index + 1}. {item.question}
          </p>
          <div className="mt-4 space-y-2">
            {item.options.map((option, optionIndex) => (
              <label key={option} className="flex items-center gap-2 text-sm text-[var(--bp-text-dim)]">
                <input
                  type="radio"
                  name={`question-${index}`}
                  checked={answers[index] === optionIndex}
                  onChange={() => setAnswers({ ...answers, [index]: optionIndex })}
                />
                {option}
              </label>
            ))}
          </div>
          {submitted && (
            <p className={`mt-4 text-xs leading-relaxed ${answers[index] === item.answer ? "text-[var(--bp-mint)]" : "text-[var(--bp-coral)]"}`}>
              {answers[index] === item.answer ? "Correct. " : `Correct answer: ${item.options[item.answer]}. `}
              {item.explanation}
            </p>
          )}
        </section>
      ))}

      <button onClick={handleSubmit} className="px-5 py-2 rounded-md font-mono text-sm font-medium" style={{ background: "var(--bp-cyan)", color: "#081527" }}>
        Submit assessment
      </button>

      {submitted && (
        <p className="text-sm font-mono text-[var(--bp-text)]">
          Score: {score} / {QUESTIONS.length}
          {token && saveState === "saving" && " · Saving…"}
          {token && saveState === "saved" && " · Saved to your profile"}
          {token && saveState === "error" && " · Could not save (backend/DB may be unavailable)"}
        </p>
      )}

      <p className="text-xs text-[var(--bp-text-faint)]">
        Contest and leaderboard feature updates are under Contests; timed practice assessments are local and safe to retry.
      </p>
    </div>
  );
}
