import { useMemo, useState } from "react";

type Lesson = {
  id: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string; formula?: string; example?: string }[];
};

const LESSONS: Lesson[] = [
  { id: "intro", title: "Introduction to Quantum Computing", summary: "What quantum computing is, what makes it different, and where qubits fit in.", sections: [
    { heading: "What is quantum computing?", body: "Quantum computing uses physical systems that obey quantum mechanics to represent information and perform transformations. A quantum computer is not simply a faster classical computer; it uses superposition, interference and entanglement as computational resources." },
    { heading: "Why learn quantum computing?", body: "The most important skill at this stage is learning to reason about quantum states and circuits. Once those foundations are clear, algorithms and quantum software become much easier to understand." },
  ] },
  { id: "qubits", title: "Bits, Qubits & Quantum States", summary: "Represent |0⟩, |1⟩ and arbitrary single-qubit states.", sections: [
    { heading: "Classical bit vs qubit", body: "A classical bit is either 0 or 1. A qubit has computational-basis states |0⟩ and |1⟩ and can also be in a normalized superposition of them." , formula: "|ψ⟩ = α|0⟩ + β|1⟩,   |α|² + |β|² = 1" },
    { heading: "Amplitudes and probabilities", body: "The complex numbers α and β are amplitudes. When measured in the computational basis, |α|² is the probability of obtaining 0 and |β|² is the probability of obtaining 1." },
    { heading: "Global phase", body: "Multiplying an entire state by the same phase factor does not change measurement probabilities. Relative phase, however, can affect interference." },
  ] },
  { id: "superposition", title: "Superposition & Interference", summary: "Understand what superposition means and why amplitudes can reinforce or cancel.", sections: [
    { heading: "Superposition", body: "A qubit can have non-zero amplitudes for both computational-basis states. This does not mean that a measurement returns both values at once; measurement produces a classical outcome according to the state's probabilities." , formula: "|+⟩ = (|0⟩ + |1⟩)/√2" },
    { heading: "Interference", body: "Quantum operations change amplitudes. Paths contributing to the same outcome can add constructively or destructively, changing the final measurement distribution." },
    { heading: "Try it", body: "Build |0⟩ → H in Circuit Builder, run the circuit, then inspect the probability timeline and Bloch sphere in Visualizations." },
  ] },
  { id: "measurement", title: "Measurement & Probability", summary: "Learn how quantum states become classical information.", sections: [
    { heading: "Computational-basis measurement", body: "For a state α|0⟩ + β|1⟩, measurement in the computational basis returns 0 with probability |α|² and 1 with probability |β|². The post-measurement state is the corresponding basis state." },
    { heading: "Shots", body: "A simulator or quantum device is normally sampled repeatedly. A histogram of many shots estimates the underlying probability distribution." },
    { heading: "Measurement is not just reading a hidden bit", body: "A superposition is a quantum state, not a classical probability distribution. Operations before measurement can change amplitudes and therefore the distribution of outcomes." },
  ] },
  { id: "gates", title: "Quantum Gates", summary: "Learn the core gates and how they transform qubits.", sections: [
    { heading: "X, Y and Z", body: "The Pauli gates are fundamental single-qubit operations. X swaps |0⟩ and |1⟩. Y also swaps them while introducing phase factors. Z leaves |0⟩ unchanged and changes the phase of |1⟩." , formula: "X = [[0,1],[1,0]]    Y = [[0,-i],[i,0]]    Z = [[1,0],[0,-1]]" },
    { heading: "Hadamard H", body: "H maps computational-basis states to equal superpositions and is one of the most useful gates for creating interference." , formula: "H = 1/√2 [[1,1],[1,-1]]" },
     { heading: "S and T (theory only)", body: "S and T are phase gates. They change relative phase without changing computational-basis probabilities immediately. Their phase changes can later become visible through interference. These gates are not yet buildable in Circuit Builder." },
     { heading: "Rotation gates (theory only)", body: "Rx(θ), Ry(θ) and Rz(θ) rotate a single-qubit state around the corresponding Bloch-sphere axes. The angle parameter controls the rotation. These gates are not yet buildable in Circuit Builder." },
  ] },
  { id: "circuits", title: "How to Read Quantum Circuits", summary: "Understand wires, gate order, controls, targets and circuit depth.", sections: [
    { heading: "Wires and registers", body: "Each horizontal wire represents a qubit. A collection of wires is a quantum register. Gates are applied in circuit order, conventionally from left to right." },
    { heading: "Gate order matters", body: "Quantum gates generally do not commute. Applying H then Z can produce a different state from applying Z then H, so always follow the circuit from its input toward measurement." },
    { heading: "Circuit depth", body: "Circuit depth counts layers of operations that must be executed sequentially. Independent gates on different qubits can often occupy the same layer." },
    { heading: "Try it", body: "Open Circuit Builder, place a few gates on different qubits, run the circuit, then use the visualization step controls to inspect the state after each gate." },
  ] },
  { id: "multiqubit", title: "Multiple Qubits & Tensor Products", summary: "Move from single-qubit states to multi-qubit registers.", sections: [
    { heading: "Two-qubit states", body: "Two qubits have four computational-basis states: |00⟩, |01⟩, |10⟩ and |11⟩. A general state has four complex amplitudes whose squared magnitudes sum to one." , formula: "|ψ⟩ = α₀₀|00⟩ + α₀₁|01⟩ + α₁₀|10⟩ + α₁₁|11⟩" },
    { heading: "Tensor product", body: "Independent states combine with the tensor product. This is why the state-space dimension grows exponentially with the number of qubits." },
    { heading: "Entanglement", body: "Some multi-qubit states cannot be written as a tensor product of individual single-qubit states. Such states are entangled and exhibit correlations that cannot be reproduced by assigning independent pure states to each qubit." },
  ] },
  { id: "controlled", title: "CNOT & Controlled Gates", summary: "Understand the most important two-qubit gate and how entanglement is created.", sections: [
    { heading: "CNOT", body: "A controlled-NOT has a control qubit and target qubit. If the control is |1⟩, X is applied to the target; if the control is |0⟩, the target is unchanged." },
    { heading: "Creating a Bell state", body: "Starting from |00⟩, apply H to the first qubit and CNOT with that qubit as control. The result is an entangled Bell state." , formula: "|00⟩ → H(q₀) → CNOT(q₀,q₁) → (|00⟩ + |11⟩)/√2" },
    { heading: "Why it matters", body: "Controlled gates are building blocks for entanglement, conditional logic and many quantum algorithms." },
  ] },
  { id: "bloch", title: "How to Read the Bloch Sphere", summary: "Use a 3D picture to understand every pure single-qubit state.", sections: [
    { heading: "The geometry", body: "The Bloch sphere represents a single-qubit pure state as a point on the unit sphere. |0⟩ is at the north pole and |1⟩ at the south pole. Equatorial points represent equal-magnitude superpositions with different relative phases." },
    { heading: "Coordinates", body: "A common parameterization is |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩. θ controls latitude and φ controls the azimuthal angle." , formula: "|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩" },
    { heading: "Reading measurement probabilities", body: "The Z coordinate determines computational-basis bias: P(0) = cos²(θ/2) and P(1) = sin²(θ/2). The azimuth encodes relative phase." },
    { heading: "Important limitation", body: "The Bloch sphere is a complete visualization for a single qubit. It cannot by itself represent an arbitrary multi-qubit state." },
  ] },
  { id: "qsphere", title: "How to Read the Q-Sphere", summary: "Interpret basis states, amplitudes, probability and phase for multi-qubit states.", sections: [
    { heading: "Basis states", body: "Each point corresponds to a computational-basis state such as |00⟩ or |101⟩. The collection of points represents the basis components of the simulated statevector." },
    { heading: "Probability", body: "The magnitude of an amplitude determines its probability. A basis state with a larger amplitude magnitude contributes more strongly to measurement outcomes." },
    { heading: "Phase", body: "The complex phase of an amplitude is important even when it does not change the probability of an immediate measurement. Relative phases can change later through interference." },
    { heading: "Use it with the timeline", body: "Select different simulation steps to see how gates move amplitude and phase between basis states." },
  ] },
  { id: "unitary", title: "Matrices, Unitaries & Reversibility", summary: "Understand the mathematical model behind quantum gates.", sections: [
    { heading: "Quantum gates as matrices", body: "A quantum gate is represented by a unitary matrix U. Applying a gate multiplies the statevector by U." , formula: "|ψ'⟩ = U|ψ⟩,   U†U = I" },
    { heading: "Why unitary?", body: "Unitary transformations preserve vector norm, so total probability remains one. They are reversible: U† is the inverse operation." },
    { heading: "Composition", body: "A circuit is a sequence of transformations. Matrix multiplication represents that composition, with the rightmost operation acting first when states are written as column vectors." },
  ] },
  { id: "algorithms", title: "Quantum Algorithms: The Big Picture", summary: "See how the fundamentals become useful algorithms.", sections: [
     { heading: "Deutsch-Jozsa (theory roadmap)", body: "Uses quantum interference and an oracle to distinguish a promised class of Boolean functions with fewer queries than a deterministic classical strategy. This lesson is theory only and is not yet buildable in Circuit Builder." },
     { heading: "Grover search (theory roadmap)", body: "Uses amplitude amplification to increase the probability of marked states, providing a quadratic query improvement for unstructured search. This lesson is theory only and is not yet buildable in Circuit Builder." },
     { heading: "Quantum Fourier Transform (theory roadmap)", body: "Transforms amplitudes between computational and phase-like descriptions and is a core component of phase-estimation-based algorithms. This lesson is theory only and is not yet buildable in Circuit Builder." },
     { heading: "Teleportation (theory roadmap)", body: "Uses shared entanglement, local operations and classical communication to transfer an unknown quantum state without physically sending the original qubit. This lesson is theory only and is not yet buildable in Circuit Builder." },
  ] },
  { id: "noise", title: "Noise, Decoherence & NISQ", summary: "Understand why real quantum hardware behaves differently from an ideal simulator.", sections: [
    { heading: "Noise", body: "Physical qubits interact with their environment and hardware imperfections. Gate errors, readout errors and unwanted interactions can change results." },
    { heading: "Decoherence", body: "Quantum information can lose useful coherence through environmental interactions. This limits how long and how accurately quantum states can be maintained." },
    { heading: "NISQ", body: "Noisy intermediate-scale quantum devices have useful quantum processors but limited error correction. Near-term algorithms therefore have to account for hardware constraints." },
  ] },
  { id: "qiskit", title: "Getting Started with Qiskit", summary: "Connect the theory to programmable quantum circuits.", sections: [
    { heading: "QuantumCircuit", body: "Qiskit represents circuits with QuantumCircuit objects. Gates are appended to qubits in circuit order and measurements can be added to produce classical results." },
    { heading: "Simulation", body: "A simulator can calculate statevectors or sample measurement outcomes without requiring quantum hardware. Corkscrew uses Qiskit Aer for its circuit execution backend." },
    { heading: "Your workflow", body: "Learn → build a circuit → run it → inspect probabilities/statevector → inspect Bloch sphere or Q-sphere → change a gate → compare the result." },
  ] },
];

