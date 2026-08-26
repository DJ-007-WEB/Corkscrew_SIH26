import { useState } from "react";
import GatePalette from "./GatePalette";
import CodePanel from "./CodePanel";
import HistogramChart from "./HistogramChart";
import { FAMILY_COLOR, GATE_DEFS } from "./gates";
import { simulateCircuit } from "./api";
import type { Circuit, Gate, GateType, SimulationResult } from "./types";

const MIN_QUBITS = 1;
const MAX_QUBITS = 8; // must match backend/app/main.py's qubit cap

function familyOf(type: GateType) {
  return GATE_DEFS.find((g) => g.type === type)!.family;
}

export default function CircuitBuilder() {
  const [qubits, setQubits] = useState(2);
  const [gateColumns, setGateColumns] = useState<Gate[]>([]);
  const [armedGate, setArmedGate] = useState<GateType | null>(null);
  const [pendingControl, setPendingControl] = useState<number | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const circuit: Circuit = { qubits, gates: gateColumns };

  function placeGate(qubitIndex: number) {
    if (!armedGate) return;
    setResult(null);

    if (armedGate === "CNOT") {
      if (pendingControl === null) {
        setPendingControl(qubitIndex);
        return;
      }
      if (pendingControl === qubitIndex) {
        setPendingControl(null); // clicked same wire twice — cancel
        return;
      }
      setGateColumns((cols) => [
        ...cols,
        { type: "CNOT", controls: [pendingControl], targets: [qubitIndex] },
      ]);
      setPendingControl(null);
      setArmedGate(null);
      return;
    }

    setGateColumns((cols) => [...cols, { type: armedGate, targets: [qubitIndex] }]);
    setArmedGate(null);
  }

  function removeColumn(index: number) {
    setGateColumns((cols) => cols.filter((_, i) => i !== index));
    setResult(null);
  }

  function clearAll() {
    setGateColumns([]);
    setPendingControl(null);
    setArmedGate(null);
    setResult(null);
    setError(null);
  }

  function addQubit() {
    if (qubits < MAX_QUBITS) setQubits((q) => q + 1);
  }

  function removeQubit() {
    const highest = qubits - 1;
    const inUse = gateColumns.some(
      (g) => g.targets.includes(highest) || g.controls?.includes(highest)
    );
    if (qubits > MIN_QUBITS && !inUse) setQubits((q) => q - 1);
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await simulateCircuit(circuit));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  const colWidth = 64;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <GatePalette armedGate={armedGate} onArm={setArmedGate} />

        <div className="bp-panel p-4 flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
              Circuit — {qubits} qubit{qubits > 1 ? "s" : ""}
            </p>
            <div className="flex gap-2 items-center">
              <button
                onClick={removeQubit}
                className="w-6 h-6 rounded border border-[var(--bp-border-strong)] text-[var(--bp-text-dim)] text-sm hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)]"
              >
                −
              </button>
              <button
                onClick={addQubit}
                className="w-6 h-6 rounded border border-[var(--bp-border-strong)] text-[var(--bp-text-dim)] text-sm hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)]"
              >
                +
              </button>
              <button
                onClick={clearAll}
                className="text-xs font-mono text-[var(--bp-text-faint)] hover:text-[var(--bp-coral)] ml-2"
              >
                clear
              </button>
            </div>
          </div>

          <div className="overflow-x-auto bp-scrollbar pb-2">
            <div
              className="relative"
              style={{ minWidth: 90 + (gateColumns.length + 1) * colWidth }}
            >
              {Array.from({ length: qubits }, (_, qi) => (
                <div key={qi} className="flex items-center h-14 relative">
                  <span className="w-16 shrink-0 font-mono text-sm text-[var(--bp-text-dim)]">
                    q[{qi}]
                  </span>
                  <div
                    className="absolute h-px bg-[var(--bp-border-strong)]"
                    style={{
                      left: 64,
                      right: 0,
                      top: "50%",
                    }}
                  />
                  {/* click targets — one per existing column, plus one open slot */}
                  {Array.from({ length: gateColumns.length + 1 }, (_, ci) => {
                    const gate = gateColumns[ci];
                    const involvesThisQubit =
                      gate && (gate.targets.includes(qi) || gate.controls?.includes(qi));
                    const isOpenSlot = ci === gateColumns.length;

                    return (
                      <button
                        key={ci}
                        onClick={() =>
                          isOpenSlot ? placeGate(qi) : gate && removeColumn(ci)
                        }
                        title={
                          isOpenSlot
                            ? armedGate
                              ? `Place ${armedGate}`
                              : undefined
                            : "Click to remove"
                        }
                        className="absolute flex items-center justify-center"
                        style={{
                          left: 64 + ci * colWidth + colWidth / 2 - 18,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 36,
                          height: 36,
                        }}
                      >
                        {involvesThisQubit && gate ? (
                          gate.type === "CNOT" ? (
                            gate.controls?.[0] === qi ? (
                              <span
                                className="block w-3 h-3 rounded-full"
                                style={{ background: "var(--bp-violet)" }}
                              />
                            ) : (
                              <span
                                className="flex items-center justify-center w-7 h-7 rounded-full border-2 font-mono text-xs"
                                style={{ borderColor: "var(--bp-violet)", color: "var(--bp-violet)" }}
                              >
                                ⊕
                              </span>
                            )
                          ) : (
                            <span
                              className="flex items-center justify-center w-8 h-8 rounded-md border-1.5 font-mono text-xs font-semibold"
                              style={{
                                borderColor: FAMILY_COLOR[familyOf(gate.type)],
                                color: FAMILY_COLOR[familyOf(gate.type)],
                                borderWidth: 1.5,
                              }}
                            >
                              {gate.type}
                            </span>
                          )
                        ) : isOpenSlot && armedGate ? (
                          <span className="w-8 h-8 rounded-md border border-dashed border-[var(--bp-cyan)] opacity-40" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* CNOT vertical connectors */}
              {gateColumns.map((g, ci) =>
                g.type === "CNOT" && g.controls ? (
                  <div
                    key={`conn-${ci}`}
                    className="absolute w-px"
                    style={{
                      left: 64 + ci * colWidth + colWidth / 2,
                      top: Math.min(g.controls[0], g.targets[0]) * 56 + 28,
                      height: Math.abs(g.targets[0] - g.controls[0]) * 56,
                      background: "var(--bp-violet)",
                      opacity: 0.7,
                    }}
                  />
                ) : null
              )}
            </div>
          </div>

          {pendingControl !== null && (
            <p className="text-xs font-mono text-[var(--bp-violet)] mt-2">
              Control set on q[{pendingControl}] — click the target qubit.
            </p>
          )}

          <button
            onClick={run}
            disabled={loading || gateColumns.length === 0}
            className="mt-4 px-5 py-2 rounded-md font-mono text-sm font-medium transition-all disabled:opacity-40"
            style={{
              background: "var(--bp-cyan)",
              color: "#081527",
              boxShadow: loading ? "none" : "0 0 16px var(--bp-cyan-dim)",
            }}
          >
            {loading ? "Running…" : "▶ Run circuit"}
          </button>
          {error && <p className="text-sm text-[var(--bp-coral)] mt-2">{error}</p>}
        </div>

        <CodePanel circuit={circuit} />
      </div>

      {result && (
        <div className="grid sm:grid-cols-2 gap-4">
          <HistogramChart probabilities={result.final_probabilities} />
          <div className="bp-panel p-4">
            <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-3">
              AI explanation
            </p>
            <p className="text-sm text-[var(--bp-text)] leading-relaxed">{result.explanation}</p>
            <p className="text-[11px] font-mono text-[var(--bp-text-faint)] mt-3">
              backend: {result.backend}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
