import { useEffect, useMemo, useState } from "react";
import BlochSphere from "./BlochSphere";
import QSphere from "./QSphere";
import ProbabilityTimeline from "./ProbabilityTimeline";
import type { SimulationResult } from "./types";

function amp(a: { real: number; imag: number }) {
  const r = Math.abs(a.real) < 1e-9 ? 0 : a.real;
  const i = Math.abs(a.imag) < 1e-9 ? 0 : a.imag;
  if (!i) return r.toFixed(3);
  if (!r) return `${i.toFixed(3)}i`;
  return `${r.toFixed(3)} ${i >= 0 ? "+" : "-"} ${Math.abs(i).toFixed(3)}i`;
}

export default function VisualizationPage({ result }: { result: SimulationResult | null }) {
  const [step, setStep] = useState(0);
  const [qubit, setQubit] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = result?.steps[step] ?? null;
  const probabilities = current?.state.probabilities ?? {};
  const amplitudes = current?.state.statevector ?? {};
  const entries = useMemo(
    () => Object.entries(probabilities).filter(([, p]) => p > 1e-10),
    [probabilities],
  );

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [result]);

  useEffect(() => {
    if (!playing || !result || result.steps.length <= 1) return;
    const timer = window.setInterval(() => {
      setStep((currentStep) => {
        if (currentStep >= result.steps.length - 1) {
          setPlaying(false);
          return currentStep;
        }
        return currentStep + 1;
      });
    }, 1100);
    return () => window.clearInterval(timer);
  }, [playing, result]);

  function selectStep(next: number) {
    if (!result) return;
    const safe = Math.max(0, Math.min(next, result.steps.length - 1));
    setStep(safe);
    if (safe >= result.steps.length - 1) setPlaying(false);
  }

  if (!result)
    return (
      <div className="bp-panel p-10 text-center">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Visualization Lab</p>
        <h2 className="font-display text-xl mt-2">Run a circuit first</h2>
        <p className="text-sm text-[var(--bp-text-dim)] mt-2 leading-relaxed">Build a circuit in Circuit Lab, run it, then open this page to inspect the real Qiskit Aer state.</p>
      </div>
    );

  const max = Math.max(...entries.map(([, p]) => p), 1e-10);
  const totalQubits = Math.max(1, Math.round(Math.log2(Object.keys(amplitudes).length)));
  const currentLabel = current?.after_gate
    ? current.after_gate.type === "CNOT"
      ? `CNOT q[${current.after_gate.controls?.[0] ?? "?"}] → q[${current.after_gate.targets[0]}]`
      : `${current.after_gate.type} q[${current.after_gate.targets[0]}]`
    : "Initial state";

  return (
    <div className="space-y-4">
      <div className="bp-panel p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Visualization Lab</p>
            <h2 className="font-display text-xl mt-1">Quantum state microscope</h2>
            <p className="text-xs text-[var(--bp-text-faint)] mt-1 leading-relaxed">Live data from Qiskit Aer · {result.backend}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => selectStep(step - 1)} disabled={step <= 0} className="w-8 h-8 rounded border border-[var(--bp-border-strong)] text-xs font-mono text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] disabled:opacity-30">‹</button>
            <button onClick={() => setPlaying((value) => !value)} disabled={result.steps.length <= 1} className="min-w-24 px-3 py-2 rounded-md font-mono text-sm font-medium transition-all disabled:opacity-40" style={{ background: "var(--bp-cyan)", color: "#081527", boxShadow: playing ? "none" : "0 0 16px var(--bp-cyan-dim)" }}>
              {playing ? "Ⅱ Pause" : step >= result.steps.length - 1 ? "↻ Replay" : "▶ Play"}
            </button>
            <button onClick={() => selectStep(step + 1)} disabled={step >= result.steps.length - 1} className="w-8 h-8 rounded border border-[var(--bp-border-strong)] text-xs font-mono text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] disabled:opacity-30">›</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {result.steps.map((s, i) => (
            <button key={i} onClick={() => { setPlaying(false); selectStep(i); }} className={`px-3 py-1.5 rounded border text-[10px] font-mono transition-colors ${step === i ? "border-[var(--bp-cyan)] text-[var(--bp-cyan)] bg-[var(--bp-cyan)]/5" : "border-[var(--bp-border)] text-[var(--bp-text-faint)] hover:text-[var(--bp-text-dim)]"}`}>
              {i === 0 ? "START" : `GATE ${i}`} {s.after_gate?.type ?? ""}
            </button>
          ))}
          <span className="text-[10px] font-mono text-[var(--bp-text-faint)] ml-auto">STEP {step} · {currentLabel}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bp-panel p-5">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Measurement probabilities</p>
          <div className="mt-4 space-y-3">
            {entries.map(([s, p]) => (
              <div key={s}>
                <div className="flex justify-between font-mono text-xs mb-1"><span>|{s}⟩</span><span>{(p * 100).toFixed(1)}%</span></div>
                <div className="h-2 rounded bg-[var(--bp-border)]"><div className="h-full rounded bg-[var(--bp-cyan)] transition-all duration-500" style={{ width: `${(p / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
        <section className="bp-panel p-5">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Statevector</p>
          <div className="mt-4 max-h-52 overflow-auto bp-scrollbar space-y-1">
            {Object.entries(amplitudes).filter(([s]) => (probabilities[s] ?? 0) > 1e-10).map(([s, a]) => (
              <div key={s} className="flex justify-between gap-3 bg-[var(--bp-bg)] rounded px-3 py-2 font-mono text-xs"><span>|{s}⟩</span><span className="text-right">{amp(a)} · P={(probabilities[s] * 100).toFixed(1)}%</span></div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bp-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Bloch sphere</p>
              <p className="text-xs text-[var(--bp-text-faint)] mt-1 leading-relaxed">Single-qubit reduced state from the current simulation snapshot.</p>
            </div>
            <select value={qubit} onChange={(e) => setQubit(Number(e.target.value))} className="bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-xs font-mono">
              {Array.from({ length: totalQubits }, (_, i) => <option key={i} value={i}>q[{i}]</option>)}
            </select>
          </div>
          <BlochSphere amplitudes={amplitudes} qubits={totalQubits} selectedQubit={qubit} />
        </section>
        <section className="bp-panel p-5">
          <div className="mb-3">
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Q sphere</p>
            <p className="text-xs text-[var(--bp-text-faint)] mt-1 leading-relaxed">Full multi-qubit state: basis states, amplitudes, probabilities, and phase.</p>
          </div>
          <QSphere amplitudes={amplitudes} />
        </section>
      </div>

      <section className="bp-panel p-5">
        <div className="mb-3">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Probability timeline</p>
          <p className="text-xs text-[var(--bp-text-faint)] mt-1 leading-relaxed">Follow how each basis-state probability changes as the circuit executes. Click any step to jump the visualizations there.</p>
        </div>
        <ProbabilityTimeline steps={result.steps} currentStep={step} onStepChange={(next) => { setPlaying(false); selectStep(next); }} />
      </section>
    </div>
  );
}
