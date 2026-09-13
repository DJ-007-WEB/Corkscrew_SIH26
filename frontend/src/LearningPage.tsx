import { useEffect, useState } from "react";
import type { Circuit } from "./types";
import YouTubeVideo from "./YouTubeVideo";
import { fetchBellPreset, fetchDjPreset, fetchGroverPreset, fetchTeleportPreset } from "./presets";
import type { BellVariant, DjOracle, TeleportPayload } from "./presets";
import ModuleRoadmap from "./ModuleRoadmap";
import { learningModules } from "./moduleData";
import LessonQuiz from "./LessonQuiz";

const SELECT_CLASS = "bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--bp-cyan)]";

type Lesson = {
  id: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string; formula?: string; example?: string }[];
  moduleTitle?: string;
};

const PRESETS: Record<string, Circuit> = {
  "bell-state": { qubits: 2, gates: [{ type: "H", targets: [0] }, { type: "CNOT", controls: [0], targets: [1] }] },
  "deutsch-jozsa": { qubits: 2, gates: [{ type: "X", targets: [1] }, { type: "H", targets: [1] }, { type: "H", targets: [0] }, { type: "H", targets: [1] }, { type: "CNOT", controls: [0], targets: [1] }, { type: "Z", targets: [1] }, { type: "H", targets: [0] }, { type: "H", targets: [1] }] },
  "grover": { qubits: 2, gates: [{ type: "H", targets: [0] }, { type: "H", targets: [1] }, { type: "H", targets: [1] }, { type: "CNOT", controls: [0], targets: [1] }, { type: "H", targets: [1] }, { type: "H", targets: [0] }, { type: "H", targets: [1] }, { type: "X", targets: [0] }, { type: "X", targets: [1] }, { type: "H", targets: [1] }, { type: "CNOT", controls: [0], targets: [1] }, { type: "H", targets: [1] }, { type: "X", targets: [0] }, { type: "X", targets: [1] }, { type: "H", targets: [0] }, { type: "H", targets: [1] }] },
  "teleportation": { qubits: 3, gates: [{ type: "H", targets: [0] }, { type: "H", targets: [1] }, { type: "CNOT", controls: [1], targets: [2] }, { type: "CNOT", controls: [0], targets: [1] }, { type: "H", targets: [0] }] },
  "superposition": { qubits: 1, gates: [{ type: "H", targets: [0] }] },
  "gates": { qubits: 1, gates: [{ type: "H", targets: [0] }, { type: "S", targets: [0] }, { type: "T", targets: [0] }, { type: "RX", targets: [0], params: [Math.PI / 2] }, { type: "RZ", targets: [0], params: [Math.PI / 4] }] },
  "circuits": { qubits: 2, gates: [{ type: "H", targets: [0] }, { type: "CNOT", controls: [0], targets: [1] }] },
};

