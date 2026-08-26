import { useEffect, useMemo, useState } from "react";
import type { Gate, SimulationResult } from "./types";

function gateLabel(gate: Gate | null) {
  if (!gate) return "Initial state";
  if (gate.type === "CNOT") return `CNOT q[${gate.controls?.[0]}] → q[${gate.targets[0]}]`;
  return `${gate.type} q[${gate.targets[0]}]`;
}

function gateExplanation(gate: Gate | null, probabilities: Record<string, number>) {
  if (!gate) return "This is the starting state before any quantum gate is applied.";
  const active = Object.entries(probabilities).filter(([, p]) => p > 1e-10).length;
  const dominant = Object.entries(probabilities).sort(([, a], [, b]) => b - a)[0];

  if (gate.type === "H") {
    return `Hadamard was applied to q[${gate.targets[0]}]. The simulated state now has ${active} measurable basis state${active === 1 ? "" : "s"}.`;
  }
  if (gate.type === "CNOT") {
    return `CNOT used q[${gate.controls?.[0]}] as the control and q[${gate.targets[0]}] as the target. The state shown is produced by that controlled operation.`;
  }
  if (gate.type === "X") {
    return `Pauli-X was applied to q[${gate.targets[0]}], flipping its computational-basis component. The probabilities are calculated from the resulting state.`;
  }
  if (gate.type === "Y") {
    return `Pauli-Y was applied to q[${gate.targets[0]}]. It changes both basis and phase components of the qubit.`;
  }
  if (gate.type === "Z") {
    return `Pauli-Z was applied to q[${gate.targets[0]}]. It changes the phase of the |1⟩ component without changing measurement probabilities by itself.`;
  }
  return dominant
    ? `After this operation, the most likely outcome is |${dominant[0]}⟩ at ${(dominant[1] * 100).toFixed(1)}%.`
    : "The state has been updated by the applied gate.";
}

function formatAmplitude(real: number, imag: number) {
  const r = Math.abs(real) < 1e-9 ? 0 : real;
  const i = Math.abs(imag) < 1e-9 ? 0 : imag;
  if (i === 0) return r.toFixed(3);
  if (r === 0) return `${i.toFixed(3)}i`;
  return `${r.toFixed(3)} ${i >= 0 ? "+" : "-"} ${Math.abs(i).toFixed(3)}i`;
}

