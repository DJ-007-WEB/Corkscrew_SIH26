import type { Gate, SimulationResult } from "./types";

function gateLabel(gate: Gate | null) {
  if (!gate) return "Initial state";
  if (gate.type === "CNOT") return `CNOT q[${gate.controls?.[0]}] → q[${gate.targets[0]}]`;
  return `${gate.type} q[${gate.targets[0]}]`;
}

function formatAmplitude(real: number, imag: number) {
  const r = Math.abs(real) < 1e-9 ? 0 : real;
  const i = Math.abs(imag) < 1e-9 ? 0 : imag;
  if (i === 0) return r.toFixed(3);
  if (r === 0) return `${i.toFixed(3)}i`;
  return `${r.toFixed(3)} ${i >= 0 ? "+" : "−"} ${Math.abs(i).toFixed(3)}i`;
}

function ProbabilityBars({ probabilities }: { probabilities: Record<string, number> }) {
  const entries = Object.entries(probabilities).filter(([, p]) => p > 1e-10);
  const max = Math.max(...entries.map(([, p]) => p), 1e-10);

  if (entries.length === 0) {
    return <p className="text-xs font-mono text-[var(--bp-text-faint)]">No measurable outcomes.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([state, probability]) => (
        <div key={state} className="grid grid-cols-[52px_1fr_52px] items-center gap-3">
          <span className="font-mono text-xs text-[var(--bp-text)]">|{state}⟩</span>
          <div className="h-2 rounded-full bg-[var(--bp-border)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(probability / max) * 100}%`,
                background: "var(--bp-cyan)",
                boxShadow: "0 0 10px var(--bp-cyan-dim)",
              }}
            />
          </div>
          <span className="font-mono text-xs text-right text-[var(--bp-text-dim)]">
            {(probability * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ResultsPanel({ result }: { result: SimulationResult }) {
  const probabilityEntries = Object.entries(result.final_probabilities);
  const nonZeroStates = probabilityEntries.filter(([, p]) => p > 1e-10);
  const stateEntries = Object.entries(result.final_statevector);

  return (
    <section className="bp-panel p-4 sm:p-5 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Simulation results</p>
          <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-1">
            Calculated from your circuit · {result.backend}
          </p>
        </div>
        <span className="text-[10px] font-mono text-[var(--bp-text-faint)]">
          {nonZeroStates.length} / {probabilityEntries.length} outcomes active
        </span>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-[var(--bp-border)] rounded-md p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-1">
            01 · Measurement probabilities
          </p>
          <p className="text-[11px] text-[var(--bp-text-faint)] mb-4">
            The probability of obtaining each computational-basis state when the circuit is measured.
          </p>
          <ProbabilityBars probabilities={result.final_probabilities} />

          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] font-mono text-[var(--bp-cyan)]">
              View all {probabilityEntries.length} basis states
            </summary>
            <div className="mt-3 max-h-44 overflow-y-auto bp-scrollbar border border-[var(--bp-border)] rounded-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[var(--bp-border)]">
                {probabilityEntries.map(([state, probability]) => (
                  <div key={state} className="bg-[var(--bp-panel)] px-2 py-1.5 flex justify-between gap-2 font-mono text-[10px]">
                    <span className="text-[var(--bp-text-dim)]">|{state}⟩</span>
                    <span className={probability > 1e-10 ? "text-[var(--bp-cyan)]" : "text-[var(--bp-text-faint)]"}>
                      {(probability * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>

        <div className="border border-[var(--bp-border)] rounded-md p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-1">
            02 · Final quantum state
          </p>
          <p className="text-[11px] text-[var(--bp-text-faint)] mb-4">
            Each amplitude describes the complex contribution of a basis state. Its magnitude squared gives the probability.
          </p>
          <div className="max-h-44 overflow-y-auto bp-scrollbar space-y-1">
            {stateEntries.filter(([state]) => result.final_probabilities[state] > 1e-10).map(([state, amplitude]) => (
              <div key={state} className="flex items-center justify-between rounded-sm px-2 py-1.5 bg-[var(--bp-bg)] font-mono text-[11px]">
                <span className="text-[var(--bp-text)]">|{state}⟩</span>
                <span className="text-[var(--bp-text-dim)]">{formatAmplitude(amplitude.real, amplitude.imag)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--bp-text-faint)] mt-3 leading-relaxed">
            {result.explanation}
          </p>
        </div>
      </div>

      <div className="border border-[var(--bp-border)] rounded-md p-4">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-1">
          03 · State evolution
        </p>
        <p className="text-[11px] text-[var(--bp-text-faint)] mb-4">
          Each step is the actual simulated state after the corresponding gate, so you can see how the circuit changes the system.
        </p>

        <div className="space-y-2">
          {result.steps.map((step) => {
            const active = Object.entries(step.state.probabilities).filter(([, p]) => p > 1e-10);
            return (
              <div key={step.step} className="flex gap-3 items-start">
                <div className="w-7 h-7 shrink-0 rounded-full border border-[var(--bp-border-strong)] flex items-center justify-center font-mono text-[10px] text-[var(--bp-cyan)]">
                  {step.step}
                </div>
                <div className="flex-1 min-w-0 border border-[var(--bp-border)] rounded-md px-3 py-2">
                  <p className="text-xs font-mono text-[var(--bp-text)]">{gateLabel(step.after_gate)}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {active.map(([state, probability]) => (
                      <span key={state} className="text-[10px] font-mono text-[var(--bp-text-dim)]">
                        |{state}⟩ {(probability * 100).toFixed(1)}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
