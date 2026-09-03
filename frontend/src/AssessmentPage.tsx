import { useState } from "react";

const QUESTIONS = [
  { question: "Which gate creates an equal superposition from |0⟩?", options: ["X", "H", "Z", "CNOT"], answer: 1, explanation: "The Hadamard gate maps |0⟩ to (|0⟩ + |1⟩)/√2." },
  { question: "What does a CNOT do when its control is |1⟩?", options: ["Measures the target", "Applies X to the target", "Applies Z to the control", "Does nothing"], answer: 1, explanation: "CNOT conditionally applies an X gate to its target when the control is |1⟩." },
  { question: "What determines the probability of a basis-state measurement?", options: ["Amplitude magnitude squared", "Circuit title", "Gate color", "Qubit label"], answer: 0, explanation: "The Born rule says a basis state's probability is the squared magnitude of its amplitude." },
  { question: "Which backend runs Corkscrew's circuit simulations tonight?", options: ["PennyLane", "Cirq", "Qiskit Aer", "qBraid"], answer: 2, explanation: "This round uses Qiskit Aer only; other backends are roadmap items." },
];

export default function AssessmentPage() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  return <div className="max-w-3xl space-y-5"><div><p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Assessment engine v0</p><h1 className="font-display text-3xl mt-2">Quantum Fundamentals Check</h1><p className="text-sm text-[var(--bp-text-dim)] mt-2">A stateless practice assessment. Results are not saved.</p></div>{QUESTIONS.map((item, index) => <section key={item.question} className="bp-panel p-5"><p className="text-sm font-medium">{index + 1}. {item.question}</p><div className="mt-4 space-y-2">{item.options.map((option, optionIndex) => <label key={option} className="flex items-center gap-2 text-sm text-[var(--bp-text-dim)]"><input type="radio" name={`question-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers({ ...answers, [index]: optionIndex })} />{option}</label>)}</div>{submitted && <p className={`mt-4 text-xs leading-relaxed ${answers[index] === item.answer ? "text-[var(--bp-mint)]" : "text-[var(--bp-coral)]"}`}>{answers[index] === item.answer ? "Correct. " : `Correct answer: ${item.options[item.answer]}. `}{item.explanation}</p>}</section>)}<button onClick={() => setSubmitted(true)} className="px-5 py-2 rounded-md font-mono text-sm font-medium" style={{ background: "var(--bp-cyan)", color: "#081527" }}>Submit assessment</button><p className="text-xs text-[var(--bp-text-faint)]">Contest and leaderboard features are roadmap items, not part of assessment engine v0.</p></div>;
}
