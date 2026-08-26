type LandingPageProps = {
  onOpenBuilder: () => void;
  onOpenCode: () => void;
  onOpenVisualizations: () => void;
};

const LEARNING_PATH = [
  {
    number: "01",
    title: "Quantum fundamentals",
    description:
      "Build the mental model first: bits vs qubits, computational basis states, superposition, measurement, probability amplitudes, and entanglement.",
    action: "Understand the idea",
    detail: "Start with |0⟩ and |1⟩, learn what a qubit state means, then see how gates transform that state.",
  },
  {
    number: "02",
    title: "Quantum gates",
    description:
      "Learn the operations that form a quantum circuit — H, X, Y, Z and controlled operations such as CNOT.",
    action: "Build the operation",
    detail: "Choose a gate, place it on a qubit, connect control and target qubits when needed, and run the circuit.",
  },
  {
    number: "03",
    title: "Circuit design",
    description:
      "Turn an algorithm into a circuit by arranging gates across qubit wires and observing how every operation changes the state.",
    action: "Design a circuit",
    detail: "Use the Circuit Builder to add qubits, place gates, create multi-qubit operations, edit the circuit, and execute it.",
  },
  {
    number: "04",
    title: "Quantum programming",
    description:
      "Move from visual circuits to code and understand how a quantum circuit is represented programmatically.",
    action: "Write the circuit",
    detail: "Write quantum code in the editor, translate it into the common circuit representation, and execute it through the simulator.",
  },
  {
    number: "05",
    title: "State & measurement",
    description:
      "See the state produced by a circuit and understand the difference between amplitudes, probabilities, and measurement outcomes.",
    action: "Inspect the state",
    detail: "Run a circuit, inspect the state evolution, and use probability visualizations to connect the mathematics with measurement.",
  },
  {
    number: "06",
    title: "Circuit analysis",
    description:
      "Learn to read a circuit instead of only running it: identify transformations, multi-qubit interactions, depth, and important quantum concepts.",
    action: "Analyze the circuit",
    detail: "Use the execution data to understand what each gate changed and why the final state follows from the sequence of operations.",
  },
];

const WORKFLOW = [
  ["01", "Learn", "Understand the concept and the role of the operation before using it."],
  ["02", "Build", "Create the circuit visually or express the same circuit in code."],
  ["03", "Run", "Send the circuit through the simulation engine and calculate its actual state."],
  ["04", "Inspect", "Study state evolution, probabilities, visualizations, and circuit-level analysis."],
  ["05", "Improve", "Use the feedback to experiment, debug your reasoning, and try the circuit again."],
];

