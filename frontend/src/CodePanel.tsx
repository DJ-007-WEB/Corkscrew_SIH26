import { useEffect, useState } from "react";
import { circuitFromCode, circuitToCode } from "./api";
import type { Circuit } from "./types";

interface Props {
  circuit: Circuit;
  onCircuitChange: (circuit: Circuit) => void;
}

export default function CodePanel({ circuit, onCircuitChange }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    circuitToCode(circuit)
      .then((nextCode) => {
        if (!cancelled) {
          setCode(nextCode);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not generate code");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [circuit.qubits, circuit.gates]);

  async function applyCode() {
    setApplying(true);
    setError(null);
    try {
      const nextCircuit = await circuitFromCode(code);
      onCircuitChange(nextCircuit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build circuit from code");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="bp-panel p-4 w-full sm:w-80 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
          Code builder
        </p>
        <span className="text-[10px] font-mono text-[var(--bp-text-faint)]">QISKIT</span>
      </div>

      <textarea
        value={loading ? "Generating from circuit…" : code}
        onChange={(event) => setCode(event.target.value)}
        disabled={loading || applying}
        spellCheck={false}
        aria-label="Qiskit circuit code"
        className="w-full min-h-64 resize-y rounded-md border border-[var(--bp-border)] bg-[var(--bp-ink)] px-3 py-3 font-mono text-[12px] leading-6 text-[var(--bp-text)] outline-none focus:border-[var(--bp-cyan)] bp-scrollbar"
      />

      <div className="flex items-center justify-between gap-3 mt-3">
        <p className="text-[10px] text-[var(--bp-text-faint)] leading-relaxed">
          Supported: QuantumCircuit, H, X, Y, Z and CNOT.
        </p>
        <button
          onClick={applyCode}
          disabled={loading || applying || !code.trim()}
          className="shrink-0 px-3 py-2 rounded-md font-mono text-xs font-medium disabled:opacity-40"
          style={{ background: "var(--bp-cyan)", color: "#081527" }}
        >
          {applying ? "Building…" : "Build circuit"}
        </button>
      </div>

      {error && <p className="text-xs text-[var(--bp-coral)] mt-2 leading-relaxed">{error}</p>}
    </div>
  );
}
