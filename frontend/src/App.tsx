import { GoogleOAuthProvider } from "@react-oauth/google";
import { useEffect, useState } from "react";
import VisualizationPage from "./VisualizationPage";
import type { Circuit, SimulationResult } from "./types";
import CircuitBuilder from "./CircuitBuilder";
import LandingPage from "./LandingPage";
import AuthPage from "./AuthPage";
import LearningPage from "./LearningPage";
import QuantumTutor from "./QuantumTutor";

type Tab = "home" | "builder" | "learn" | "waves";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "builder", label: "Circuit Builder" },
  { id: "waves", label: "Visualizations" },
  { id: "learn", label: "Learning" },
];

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [latestResult, setLatestResult] = useState<SimulationResult | null>(null);
  const [circuit, setCircuit] = useState<Circuit>({ qubits: 2, gates: [] });
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("quantum-token"));
  const [tutorOpen, setTutorOpen] = useState(false);

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

  function logout() {
    localStorage.removeItem("quantum-token");
    setToken(null);
    setTab("home");
  }

  const content = (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="border-b border-[var(--bp-border)] px-6 py-4 flex items-baseline gap-3 shrink-0">
        <button onClick={() => setTab("home")} className="font-display text-xl font-semibold text-[var(--bp-text)]">
          Quantum<span style={{ color: "var(--bp-cyan)" }}>Lab</span>
        </button>
        <p className="text-xs font-mono text-[var(--bp-text-faint)]">circuit builder · SIH 2026</p>
        <div className="ml-auto flex items-center gap-2">
          {token && <button onClick={logout} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[10px] font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)]">Sign out</button>}
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[10px] font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)]">{theme === "dark" ? "☼ Light" : "☾ Dark"}</button>
        </div>
      </header>

      <nav className="flex gap-1 px-6 pt-4 border-b border-[var(--bp-border)] overflow-x-auto shrink-0">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-4 py-2 text-sm font-mono rounded-t-md border-b-2 transition-colors whitespace-nowrap" style={{ borderColor: tab === t.id ? "var(--bp-cyan)" : "transparent", color: tab === t.id ? "var(--bp-text)" : "var(--bp-text-faint)" }}>
            {t.label}{t.id === "learn" && !token ? " · Free login" : ""}
          </button>
        ))}
      </nav>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 min-w-0 overflow-y-auto p-6 max-w-6xl mx-auto w-full">
          {tab === "home" && <LandingPage onOpenBuilder={() => setTab("builder")} onOpenCode={() => setTab("builder")} onOpenVisualizations={() => setTab("waves")} />}
          {tab === "builder" && <CircuitBuilder circuit={circuit} onCircuitChange={setCircuit} theme={theme} />}
          {tab === "waves" && <VisualizationPage result={latestResult} />}
          {tab === "learn" && (token ? <LearningPage onOpenBuilder={() => setTab("builder")} onOpenVisualizations={() => setTab("waves")} /> : <AuthPage onAuthenticated={(newToken) => { setToken(newToken); setTab("learn"); }} />)}
        </main>
        <QuantumTutor circuit={circuit} isOpen={tutorOpen} onToggle={setTutorOpen} />
      </div>
    </div>
  );

  return GOOGLE_CLIENT_ID ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{content}</GoogleOAuthProvider> : content;
}