export default function LandingPage({
  onOpenBuilder,
  onOpenCode,
  onOpenVisualizations,
}: LandingPageProps) {
  return (
    <div className="space-y-16 pb-12">
      <section className="grid lg:grid-cols-[1.15fr_0.85fr] gap-8 items-center pt-8">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.28em] text-[var(--bp-cyan)] mb-5">
            Interactive quantum learning platform · SIH 2026
          </p>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.02] text-[var(--bp-text)] max-w-3xl">
            Learn quantum computing by <span style={{ color: "var(--bp-cyan)" }}>building it.</span>
          </h2>
          <p className="text-base sm:text-lg text-[var(--bp-text-dim)] leading-relaxed max-w-2xl mt-6">
            Corkscrew turns abstract quantum concepts into something you can see, construct,
            execute, and understand. Learn a concept, build a circuit, run it, and inspect what
            actually happened.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <button
              onClick={onOpenBuilder}
              className="px-5 py-3 rounded-md font-mono text-sm font-medium transition-all"
              style={{
                background: "var(--bp-cyan)",
                color: "#081527",
                boxShadow: "0 0 20px var(--bp-cyan-dim)",
              }}
            >
              Start building →
            </button>
            <button
              onClick={onOpenVisualizations}
              className="px-5 py-3 rounded-md border border-[var(--bp-border-strong)] text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] font-mono text-sm transition-colors"
            >
              Explore visualizations
            </button>
          </div>
        </div>

        <div className="bp-panel p-5 sm:p-7">
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
              Learning loop
            </span>
            <span className="text-[10px] font-mono text-[var(--bp-cyan)]">LIVE · COMPUTE</span>
          </div>
          <div className="space-y-3">
            {WORKFLOW.map(([number, title, text]) => (
              <div key={number} className="flex gap-4 p-3 border border-[var(--bp-border)] bg-[var(--bp-ink)]/40">
                <span className="font-mono text-xs text-[var(--bp-cyan)] pt-0.5">{number}</span>
                <div>
                  <p className="font-display text-sm text-[var(--bp-text)]">{title}</p>
                  <p className="text-xs text-[var(--bp-text-dim)] leading-relaxed mt-1">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="learn">
        <div className="mb-7">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)] mb-2">What you can learn</p>
          <h3 className="font-display text-2xl sm:text-3xl text-[var(--bp-text)]">From first principles to working circuits.</h3>
          <p className="text-sm text-[var(--bp-text-dim)] max-w-2xl mt-2 leading-relaxed">
            Each part of the platform is designed to connect the concept with an action. You do not
            have to memorize a circuit before you can understand it.
          </p>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {LEARNING_PATH.map((item) => (
            <article key={item.number} className="bp-panel p-5 min-h-[235px] flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <span className="font-mono text-xs text-[var(--bp-cyan)]">{item.number}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">learn → do</span>
              </div>
              <h4 className="font-display text-lg text-[var(--bp-text)] mt-5">{item.title}</h4>
              <p className="text-sm text-[var(--bp-text-dim)] leading-relaxed mt-2">{item.description}</p>
              <div className="mt-auto pt-5 border-t border-[var(--bp-border)]">
                <p className="text-xs font-mono text-[var(--bp-amber)]">{item.action}</p>
                <p className="text-xs text-[var(--bp-text-faint)] leading-relaxed mt-1">{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="bp-panel p-6 sm:p-8">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)] mb-3">Why this matters</p>
          <h3 className="font-display text-2xl text-[var(--bp-text)]">Quantum computing is easier to learn when the math becomes observable.</h3>
          <div className="space-y-4 mt-6">
            <p className="text-sm text-[var(--bp-text-dim)] leading-relaxed">
              Superposition, phase, entanglement, and measurement are difficult when they are presented
              only as equations. An interactive circuit gives every idea a concrete operation and every
              operation a measurable consequence.
            </p>
            <p className="text-sm text-[var(--bp-text-dim)] leading-relaxed">
              That makes Corkscrew useful for students learning the fundamentals, developers learning
              quantum SDKs, researchers experimenting with small circuits, and instructors who want a
              visual environment for explaining algorithms.
            </p>
          </div>
        </div>

        <div className="bp-panel p-6 sm:p-8">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)] mb-3">What you gain</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ["Build intuition", "Connect equations to visible state changes."],
              ["Experiment safely", "Try circuits repeatedly without requiring quantum hardware."],
              ["Learn to debug", "Trace a circuit gate by gate instead of guessing at the result."],
              ["Bridge visual + code", "Understand the same circuit from both representations."],
              ["Prepare for SDKs", "Build the mental model needed for real quantum development."],
              ["Learn by doing", "Turn passive reading into short, measurable experiments."],
            ].map(([title, text]) => (
              <div key={title} className="border border-[var(--bp-border)] p-4 bg-[var(--bp-ink)]/30">
                <p className="font-display text-sm text-[var(--bp-text)]">{title}</p>
                <p className="text-xs text-[var(--bp-text-dim)] leading-relaxed mt-1">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bp-panel p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)] mb-2">How Corkscrew works</p>
            <h3 className="font-display text-2xl sm:text-3xl text-[var(--bp-text)]">One circuit. Multiple ways to understand it.</h3>
            <p className="text-sm text-[var(--bp-text-dim)] max-w-2xl mt-2 leading-relaxed">
              The visual builder, code editor, simulator, and visualizations are designed around the
              same circuit representation. The numbers shown after execution come from the simulation,
              not from pre-written examples.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onOpenBuilder}
              className="px-4 py-2 rounded border border-[var(--bp-border-strong)] text-[var(--bp-text)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] font-mono text-xs transition-colors"
            >
              Open builder
            </button>
            <button
              onClick={onOpenCode}
              className="px-4 py-2 rounded border border-[var(--bp-border-strong)] text-[var(--bp-text)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] font-mono text-xs transition-colors"
            >
              Open code editor
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3 mt-7">
          {[
            ["CIRCUIT", "Build or write", "Create the operations you want to study."],
            ["ENGINE", "Calculate", "The backend executes the circuit and derives its state."],
            ["VIEW", "Visualize", "Inspect probabilities and state evolution from the computed result."],
            ["ANALYZE", "Understand", "Turn the computed data into an explanation of what changed and why."],
          ].map(([label, title, text]) => (
            <div key={label} className="relative border border-[var(--bp-border)] p-4 bg-[var(--bp-ink)]/30">
              <p className="text-[10px] font-mono tracking-wider text-[var(--bp-cyan)]">{label}</p>
              <p className="font-display text-sm text-[var(--bp-text)] mt-3">{title}</p>
              <p className="text-xs text-[var(--bp-text-dim)] leading-relaxed mt-1">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="text-center py-4">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-faint)] mb-3">Your first experiment</p>
        <h3 className="font-display text-2xl sm:text-3xl text-[var(--bp-text)]">Start with a qubit. End with an explanation.</h3>
        <p className="text-sm text-[var(--bp-text-dim)] max-w-xl mx-auto mt-3 leading-relaxed">
          Build a small circuit, run it, and inspect the actual state it produces. The platform is meant
          to make experimentation the shortest path to understanding.
        </p>
        <button
          onClick={onOpenBuilder}
          className="mt-6 px-6 py-3 rounded-md font-mono text-sm font-medium"
          style={{ background: "var(--bp-cyan)", color: "#081527" }}
        >
          Enter the Circuit Builder →
        </button>
      </section>
    </div>
  );
}
