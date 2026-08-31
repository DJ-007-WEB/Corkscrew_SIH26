import { useState } from "react";
import { simulateCircuit } from "./api";
import type { Circuit, SimulationResult } from "./types";

const BELL_STATE_CIRCUIT: Circuit = {
  qubits: 2,
  gates: [
    { type: "H", targets: [0] },
    { type: "CNOT", controls: [0], targets: [1] },
  ],
};

function ProbabilityBars({ probabilities }: { probabilities: Record<string, number> }) {
  const entries = Object.entries(probabilities).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="space-y-2">
      {entries.map(([state, prob]) => (
        <div key={state} className="flex items-center gap-3 text-sm">
          <span className="w-14 font-mono text-slate-300">|{state}⟩</span>
          <div className="flex-1 h-4 rounded bg-[var(--color-accent-soft)] overflow-hidden">
            <div
              className="h-full rounded bg-[var(--color-accent)] transition-all"
              style={{ width: `${prob * 100}%` }}
            />
          </div>
          <span className="w-14 text-right text-slate-400">{(prob * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function BellStateDemo() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDemo() {
    setLoading(true);
    setError(null);
    try {
      const res = await simulateCircuit(BELL_STATE_CIRCUIT);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Milestone 1 — Bell State</h2>
          <p className="text-sm text-slate-400">H(q0) → CNOT(q0, q1) → measure</p>
        </div>
        <button
          onClick={runDemo}
          disabled={loading}
          className="px-4 py-2 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Running…" : "Run circuit"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400 mb-3">
          {error} — is the backend running at http://localhost:8000?
        </p>
      )}

      {result && (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Step by step</h3>
            <div className="space-y-3">
              {result.steps.map((step, i) => (
                <div key={i} className="border-l-2 border-[var(--color-accent-soft)] pl-3">
                  <p className="text-xs text-slate-500 mb-1">
                    {step.after_gate
                      ? `After ${step.after_gate.type} on q${step.after_gate.targets.join(",")}`
                      : "Initial state"}
                  </p>
                  <ProbabilityBars probabilities={step.state.probabilities} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">AI explanation</h3>
            <p className="text-sm text-slate-300 bg-[var(--color-accent-soft)]/40 rounded-md p-3">
              {result.explanation}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              backend: <span className="font-mono">{result.backend}</span>
              {result.backend === "mock" && " — swap in Qiskit Aer in backend/app/quantum_engine.py"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
