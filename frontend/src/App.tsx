import { GoogleOAuthProvider } from "@react-oauth/google";
import { useEffect, useRef, useState } from "react";
import VisualizationPage from "./VisualizationPage";
import type { Circuit, SimulationResult } from "./types";
import CircuitBuilder from "./CircuitBuilder";
import LandingPage from "./LandingPage";
import AuthPage from "./AuthPage";
import LearningPage from "./LearningPage";
import QuantumTutor from "./QuantumTutor";
import MyWorksPage from "./MyWorksPage";
import AssessmentPage from "./AssessmentPage";
import ContestPage from "./ContestPage";
import HowToUsePage from "./HowToUsePage";

type Tab = "home" | "builder" | "learn" | "waves" | "works" | "assessment" | "contests" | "howtouse";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "builder", label: "Circuit Builder" },
  { id: "waves", label: "Visualizations" },
  { id: "learn", label: "Learning" },
  { id: "howtouse", label: "How to Use" },
  { id: "works", label: "My Works" },
  { id: "assessment", label: "Assessment" },
  { id: "contests", label: "Contests" },
];

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

const BLANK_CIRCUIT: Circuit = { qubits: 2, gates: [] };

/** Extract the JWT sub client-side (namespacing local drafts only, never auth). */
function tokenSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const segment = token.split(".")[1];
    const payload = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function lessonKeyFor(sub: string | null): string {
  return sub ? `quantum-lesson:${sub}` : "quantum-lesson";
}

const VALID_TABS: Tab[] = ["home", "builder", "learn", "waves", "works", "assessment", "contests", "howtouse"];

function storedTab(): Tab {
  const saved = localStorage.getItem("quantum-tab");
  return saved && (VALID_TABS as string[]).includes(saved) ? (saved as Tab) : "home";
}

export default function App() {
  const [tab, setTab] = useState<Tab>(storedTab);
  const [latestResult, setLatestResult] = useState<SimulationResult | null>(null);
  const [circuit, setCircuit] = useState<Circuit>({ qubits: 2, gates: [] });
  const [presetCircuit, setPresetCircuit] = useState<Circuit | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("quantum-token"));
  const [tutorOpen, setTutorOpen] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string>(() => {
    const sub = tokenSub(localStorage.getItem("quantum-token"));
    return localStorage.getItem(lessonKeyFor(sub)) ?? localStorage.getItem("quantum-lesson") ?? "intro";
  });
  const [builderOrigin, setBuilderOrigin] = useState<string | null>(null);
  const prevSub = useRef<string | null>(tokenSub(localStorage.getItem("quantum-token")));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("quantum-theme", theme);
  }, [theme]);

  // Keep the active page across refreshes (all tabs, including contests).
  useEffect(() => {
    localStorage.setItem("quantum-tab", tab);
  }, [tab]);

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

  // Per-account isolation: the builder draft, simulation output and lesson
  // bookmark live in App-level state / global localStorage keys, so without
  // this one account's circuit would still be on screen after switching to
  // another account in the same browser. Whenever the signed-in identity
  // changes, start that account from a blank draft and load its own lesson.
  useEffect(() => {
    const sub = tokenSub(token);
    if (sub !== prevSub.current) {
      prevSub.current = sub;
      setCircuit({ ...BLANK_CIRCUIT, gates: [] });
      setLatestResult(null);
      setPresetCircuit(null);
      setBuilderOrigin(null);
      setTutorOpen(false);
      setActiveLessonId(localStorage.getItem(lessonKeyFor(sub)) ?? "intro");
      setTab("home");
    }
  }, [token]);

  function handleLessonChange(id: string) {
    setActiveLessonId(id);
    localStorage.setItem(lessonKeyFor(tokenSub(token)), id);
  }

  function openBuilderFromLesson(preset: Circuit | undefined, lessonId?: string) {
    if (preset) setPresetCircuit(preset);
    setBuilderOrigin(lessonId ?? null);
    setTab("builder");
  }

  const LESSON_TITLES: Record<string, string> = {
    intro: "Introduction to Quantum Computing",
    qubits: "Bits, Qubits & Quantum States",
    superposition: "Superposition & Interference",
    measurement: "Measurement & Probability",
    gates: "Quantum Gates",
    circuits: "How to Read Quantum Circuits",
    multiqubit: "Multiple Qubits & Tensor Products",
    controlled: "CNOT & Controlled Gates",
    "bell-state": "Bell State",
    bloch: "How to Read the Bloch Sphere",
    qsphere: "How to Read the Q-Sphere",
    unitary: "Matrices, Unitaries & Reversibility",
    algorithms: "Quantum Algorithms: The Big Picture",
    "deutsch-jozsa": "Deutsch-Jozsa Algorithm",
    grover: "Grover's Search Algorithm",
    teleportation: "Quantum Teleportation",
    noise: "Noise, Decoherence & NISQ",
    qiskit: "Getting Started with Qiskit",
  };

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

      <div className="flex-1 min-h-0 overflow-hidden">
        <main className="h-full overflow-y-auto p-6 max-w-6xl mx-auto w-full">
          {tab === "home" && <LandingPage onOpenBuilder={(preset) => { if (preset) setPresetCircuit(preset); setBuilderOrigin(null); setTab("builder"); }} onOpenCode={() => setTab("builder")} onOpenVisualizations={() => setTab("waves")} onOpenHowToUse={() => setTab("howtouse")} />}
          {tab === "builder" && <CircuitBuilder circuit={circuit} onCircuitChange={setCircuit} presetCircuit={presetCircuit} onPresetClear={() => setPresetCircuit(null)} theme={theme} token={token} onRequireLogin={() => setTab("works")} returnLabel={builderOrigin ? LESSON_TITLES[builderOrigin] ?? builderOrigin : null} onReturn={builderOrigin ? () => setTab("learn") : undefined} />}
          {tab === "waves" && <VisualizationPage result={latestResult} />}
          {tab === "learn" && (token ? <LearningPage activeLessonId={activeLessonId} onLessonChange={handleLessonChange} onOpenBuilder={openBuilderFromLesson} onOpenVisualizations={() => setTab("waves")} /> : <AuthPage onAuthenticated={(newToken) => { setToken(newToken); setTab("learn"); }} />)}
          {tab === "works" && (token ? <MyWorksPage token={token} onOpenCircuit={(nextCircuit) => { setCircuit(nextCircuit); setTab("builder"); }} /> : <AuthPage onAuthenticated={(newToken) => { setToken(newToken); setTab("works"); }} />)}
          {tab === "assessment" && <AssessmentPage token={token} />}
          {tab === "contests" && (token ? <ContestPage token={token} circuit={circuit} onOpenBuilder={() => setTab("builder")} /> : <AuthPage onAuthenticated={(newToken) => { setToken(newToken); setTab("contests"); }} />)}
          {tab === "howtouse" && <HowToUsePage onOpenLearn={() => setTab("learn")} />}
        </main>
      </div>
      <QuantumTutor circuit={circuit} isOpen={tutorOpen} onToggle={setTutorOpen} />
    </div>
  );

  return GOOGLE_CLIENT_ID ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{content}</GoogleOAuthProvider> : content;
}