export default function LearningPage({ onOpenBuilder, onOpenVisualizations }: { onOpenBuilder: () => void; onOpenVisualizations: () => void }) {
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const lesson = LESSONS[selected];
  const filtered = useMemo(() => LESSONS.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
      <aside className="bp-panel p-4 lg:sticky lg:top-5 lg:self-start max-h-[calc(100vh-120px)] overflow-auto bp-scrollbar">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Course</p>
        <h2 className="font-display text-lg mt-1">Quantum Fundamentals</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lessons..." className="mt-4 w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-xs outline-none focus:border-[var(--bp-cyan)]" />
        <div className="mt-4 space-y-1">
          {filtered.map((item) => {
            const index = LESSONS.indexOf(item);
            return <button key={item.id} onClick={() => setSelected(index)} className={`w-full text-left rounded px-3 py-2.5 text-xs transition-colors ${selected === index ? "bg-[var(--bp-cyan-dim)] text-[var(--bp-cyan)] border border-[var(--bp-cyan)]/40" : "text-[var(--bp-text-dim)] hover:text-[var(--bp-text)] hover:bg-[var(--bp-panel-raised)]"}`}><span className="font-mono mr-2">{String(index + 1).padStart(2, "0")}</span>{item.title}</button>;
          })}
        </div>
      </aside>

      <article className="min-w-0">
        <section className="bp-panel p-6 sm:p-8">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Lesson {String(selected + 1).padStart(2, "0")} / {LESSONS.length}</p>
          <h1 className="font-display text-3xl sm:text-4xl mt-2">{lesson.title}</h1>
          <p className="text-sm text-[var(--bp-text-dim)] mt-3 max-w-3xl leading-relaxed">{lesson.summary}</p>

          <div className="mt-8 space-y-7">
            {lesson.sections.map((section) => <section key={section.heading}>
              <h2 className="font-display text-xl">{section.heading}</h2>
              <p className="text-sm text-[var(--bp-text-dim)] leading-7 mt-2">{section.body}</p>
              {section.formula && <pre className="mt-3 overflow-auto rounded border border-[var(--bp-border)] bg-[var(--bp-ink)] p-4 text-xs font-mono text-[var(--bp-cyan)]">{section.formula}</pre>}
              {section.example && <div className="mt-3 rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4 text-xs font-mono">{section.example}</div>}
            </section>)}
          </div>

          {(lesson.id === "superposition" || lesson.id === "circuits" || lesson.id === "qiskit") && <div className="mt-8 flex flex-wrap gap-2"><button onClick={onOpenBuilder} className="px-4 py-2 rounded bg-[var(--bp-cyan)] text-[#081527] text-xs font-mono font-semibold">Open Circuit Builder →</button><button onClick={onOpenVisualizations} className="px-4 py-2 rounded border border-[var(--bp-border-strong)] text-xs font-mono hover:border-[var(--bp-cyan)]">Open Visualizations</button></div>}

          <div className="mt-10 pt-5 border-t border-[var(--bp-border)] flex justify-between gap-3"><button disabled={selected === 0} onClick={() => setSelected(selected - 1)} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono disabled:opacity-30">← Previous</button><button disabled={selected === LESSONS.length - 1} onClick={() => setSelected(selected + 1)} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono disabled:opacity-30">Next →</button></div>
        </section>
      </article>
    </div>
  );
}
