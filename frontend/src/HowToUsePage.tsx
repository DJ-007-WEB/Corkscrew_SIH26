export default function HowToUsePage({ onOpenLearn }: { onOpenLearn?: () => void }) {
  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Getting started</p>
        <h1 className="font-display text-3xl sm:text-4xl mt-2">How to use Corkscrew</h1>
        <p className="text-sm text-[var(--bp-text-dim)] mt-3 max-w-2xl leading-relaxed">
          A quick walkthrough of every part of the platform so you can start learning and building circuits as fast as possible.
        </p>
      </div>

      <section className="bp-panel p-6 sm:p-8">
        <h2 className="font-display text-xl mb-4">Step 1 — Log in</h2>
        <p className="text-sm text-[var(--bp-text-dim)] leading-7">
          Click the <strong>Learn</strong> tab. If you are not logged in, you will be taken to the sign-in page. Use your Google account to authenticate. Once logged in, all learning features and circuit saving are unlocked.
        </p>
      </section>

      <section className="bp-panel p-6 sm:p-8">
        <h2 className="font-display text-xl mb-4">Step 2 — Browse lessons</h2>
        <p className="text-sm text-[var(--bp-text-dim)] leading-7">
          The <strong>Learning</strong> page shows all available lessons in a sidebar. Use the search bar to filter by topic. Each lesson has theory sections, formulas, and worked examples. Lessons tagged <strong>Bell State</strong>, <strong>Deutsch-Jozsa</strong>, <strong>Grover's</strong>, and <strong>Teleportation</strong> have pre-built circuits you can run immediately.
        </p>
      </section>

      <section className="bp-panel p-6 sm:p-8">
        <h2 className="font-display text-xl mb-4">Step 3 — Try it yourself</h2>
        <p className="text-sm text-[var(--bp-text-dim)] leading-7 mb-4">
          Any lesson section labeled <strong>"Try it yourself"</strong> has a button that opens the Circuit Builder with the lesson's circuit pre-loaded. You can then:
        </p>
        <div className="space-y-3">
          {[
            ["Run", "Simulate the circuit and see the statevector and probabilities update in real time."],
            ["Edit", "Add, remove, or rearrange gates in the visual builder or code editor."],
            ["Visualize", "Switch to the Visualizations tab to see the Bloch sphere, Q-Sphere, and probability timeline."],
            ["Save", "Save your circuit to your workspace for later reference."],
          ].map(([label, text]) => (
            <div key={label} className="flex gap-3 p-3 border border-[var(--bp-border)] bg-[var(--bp-ink)]/30">
              <span className="font-mono text-xs text-[var(--bp-cyan)] shrink-0">{label}</span>
              <p className="text-xs text-[var(--bp-text-dim)] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bp-panel p-6 sm:p-8">
        <h2 className="font-display text-xl mb-4">Step 4 — Use the Circuit Builder</h2>
        <p className="text-sm text-[var(--bp-text-dim)] leading-7 mb-4">
          The Circuit Builder has two modes:
        </p>
        <div className="space-y-3">
          {[
            ["Visual", "Drag gates from the palette onto qubit wires. For CNOT, click the control qubit first, then the target."],
            ["Code", "Type Python circuit code directly in the code panel and it will be validated and loaded."],
          ].map(([label, text]) => (
            <div key={label} className="flex gap-3 p-3 border border-[var(--bp-border)] bg-[var(--bp-ink)]/30">
              <span className="font-mono text-xs text-[var(--bp-cyan)] shrink-0">{label}</span>
              <p className="text-xs text-[var(--bp-text-dim)] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bp-panel p-6 sm:p-8">
        <h2 className="font-display text-xl mb-4">Step 5 — Explore visualizations</h2>
        <p className="text-sm text-[var(--bp-text-dim)] leading-7">
          After running a circuit, switch to the <strong>Visualizations</strong> tab. You will see the Bloch sphere for single-qubit states, the Q-Sphere for multi-qubit states, and a probability timeline showing how amplitudes evolve through each gate step.
        </p>
      </section>

      <section className="bp-panel p-6 sm:p-8">
        <h2 className="font-display text-xl mb-4">Step 6 — Ask the AI tutor</h2>
        <p className="text-sm text-[var(--bp-text-dim)] leading-7">
          Click the <strong>QuantumTutor</strong> button at any time. The tutor can answer conceptual questions or provide grounded, simulation-verified facts about the current circuit. It will suggest relevant lessons and circuits based on your question.
        </p>
      </section>

      <section className="bp-panel p-6 sm:p-8">
        <h2 className="font-display text-xl mb-4">Troubleshooting</h2>
        <div className="space-y-3">
          {[
            ["Backend down", "If Run or the tutor says the service is unreachable, make sure the FastAPI backend is running on http://localhost:8000 and VITE_API_URL matches it."],
            ["Invalid circuit", "If validation rejects a circuit, check CNOT has one control and one target on different qubits, and every qubit index is below the qubit count."],
            ["Empty visualizations", "The Visualizations tab shows “Run a circuit first” until you press Run in Circuit Builder — results flow there automatically."],
            ["Login gate", "Learning and My Works require Google sign-in. If you land on Auth, sign in and you return to your tab."],
            ["Tutor modes", "Replies labeled grounded use live Qiskit numbers from your circuit; conceptual replies cover theory with no circuit attached."],
          ].map(([label, text]) => (
            <div key={label} className="flex gap-3 p-3 border border-[var(--bp-border)] bg-[var(--bp-ink)]/30">
              <span className="font-mono text-xs text-[var(--bp-cyan)] shrink-0">{label}</span>
              <p className="text-xs text-[var(--bp-text-dim)] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="text-center py-4">
        <button
          onClick={onOpenLearn}
          className="px-6 py-3 rounded-md font-mono text-sm font-medium"
          style={{ background: "var(--bp-cyan)", color: "#081527" }}
        >
          Start learning →
        </button>
      </div>
    </div>
  );
}
