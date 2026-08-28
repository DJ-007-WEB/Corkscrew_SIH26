import { useEffect, useState } from "react";
import VisualizationPage from "./VisualizationPage";
import type { Circuit, SimulationResult } from "./types";
import CircuitBuilder from "./CircuitBuilder";
import LandingPage from "./LandingPage";

type Tab = "home" | "builder" | "learn" | "waves";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "builder", label: "Circuit Builder" },
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
  const [tab, setTab] = useState<Tab>("home");
  const [latestResult, setLatestResult] = useState<SimulationResult | null>(null);
  // Keep the circuit in the app while navigating between pages, but intentionally
  // do not persist it to localStorage: a refresh/new server session starts clean.
  const [circuit, setCircuit] = useState<Circuit>({ qubits: 2, gates: [] });
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("quantum-theme", theme);
  }, [theme]);
  useEffect(() => {
    const saved = localStorage.getItem("quantum-theme") as "dark" | "light" | null;
    if (saved) setTheme(saved);
    const handler = (event: Event) => setLatestResult((event as CustomEvent<SimulationResult>).detail);
    window.addEventListener("quantum:simulation", handler);
    return () => window.removeEventListener("quantum:simulation", handler);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--bp-border)] px-6 py-5 flex items-baseline gap-3">
        <button
          onClick={() => setTab("home")}
          className="font-display text-xl font-semibold text-[var(--bp-text)]"
        >
          Quantum<span style={{ color: "var(--bp-cyan)" }}>Lab</span>
        </button>
        <p className="text-xs font-mono text-[var(--bp-text-faint)]">
          circuit builder · SIH 2026
        </p>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="ml-auto px-3 py-1.5 rounded border border-[var(--bp-border)] text-[10px] font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)]">{theme === "dark" ? "☼ Light" : "☾ Dark"}</button>
      </header>

      <nav className="flex gap-1 px-6 pt-4 border-b border-[var(--bp-border)] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 text-sm font-mono rounded-t-md border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderColor: tab === t.id ? "var(--bp-cyan)" : "transparent",
              color: tab === t.id ? "var(--bp-text)" : "var(--bp-text-faint)",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="p-6 max-w-6xl mx-auto">
        {tab === "home" && (
          <LandingPage
            onOpenBuilder={() => setTab("builder")}
            onOpenCode={() => setTab("builder")}
            onOpenVisualizations={() => setTab("waves")}
          />
        )}
        {tab === "builder" && (
          <CircuitBuilder circuit={circuit} onCircuitChange={setCircuit} theme={theme} />
        )}
        {tab === "waves" && <VisualizationPage result={latestResult} />}
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
