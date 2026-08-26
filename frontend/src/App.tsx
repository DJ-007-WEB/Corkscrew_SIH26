import { useState } from "react";
import CircuitBuilder from "./CircuitBuilder";

type Tab = "builder" | "code" | "learn" | "waves";

const TABS: { id: Tab; label: string }[] = [
  { id: "builder", label: "Circuit Builder" },
  { id: "code", label: "Code Editor" },
  { id: "waves", label: "Visualizations" },
  { id: "learn", label: "Learning" },
];

function Placeholder({ owner, title, note }: { owner: string; title: string; note: string }) {
  return (
    <div className="bp-panel p-10 text-center">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)] mb-2">
        {owner}
      </p>
      <h3 className="font-display text-lg text-[var(--bp-text)] mb-2">{title}</h3>
      <p className="text-sm text-[var(--bp-text-dim)] max-w-md mx-auto leading-relaxed">{note}</p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("builder");

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--bp-border)] px-6 py-5 flex items-baseline gap-3">
        <h1 className="font-display text-xl font-semibold text-[var(--bp-text)]">
          Quantum<span style={{ color: "var(--bp-cyan)" }}>Lab</span>
        </h1>
        <p className="text-xs font-mono text-[var(--bp-text-faint)]">
          circuit builder · SIH 2026
        </p>
      </header>

      <nav className="flex gap-1 px-6 pt-4 border-b border-[var(--bp-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm font-mono rounded-t-md border-b-2 transition-colors"
            style={{
              borderColor: tab === t.id ? "var(--bp-cyan)" : "transparent",
              color: tab === t.id ? "var(--bp-text)" : "var(--bp-text-faint)",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="p-6 max-w-5xl mx-auto">
        {tab === "builder" && <CircuitBuilder />}
        {tab === "code" && (
          <Placeholder
            owner="Full-Stack 1 + Backend"
            title="Monaco code editor"
            note="Qiskit code goes here, compiling to the same Circuit IR the builder uses. Backend must sandbox execution (roadmap Section 3) before this hits a real endpoint."
          />
        )}
        {tab === "waves" && (
          <Placeholder
            owner="Full-Stack 1 (Three.js)"
            title="Bloch sphere & state visualizations"
            note="Single-qubit Bloch sphere first. Reference the interference/wavefunction style from quantum-physics.polytechnique.fr for the visual language — dark instrument canvas, glowing traces."
          />
        )}
        {tab === "learn" && (
          <Placeholder
            owner="Roadmap only"
            title="Structured learning modules"
            note="Not built for the hackathon MVP — mockup screens only, per the roadmap doc."
          />
        )}
      </main>
    </div>
  );
}