const BASE_LESSONS: Lesson[] = [
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
  { id: "gates", title: "Quantum Gates", summary: "Learn the core gates and how they transform qubits. Every gate below works in Circuit Builder — load the demo and run it.", sections: [
    { heading: "X, Y and Z", body: "The Pauli gates are fundamental single-qubit operations. X swaps |0⟩ and |1⟩. Y also swaps them while introducing phase factors. Z leaves |0⟩ unchanged and changes the phase of |1⟩." , formula: "X = [[0,1],[1,0]]    Y = [[0,-i],[i,0]]    Z = [[1,0],[0,-1]]" },
    { heading: "Hadamard H", body: "H maps computational-basis states to equal superpositions and is one of the most useful gates for creating interference." , formula: "H = 1/√2 [[1,1],[1,-1]]" },
    { heading: "S gate — quarter-turn phase (√Z)", body: "S leaves |0⟩ unchanged and multiplies |1⟩ by i (a +90° rotation about the Z axis of the Bloch sphere). It is called √Z because applying S twice equals Z. On its own it does not change computational-basis probabilities, but it changes relative phase, which becomes visible after interference — compare H → H against H → S → H.", formula: "S = [[1,0],[0,i]]    S·S = Z    S|+⟩ = (|0⟩ + i|1⟩)/√2" },
    { heading: "T gate — eighth-turn phase (√S)", body: "T leaves |0⟩ unchanged and multiplies |1⟩ by e^{iπ/4} (a +45° rotation about the Z axis). Applying T twice equals S. T plus H plus CNOT is enough for universal quantum computation, which is why T matters for real algorithms even though its effect needs interference to be seen.", formula: "T = [[1,0],[0,e^{iπ/4}]]    T·T = S" },
    { heading: "Rotation gates Rx(θ), Ry(θ), Rz(θ)", body: "Rx, Ry and Rz rotate a single-qubit state by the angle θ (in radians) around the X, Y or Z axis of the Bloch sphere. In Circuit Builder you type the angle when you drop the gate — try π/2 (1.5708) and π (3.1416) first. Useful identities: Rx(π) acts like X (up to global phase), Ry(π/2) maps |0⟩ to an equal superposition, and Rz(θ) is a continuous version of the S/T phase idea.", formula: "Rx(θ) = [[cos(θ/2), -i·sin(θ/2)],[-i·sin(θ/2), cos(θ/2)]]    Rz(θ) = [[e^{-iθ/2},0],[0,e^{iθ/2}]]" },
    { heading: "Try it yourself", body: "Load the combined demo circuit: H puts the qubit in superposition, S and T add phase, then RX(π/2) and RZ(π/4) rotate the state. Run it, then open Visualizations to watch the Bloch vector and probabilities move at each step. Remove or change one gate and re-run to see what it contributed.", example: "Demo: |0⟩ → H → S → T → RX(π/2) → RZ(π/4) → Measure" },
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
  { id: "bell-state", title: "Bell State", summary: "Create and measure the most famous entangled state in quantum computing. This module guides you through building the Bell state, running the simulation, and understanding the resulting entanglement.", sections: [
    { heading: "What is a Bell state?", body: "A Bell state is a maximally entangled quantum state of two qubits. The state (|00⟩ + |11⟩)/√2 means that measuring one qubit instantly determines the state of the other, regardless of distance. This is the simplest example of quantum entanglement.", formula: "(|00⟩ + |11⟩)/√2" },
    { heading: "Circuit to create a Bell state", body: "To create the Bell state |Φ⁺⟩ = (|00⟩ + |11⟩)/√2: 1. Apply a Hadamard gate (H) to the first qubit (q[0]), putting it in superposition. 2. Apply a CNOT gate with q[0] as control and q[1] as target. The Hadamard creates superposition, and the CNOT entangles the qubits.", formula: "H(q[0]); CNOT(q[0] → q[1])" },
    { heading: "Measurement outcomes", body: "When you measure both qubits of a Bell state, you will always get correlated results: either both 0 (|00⟩) or both 1 (|11⟩). You will never get opposite outcomes (|01⟩ or |10⟩). This correlation is the hallmark of entanglement.", formula: "P(00) = 1/2, P(11) = 1/2, P(01) = 0, P(10) = 0" },
    { heading: "Try it yourself", body: "Open the Circuit Builder below, which already has the Bell state circuit pre-loaded. Click 'Run' to simulate, then explore the Bloch sphere, Q-Sphere, and Probability Timeline visualizations.", example: "Circuit: q[0] → H → CNOT(q[0] → q[1]); q[1] → Measure" },
    { heading: "Expected outcome", body: "For |Φ+⟩ expect P(00) = 0.5 and P(11) = 0.5 with P(01) = P(10) = 0. The |Ψ⟩ variants instead give P(01) = P(10) = 0.5. If you see all four outcomes, the qubits are not maximally entangled — check the CNOT control/target order." },
    { heading: "Common misconception", body: "Entanglement does not send messages faster than light. Measuring q[0] tells you q[1] instantly only because the pair shares one joint state; no controllable signal travels, and the outcome itself is random." },
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
     { heading: "Deutsch-Jozsa", body: "Uses quantum interference and an oracle to distinguish constant vs balanced Boolean functions with one query. Open the dedicated Deutsch-Jozsa lesson to run the buildable circuit in Circuit Builder." },
     { heading: "Grover search", body: "Uses amplitude amplification to increase the probability of marked states, providing a quadratic query improvement for unstructured search. Open the dedicated Grover lesson to run the buildable circuit in Circuit Builder." },
     { heading: "Quantum Fourier Transform (theory roadmap)", body: "Transforms amplitudes between computational and phase-like descriptions and is a core component of phase-estimation-based algorithms. This topic is theory only for now." },
     { heading: "Teleportation", body: "Uses shared entanglement, local operations and classical communication to transfer an unknown quantum state without physically sending the original qubit. Open the dedicated Teleportation lesson to run the buildable circuit in Circuit Builder." },
   ] },
  { id: "deutsch-jozsa", title: "Deutsch-Jozsa Algorithm", summary: "Determine if a function is constant or balanced using only one quantum query, versus potentially many classical queries.", sections: [
    { heading: "What problem does it solve?", body: "The Deutsch-Jozsa algorithm determines whether a given Boolean function f(x) (where x ∈ {0,1}ⁿ) is constant (all outputs same) or balanced (half 0s, half 1s). Quantumly, this can be done with ONE query; classically may require up to 2ⁿ⁻¹+1 queries.", formula: "f: {0,1}ⁿ → {0,1}   (constant vs balanced)" },
    { heading: "How the algorithm works", body: "1. Start with |0⟩ⁿ → Apply Hⁿ to all qubits → Create superposition 2. Apply the oracle U_f that maps |x⟩|b⟩ → |x⟩|b ⊕ f(x)⟩ 3. Apply Hⁿ to the first register 4. Measure all qubits - if all 0, function is constant; otherwise balanced", formula: "Hⁿ → U_f → Hⁿ → Measure" },
    { heading: "Key insight", body: "The magic lies in interference. The oracle imprints f(x) as a phase (-1)^{f(x)} on the superposition. After Hⁿ, constant functions collapse to |0⟩ⁿ while balanced functions have zero amplitude on |0⟩ⁿ.", formula: "Phase kickback: |x⟩ → (-1)^{f(x)}|x⟩" },
    { heading: "Try it yourself", body: "The circuit below demonstrates the Deutsch-Jozsa algorithm with 1 qubit (the original Deutsch problem). The oracle is already configured to be balanced. Run the simulation and observe the measurement outcomes.", example: "Circuit: q[0] → H → U_f (oracle) → H → Measure; result indicates 'balanced'" },
    { heading: "Expected outcome", body: "Balanced oracle: the input register never measures all zeros (for n=1 expect q[0]=1). Constant oracle: the input register always measures all zeros. Try the n/oracle selectors to confirm both cases with a single query each." },
    { heading: "Common misconception", body: "The speedup is about query count under a promise, not about evaluating f(x) for all x at once and reading every value. The final Hadamards interfere the phases so one measurement reveals a global property (constant vs balanced)." },
  ] },
  { id: "grover", title: "Grover's Search Algorithm", summary: "Amplify the probability of finding a marked state with quadratic speedup over classical search.", sections: [
    { heading: "What problem does it solve?", body: "Grover's algorithm searches an unsorted database of N items in O(√N) queries, compared to O(N) classically. Given a black-box function f(x) that returns 1 for exactly one marked state, Grover's finds it with high probability.", formula: "O(√N) queries vs O(N) classical" },
    { heading: "How the algorithm works", body: "1. Apply H to all qubits to create uniform superposition 2. Apply the oracle (phase flip the marked state) 3. Apply the diffusion operator (inversion about the mean) 4. Repeat steps 2-3 about √N times 5. Measure - the marked state has amplified probability", formula: "Oracle → Diffusion → Oracle → Diffusion → Measure" },
    { heading: "Key insight", body: "The oracle marks the target by flipping its phase, and the diffusion operator amplifies it. Each iteration rotates the state vector closer to the target. After √N iterations, the target state has near-100% probability.", formula: "Amplitude amplification: α_target → √N · α_target" },
    { heading: "Try it yourself", body: "Pick a target and round count, then load the circuit. One round amplifies the chosen target to probability 1.0; try 2 rounds on |11⟩ to see overshoot return toward uniform.", example: "Circuit: H⊗H → Oracle(target) → Diffusion → Measure; 1 round: P(target)=1.0" },
    { heading: "Expected outcome", body: "One round on any 2-qubit target gives P(target) = 1.0 — a full quadratic win for N=4. Two rounds overshoot back toward uniform (0.25 each), which is why iteration count matters and more rounds are not always better." },
    { heading: "Common misconception", body: "Grover gives a quadratic speedup (O(√N)), not exponential, and the oracle must still recognize the answer. It does not search without a check function, and optimal round count grows as √N." },
  ] },
  { id: "teleportation", title: "Quantum Teleportation", summary: "Transfer an unknown quantum state using shared entanglement and classical communication.", sections: [
    { heading: "What problem does it solve?", body: "Quantum teleportation transfers an unknown qubit state from Alice to Bob without physically sending the qubit. It uses a shared entangled pair and 2 classical bits. The no-cloning theorem ensures the original state is destroyed during transfer.", formula: "|ψ⟩ → |ψ⟩_Bob (using Bell pair + 2 classical bits)" },
    { heading: "How the protocol works", body: "1. Alice and Bob share a Bell pair (qubits 1 and 2) 2. Alice has the state to teleport (qubit 0) 3. Alice applies H and CNOT to qubits 0 and 1 4. Alice measures qubits 0 and 1 (2 classical bits) 5. Bob applies X and/or Z to qubit 2 based on Alice's measurement results", formula: "Bell pair → Alice measures → Bob corrects → State teleported" },
    { heading: "Key insight", body: "The entanglement between qubits 1 and 2 creates a channel. Alice's measurement collapses Bob's qubit into a state related to the original, and the 2 classical bits tell Bob which correction to apply. No quantum information travels through space.", formula: "No FTL communication: 2 classical bits are required" },
    { heading: "Try it yourself", body: "The circuit below demonstrates quantum teleportation with 3 qubits. Run the simulation and observe the measurement outcomes on all qubits.", example: "Circuit: 3 qubits → Bell pair(q1,q2) → Alice ops(q0,q1) → Measure(q0,q1) → Bob corrections(q2)" },
    { heading: "Expected outcome", body: "Alice's two qubits measure each of 00/01/10/11 with 0.25 probability — try payloads |0⟩, |1⟩, |+⟩ and confirm the distribution shape is identical. The payload is not readable from Alice's bits alone; it is recovered only after Bob's X/Z corrections." },
    { heading: "Common misconception", body: "Nothing quantum travels faster than light and nothing is cloned: the original q[0] state is destroyed by Alice's measurement, and Bob needs her 2 classical bits before he holds the teleported state." },
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

const LESSONS: Lesson[] = [
  ...BASE_LESSONS,
  ...learningModules.flatMap((module) => module.topics.map((topic) => ({
    id: `${module.id}-${topic.id}`,
    title: `${topic.id} · ${topic.title}`,
    summary: topic.summary,
    moduleTitle: module.title,
    sections: [
      { heading: "Learning objectives", body: topic.objectives.map((objective, index) => `${index + 1}. ${objective}`).join("\n") },
      ...(topic.formula ? [{ heading: "Mathematical representation", body: "Use this as a reference while working through the concept.", formula: topic.formula }] : []),
      ...(topic.intuition ? [{ heading: "Intuition", body: topic.intuition }] : []),
      ...(topic.examples.length ? [{ heading: "Worked examples", body: "Examples and expected simulation behaviour.", example: topic.examples.join("\n\n") }] : []),
      ...(topic.visualizations.length ? [{ heading: "What to visualize", body: topic.visualizations.map((item, index) => `${index + 1}. ${item}`).join("\n") }] : []),
      ...(topic.misconceptions.length ? [{ heading: "Common misconceptions", body: topic.misconceptions.map((item, index) => `${index + 1}. ${item}`).join("\n") }] : []),
    ],
  }))),
];

const QUIZ_ORDER = learningModules.flatMap((module) => [...module.topics.map((topic) => `${module.id}-${topic.id}`), `${module.id}-final`]);
const QUIZ_PROGRESS_KEY = "quantum-completed-module-quizzes";

export default function LearningPage({ activeLessonId, onLessonChange, onOpenBuilder, onOpenVisualizations, token }: { activeLessonId?: string; onLessonChange?: (id: string) => void; onOpenBuilder: (preset?: Circuit, originLessonId?: string) => void; onOpenVisualizations: () => void; token?: string | null }) {
  const [uncontrolled, setUncontrolled] = useState(BASE_LESSONS.length);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(learningModules[0].id);
  const [finalModuleId, setFinalModuleId] = useState<string | null>(null);
  const [completedQuizIds, setCompletedQuizIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(QUIZ_PROGRESS_KEY) ?? "[]") as string[]); } catch { return new Set(); }
  });
  const [bellVariant, setBellVariant] = useState<BellVariant>("phi_plus");
  const [djN, setDjN] = useState<1 | 2>(1);
  const [djOracle, setDjOracle] = useState<DjOracle>("balanced");
  const [groverTarget, setGroverTarget] = useState("11");
  const [groverIterations, setGroverIterations] = useState<1 | 2>(1);
  const [teleportPayload, setTeleportPayload] = useState<TeleportPayload>("plus");
  const [presetLoading, setPresetLoading] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);
  const controlledIndex = activeLessonId ? LESSONS.findIndex((l) => l.id === activeLessonId) : -1;
  const selected = controlledIndex >= 0 ? controlledIndex : uncontrolled;
  const setSelected = (index: number) => {
    if (onLessonChange) onLessonChange(LESSONS[index].id);
    else setUncontrolled(index);
  };
  const lesson = LESSONS[selected];
  const activeTopic = learningModules.flatMap((module) => module.topics.map((topic) => ({ module, topic }))).find(({ module, topic }) => `${module.id}-${topic.id}` === lesson.id);
  const finalModule = finalModuleId ? learningModules.find((module) => module.id === finalModuleId) : undefined;
  const activeQuiz = finalModule ? { id: `${finalModule.id}-final`, title: `${finalModule.title} · Final assessment`, questions: finalModule.finalQuestions } : activeTopic ? { id: `${activeTopic.module.id}-${activeTopic.topic.id}`, title: `${activeTopic.topic.id} · ${activeTopic.topic.title}`, questions: activeTopic.topic.questions } : undefined;

  useEffect(() => { localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify([...completedQuizIds])); }, [completedQuizIds]);

  function isQuizUnlocked(quizId: string) {
    const index = QUIZ_ORDER.indexOf(quizId);
    return index === 0 || (index > 0 && completedQuizIds.has(QUIZ_ORDER[index - 1]));
  }

  function completeQuiz(quizId: string) {
    setCompletedQuizIds((current) => new Set([...current, quizId]));
  }

  async function openPreset(lessonId: string) {
    if (!PRESETS[lessonId]) {
      onOpenBuilder(undefined, lessonId);
      return;
    }
    setPresetLoading(true);
    setPresetError(null);
    try {
      if (lessonId === "bell-state") onOpenBuilder(await fetchBellPreset(bellVariant), lessonId);
      else if (lessonId === "deutsch-jozsa") onOpenBuilder(await fetchDjPreset(djN, djOracle), lessonId);
      else if (lessonId === "grover") onOpenBuilder(await fetchGroverPreset(groverTarget, groverIterations), lessonId);
      else if (lessonId === "teleportation") onOpenBuilder(await fetchTeleportPreset(teleportPayload), lessonId);
      else onOpenBuilder(PRESETS[lessonId], lessonId);
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Could not load preset");
      onOpenBuilder(PRESETS[lessonId], lessonId);
    } finally {
      setPresetLoading(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
      <article className="min-w-0">
        <section className="bp-panel p-6 sm:p-8">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">{finalModule ? "Module final assessment" : `Lesson ${String(selected + 1).padStart(2, "0")} / ${LESSONS.length}`}</p>
          {!finalModule && lesson.moduleTitle && <p className="mt-2 text-xs font-mono text-[var(--bp-amber)]">{lesson.moduleTitle}</p>}
          <h1 className="font-display text-3xl sm:text-4xl mt-2">{finalModule ? finalModule.title : lesson.title}</h1>
          <p className="whitespace-pre-line text-sm text-[var(--bp-text-dim)] mt-3 max-w-3xl leading-relaxed">{finalModule ? `Complete the 10-question cumulative assessment after finishing every subtopic quiz in this module.` : lesson.summary}</p>

          <div className="mt-8 space-y-7">
            {!finalModule && <>
            {lesson.sections.map((section) => <section key={section.heading}>
              <h2 className="font-display text-xl">{section.heading}</h2>
              <p className="whitespace-pre-line text-sm text-[var(--bp-text-dim)] leading-7 mt-2">{section.body}</p>
              {section.formula && <pre className="whitespace-pre-wrap break-words mt-3 overflow-auto rounded border border-[var(--bp-border)] bg-[var(--bp-ink)] p-4 text-xs font-mono leading-6 text-[var(--bp-cyan)]">{section.formula}</pre>}
              {section.example && <div className="whitespace-pre-line break-words mt-3 rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] p-4 text-xs font-mono leading-6">{section.example}</div>}
              {PRESETS[lesson.id] && (section.heading.toLowerCase().includes("try it") || section.heading.toLowerCase().includes("try it yourself")) && <div className="mt-3 flex flex-wrap items-center gap-2">
                {lesson.id === "bell-state" && <label className="text-xs font-mono text-[var(--bp-text-dim)]">State <select value={bellVariant} onChange={(e) => setBellVariant(e.target.value as BellVariant)} className={SELECT_CLASS}><option value="phi_plus">|Φ+⟩ (00+11)</option><option value="phi_minus">|Φ-⟩ (00-11)</option><option value="psi_plus">|Ψ+⟩ (01+10)</option><option value="psi_minus">|Ψ-⟩ (01-10)</option></select></label>}
                {lesson.id === "deutsch-jozsa" && <><label className="text-xs font-mono text-[var(--bp-text-dim)]">Inputs <select value={djN} onChange={(e) => setDjN(Number(e.target.value) as 1 | 2)} className={SELECT_CLASS}><option value={1}>n=1</option><option value={2}>n=2</option></select></label><label className="text-xs font-mono text-[var(--bp-text-dim)]">Oracle <select value={djOracle} onChange={(e) => setDjOracle(e.target.value as DjOracle)} className={SELECT_CLASS}><option value="balanced">balanced</option><option value="constant_zero">constant 0</option><option value="constant_one">constant 1</option></select></label></>}
                {lesson.id === "grover" && <><label className="text-xs font-mono text-[var(--bp-text-dim)]">Target <select value={groverTarget} onChange={(e) => setGroverTarget(e.target.value)} className={SELECT_CLASS}><option value="00">|00⟩</option><option value="01">|01⟩</option><option value="10">|10⟩</option><option value="11">|11⟩</option></select></label><label className="text-xs font-mono text-[var(--bp-text-dim)]">Rounds <select value={groverIterations} onChange={(e) => setGroverIterations(Number(e.target.value) as 1 | 2)} className={SELECT_CLASS}><option value={1}>1</option><option value={2}>2</option></select></label></>}
                {lesson.id === "teleportation" && <label className="text-xs font-mono text-[var(--bp-text-dim)]">Send <select value={teleportPayload} onChange={(e) => setTeleportPayload(e.target.value as TeleportPayload)} className={SELECT_CLASS}><option value="plus">|+⟩</option><option value="zero">|0⟩</option><option value="one">|1⟩</option></select></label>}
                <button onClick={() => openPreset(lesson.id)} disabled={presetLoading} className="px-4 py-2 rounded bg-[var(--bp-cyan)] text-[#081527] text-xs font-mono font-semibold hover:opacity-90 disabled:opacity-40">{presetLoading ? "Loading…" : "Try it yourself →"}</button>
                <button onClick={onOpenVisualizations} className="px-4 py-2 rounded border border-[var(--bp-border-strong)] text-xs font-mono hover:border-[var(--bp-cyan)]">Open Visualizations</button>
              </div>}
              {presetError && (section.heading.toLowerCase().includes("try it") || section.heading.toLowerCase().includes("try it yourself")) && <p className="text-xs text-[var(--bp-coral)] mt-2">{presetError} — opened offline fallback.</p>}
            </section>)}

            {(lesson.id === "superposition" || lesson.id === "circuits" || lesson.id === "qiskit") && <div className="mt-8 flex flex-wrap gap-2"><button onClick={() => onOpenBuilder(PRESETS[lesson.id], lesson.id)} className="px-4 py-2 rounded bg-[var(--bp-cyan)] text-[#081527] text-xs font-mono font-semibold">Open Circuit Builder →</button><button onClick={onOpenVisualizations} className="px-4 py-2 rounded border border-[var(--bp-border-strong)] text-xs font-mono hover:border-[var(--bp-cyan)]">Open Visualizations</button></div>}

            {lesson.id === "bell-state" && <div className="mt-8 space-y-4"><h3 className="font-display text-lg">Recommended videos</h3><YouTubeVideo videoId="rze__aY0e4s" title="Bell State explanation" /><YouTubeVideo videoId="9MOIBcYf9wk" title="Bell State Qiskit simulation (Short)" /></div>}

            {lesson.id === "deutsch-jozsa" && <div className="mt-8 space-y-4"><h3 className="font-display text-lg">Recommended videos</h3><YouTubeVideo videoId="QcK0GK7DUh8" title="Deutsch-Jozsa algorithm explanation" /><YouTubeVideo videoId="pq2Okr_BO-Y" title="Deutsch-Jozsa circuit walkthrough" /></div>}

            {lesson.id === "grover" && <div className="mt-8 space-y-4"><h3 className="font-display text-lg">Recommended videos</h3><YouTubeVideo videoId="RQWpF2Gb-gU" title="Grover's search algorithm explanation" /><YouTubeVideo videoId="0RPFWZj7Jm0" title="Grover's search circuit walkthrough" /></div>}

            {lesson.id === "teleportation" && <div className="mt-8 space-y-4"><h3 className="font-display text-lg">Recommended videos</h3><YouTubeVideo videoId="jxqnzltpDdE" title="Quantum teleportation explanation" /><YouTubeVideo videoId="KsvNsY4cVvE" title="Quantum teleportation circuit walkthrough" /></div>}

            <div className="mt-10 pt-5 border-t border-[var(--bp-border)] flex justify-between gap-3"><button disabled={selected === 0} onClick={() => setSelected(selected - 1)} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono disabled:opacity-30">← Previous</button><button disabled={selected === LESSONS.length - 1} onClick={() => setSelected(selected + 1)} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono disabled:opacity-30">Next →</button></div>
            </>}
            {activeQuiz && <LessonQuiz quizId={activeQuiz.id} title={activeQuiz.title} questions={activeQuiz.questions} locked={!isQuizUnlocked(activeQuiz.id)} completed={completedQuizIds.has(activeQuiz.id)} onComplete={completeQuiz} token={token} />}
          </div>
        </section>
      </article>
      <div className="space-y-3">
        <ModuleRoadmap
          modules={learningModules}
          expandedModuleId={expandedModuleId}
          selectedTopicId={finalModule ? undefined : lesson.moduleTitle ? lesson.id : undefined}
          completedQuizIds={completedQuizIds}
          isQuizUnlocked={isQuizUnlocked}
          onExpandModule={setExpandedModuleId}
          onSelectTopic={(module, topicId) => {
            setExpandedModuleId(module.id);
            setFinalModuleId(null);
            setSelected(LESSONS.findIndex((item) => item.id === `${module.id}-${topicId}`));
          }}
          onSelectFinal={(module) => { setExpandedModuleId(module.id); setFinalModuleId(module.id); }}
        />
        <details className="bp-panel p-4">
          <summary className="cursor-pointer text-xs font-mono text-[var(--bp-amber)]">Interactive circuit labs</summary>
          <div className="mt-3 space-y-1">
            {BASE_LESSONS.filter((item) => PRESETS[item.id]).map((item) => <button key={item.id} onClick={() => setSelected(LESSONS.indexOf(item))} className="w-full rounded px-2 py-2 text-left text-xs text-[var(--bp-text-dim)] hover:bg-[var(--bp-panel-raised)] hover:text-[var(--bp-text)]">{item.title}</button>)}
          </div>
        </details>
      </div>
      </div>
  );
}