function ProbabilityBars({ probabilities, compact = false }: { probabilities: Record<string, number>; compact?: boolean }) {
  const entries = Object.entries(probabilities).filter(([, p]) => p > 1e-10);
  const max = Math.max(...entries.map(([, p]) => p), 1e-10);

  if (entries.length === 0) {
    return <p className="text-xs font-mono text-[var(--bp-text-faint)]">No measurable outcomes.</p>;
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {entries.map(([state, probability]) => (
        <div key={state} className="grid grid-cols-[48px_1fr_48px] items-center gap-2">
          <span className="font-mono text-xs text-[var(--bp-text)]">|{state}⟩</span>
          <div className="h-2 rounded-full bg-[var(--bp-border)] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(probability / max) * 100}%`, background: "var(--bp-cyan)", boxShadow: "0 0 10px var(--bp-cyan-dim)" }} />
          </div>
          <span className="font-mono text-[10px] text-right text-[var(--bp-text-dim)]">{(probability * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

interface ResultsPanelProps {
  result: SimulationResult;
  onStepChange?: (step: number, gateIndex: number | null) => void;
  compact?: boolean;
}

export default function ResultsPanel({ result, onStepChange, compact = false }: ResultsPanelProps) {
  const [selectedStep, setSelectedStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const probabilityEntries = Object.entries(result.final_probabilities);
  const nonZeroStates = probabilityEntries.filter(([, p]) => p > 1e-10);
  const stateEntries = Object.entries(result.final_statevector);
  const stepCount = result.steps.length;
  const currentStep = result.steps[selectedStep] ?? result.steps[0];
  const currentProbabilities = currentStep?.state.probabilities ?? result.final_probabilities;
  const currentGate = currentStep?.after_gate ?? null;
  const currentActive = Object.entries(currentProbabilities).filter(([, p]) => p > 1e-10);

  function selectStep(step: number) {
    const safeStep = Math.max(0, Math.min(step, Math.max(stepCount - 1, 0)));
    const selected = result.steps[safeStep];
    setSelectedStep(safeStep);
    onStepChange?.(safeStep, selected?.gate_index ?? null);
  }

  useEffect(() => {
    setPlaying(false);
    setSelectedStep(0);
    onStepChange?.(0, result.steps[0]?.gate_index ?? null);
  }, [result, onStepChange]);

  useEffect(() => {
    if (!playing || stepCount <= 1) return;

    const timer = window.setInterval(() => {
      setSelectedStep((step) => {
        if (step >= stepCount - 1) {
          setPlaying(false);
          return step;
        }
        const next = step + 1;
        onStepChange?.(next, result.steps[next]?.gate_index ?? null);
        return next;
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [playing, stepCount, result.steps, onStepChange]);

  const evolutionDescription = useMemo(
    () => gateExplanation(currentGate, currentProbabilities),
    [currentGate, currentProbabilities],
  );

  const controls = (
    <div className="flex items-center gap-2">
      <button onClick={() => selectStep(selectedStep - 1)} disabled={selectedStep <= 0} aria-label="Previous simulation step" className="w-8 h-8 rounded border border-[var(--bp-border-strong)] text-xs font-mono text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] disabled:opacity-30">‹</button>
      <button onClick={() => setPlaying((value) => !value)} disabled={stepCount <= 1} aria-label={playing ? "Pause simulation replay" : "Play simulation replay"} className="min-w-20 px-3 py-1.5 rounded border border-[var(--bp-border-strong)] text-[10px] font-mono text-[var(--bp-cyan)] hover:border-[var(--bp-cyan)] disabled:opacity-40">
        {playing ? "Ⅱ Pause" : "▶ Play"}
      </button>
      <button onClick={() => selectStep(selectedStep + 1)} disabled={selectedStep >= stepCount - 1} aria-label="Next simulation step" className="w-8 h-8 rounded border border-[var(--bp-border-strong)] text-xs font-mono text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] disabled:opacity-30">›</button>
    </div>
  );

  if (compact) {
    return (
      <section className="bp-panel p-4 lg:p-4 space-y-4 lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] overflow-y-auto bp-scrollbar">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Live simulation</p>
            <p className="text-[10px] font-mono text-[var(--bp-text-faint)] mt-1">Synced with the circuit step-by-step</p>
          </div>
          <span className="text-[10px] font-mono text-[var(--bp-text-faint)] whitespace-nowrap">{result.backend}</span>
        </div>

        <div className="border border-[var(--bp-border)] rounded-md p-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Inspect circuit</p>
              <p className="text-[10px] text-[var(--bp-text-faint)] mt-1">Gate {currentStep?.gate_index == null ? "—" : currentStep.gate_index + 1} · Step {selectedStep} / {Math.max(stepCount - 1, 0)}</p>
            </div>
            {controls}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.steps.map((step) => (
              <button key={step.step} onClick={() => { setPlaying(false); selectStep(step.step); }} className={`px-2 py-1 rounded border text-[9px] font-mono transition-colors ${selectedStep === step.step ? "border-[var(--bp-cyan)] text-[var(--bp-cyan)] bg-[var(--bp-cyan)]/5" : "border-[var(--bp-border)] text-[var(--bp-text-faint)] hover:text-[var(--bp-text-dim)]"}`}>
                {step.step === 0 ? "START" : `GATE ${step.gate_index + 1}`}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-[var(--bp-border)] rounded-md p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Current operation</p>
            <span className="text-[10px] font-mono text-[var(--bp-cyan)]">{gateLabel(currentGate)}</span>
          </div>
          <p className="text-[10px] text-[var(--bp-text-faint)] leading-relaxed">{evolutionDescription}</p>
        </div>

        <div className="border border-[var(--bp-border)] rounded-md p-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">State at step {selectedStep}</p>
              <p className="text-[10px] text-[var(--bp-text-faint)] mt-1">Calculated from the Qiskit Aer statevector</p>
            </div>
            <span className="text-[10px] font-mono text-[var(--bp-cyan)]">{currentActive.length} active</span>
          </div>
          <ProbabilityBars probabilities={currentProbabilities} compact />
        </div>

        <div className="border border-[var(--bp-border)] rounded-md p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Final result</p>
            <span className="text-[10px] font-mono text-[var(--bp-text-faint)]">{nonZeroStates.length} / {probabilityEntries.length} outcomes</span>
          </div>
          <ProbabilityBars probabilities={result.final_probabilities} compact />
          <div className="mt-3 pt-3 border-t border-[var(--bp-border)] space-y-1">
            {stateEntries.filter(([state]) => result.final_probabilities[state] > 1e-10).map(([state, amplitude]) => (
              <div key={state} className="flex items-center justify-between rounded-sm px-2 py-1.5 bg-[var(--bp-bg)] font-mono text-[10px]">
                <span className="text-[var(--bp-text)]">|{state}⟩</span>
                <span className="text-[var(--bp-text-dim)]">{formatAmplitude(amplitude.real, amplitude.imag)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--bp-text-faint)] mt-3 leading-relaxed">{result.explanation}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="bp-panel p-4 sm:p-5 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Simulation results</p>
          <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-1">Calculated from your circuit · {result.backend}</p>
        </div>
        <span className="text-[10px] font-mono text-[var(--bp-text-faint)]">{nonZeroStates.length} / {probabilityEntries.length} outcomes active</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-[var(--bp-border)] rounded-md p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-1">01 · Measurement probabilities</p>
          <p className="text-[11px] text-[var(--bp-text-faint)] mb-4">The probability of obtaining each computational-basis state when the circuit is measured.</p>
          <ProbabilityBars probabilities={result.final_probabilities} />
          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] font-mono text-[var(--bp-cyan)]">View all {probabilityEntries.length} basis states</summary>
            <div className="mt-3 max-h-44 overflow-y-auto bp-scrollbar border border-[var(--bp-border)] rounded-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[var(--bp-border)]">
                {probabilityEntries.map(([state, probability]) => (
                  <div key={state} className="bg-[var(--bp-panel)] px-2 py-1.5 flex justify-between gap-2 font-mono text-[10px]">
                    <span className="text-[var(--bp-text-dim)]">|{state}⟩</span>
                    <span className={probability > 1e-10 ? "text-[var(--bp-cyan)]" : "text-[var(--bp-text-faint)]"}>{(probability * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>

        <div className="border border-[var(--bp-border)] rounded-md p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-1">02 · Final quantum state</p>
          <p className="text-[11px] text-[var(--bp-text-faint)] mb-4">Each amplitude describes the complex contribution of a basis state. Its magnitude squared gives the probability.</p>
          <div className="max-h-44 overflow-y-auto bp-scrollbar space-y-1">
            {stateEntries.filter(([state]) => result.final_probabilities[state] > 1e-10).map(([state, amplitude]) => (
              <div key={state} className="flex items-center justify-between rounded-sm px-2 py-1.5 bg-[var(--bp-bg)] font-mono text-[11px]">
                <span className="text-[var(--bp-text)]">|{state}⟩</span>
                <span className="text-[var(--bp-text-dim)]">{formatAmplitude(amplitude.real, amplitude.imag)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--bp-text-faint)] mt-3 leading-relaxed">{result.explanation}</p>
        </div>
      </div>

      <div className="border border-[var(--bp-border)] rounded-md p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-1">03 · State evolution</p>
            <p className="text-[11px] text-[var(--bp-text-faint)]">Step through the actual simulated state after each operation.</p>
          </div>
          {controls}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {result.steps.map((step) => (
            <button key={step.step} onClick={() => { setPlaying(false); selectStep(step.step); }} className={`px-3 py-1.5 rounded border text-[10px] font-mono transition-colors ${selectedStep === step.step ? "border-[var(--bp-cyan)] text-[var(--bp-cyan)] bg-[var(--bp-cyan)]/5" : "border-[var(--bp-border)] text-[var(--bp-text-faint)] hover:text-[var(--bp-text-dim)]"}`}>
              STEP {step.step}{step.gate_index !== null && step.gate_index !== undefined ? ` · GATE ${step.gate_index + 1}` : ""}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[180px_1fr] gap-4">
          <div className="border border-[var(--bp-border)] rounded-md p-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">Current operation</p>
            <p className="text-sm font-mono text-[var(--bp-text)] mt-2">{gateLabel(currentGate)}</p>
            <p className="text-[10px] text-[var(--bp-text-faint)] mt-3 leading-relaxed">{evolutionDescription}</p>
          </div>
          <div className="border border-[var(--bp-border)] rounded-md p-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)] mb-3">State at step {selectedStep}</p>
            <ProbabilityBars probabilities={currentProbabilities} />
          </div>
        </div>
      </div>
    </section>
  );
}
