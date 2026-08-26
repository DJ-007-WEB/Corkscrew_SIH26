import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import GatePalette from "./GatePalette";
import CodePanel from "./CodePanel";
import ResultsPanel from "./ResultsPanel";
import { FAMILY_COLOR } from "./gates";
import { getGateDefinitions, simulateCircuit, validateCircuit } from "./api";
import { removeGate } from "./circuitBuilderLogic";
import type { Circuit, Gate, GateDefinition, GateType, SimulationResult } from "./types";

const MIN_QUBITS = 1;
const MAX_QUBITS = 8;
const COL_WIDTH = 72;
const WIRE_HEIGHT = 56;
const DRAG_TYPE = "application/x-corkscrew-gate";

function familyColor(definitions: GateDefinition[], type: GateType) {
  const family = definitions.find((definition) => definition.type === type)?.family;
  return family ? FAMILY_COLOR[family] : "var(--bp-cyan)";
}

function gateAt(gates: Gate[], column: number, qubit: number) {
  const gate = gates[column];
  if (!gate) return null;
  if (gate.targets.includes(qubit) || gate.controls?.includes(qubit)) return gate;
  return null;
}

export default function CircuitBuilder() {
  const [circuit, setCircuit] = useState<Circuit>({ qubits: 2, gates: [] });
  const [definitions, setDefinitions] = useState<GateDefinition[]>([]);
  const [armedGate, setArmedGate] = useState<GateType | null>(null);
  const [pendingControl, setPendingControl] = useState<{ qubit: number; column: number } | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [activeGateIndex, setActiveGateIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingGates, setLoadingGates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGateDefinitions()
      .then(setDefinitions)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load gate catalog"))
      .finally(() => setLoadingGates(false));
  }, []);

  const maxColumn = circuit.gates.length;
  const circuitWidth = useMemo(() => 80 + (maxColumn + 1) * COL_WIDTH, [maxColumn]);

  function insertGate(gate: Gate, column: number) {
    setCircuit((current) => ({
      ...current,
      gates: [...current.gates.slice(0, column), gate, ...current.gates.slice(column)],
    }));
    setResult(null);
    setActiveGateIndex(null);
  }

  function placeGate(type: GateType, qubit: number, column: number) {
    setError(null);
    setResult(null);
    setActiveGateIndex(null);

    if (type === "CNOT") {
      if (!pendingControl) {
        setPendingControl({ qubit, column });
        setArmedGate("CNOT");
        return;
      }

      if (pendingControl.column !== column) {
        setError("Place the CNOT target in the same circuit column as its control.");
        return;
      }

      if (pendingControl.qubit === qubit) {
        setPendingControl(null);
        return;
      }

      insertGate({ type: "CNOT", controls: [pendingControl.qubit], targets: [qubit] }, column);
      setPendingControl(null);
      setArmedGate(null);
      return;
    }

    insertGate({ type, targets: [qubit] }, column);
    setArmedGate(null);
    setPendingControl(null);
  }

  function onCellDrop(event: DragEvent<HTMLDivElement>, qubit: number, column: number) {
    event.preventDefault();
    const type = event.dataTransfer.getData(DRAG_TYPE) as GateType;
    if (type) placeGate(type, qubit, column);
  }

  function onCellDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function removeColumn(index: number) {
    setCircuit((current) => removeGate(current, index));
    setPendingControl(null);
    setArmedGate(null);
    setResult(null);
    setActiveGateIndex(null);
  }

  function clearAll() {
    setCircuit((current) => ({ ...current, gates: [] }));
    setPendingControl(null);
    setArmedGate(null);
    setResult(null);
    setActiveGateIndex(null);
    setError(null);
  }

  function addQubit() {
    if (circuit.qubits < MAX_QUBITS) {
      setCircuit((current) => ({ ...current, qubits: current.qubits + 1 }));
      setResult(null);
      setActiveGateIndex(null);
    }
  }

  function removeQubit() {
    const highest = circuit.qubits - 1;
    const inUse = circuit.gates.some(
      (gate) => gate.targets.includes(highest) || gate.controls?.includes(highest),
    );
    if (circuit.qubits > MIN_QUBITS && !inUse) {
      setCircuit((current) => ({ ...current, qubits: current.qubits - 1 }));
      setResult(null);
      setActiveGateIndex(null);
    } else if (inUse) {
      setError(`q[${highest}] is used by a gate. Remove that gate before removing the qubit.`);
    }
  }

  async function handleCodeCircuit(nextCircuit: Circuit) {
    try {
      const validated = await validateCircuit(nextCircuit);
      setCircuit(validated);
      setPendingControl(null);
      setArmedGate(null);
      setResult(null);
      setActiveGateIndex(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid circuit");
    }
  }

  async function run() {
    setLoading(true);
    setError(null);
    setActiveGateIndex(null);
    try {
      const validated = await validateCircuit(circuit);
      setCircuit(validated);
      setResult(await simulateCircuit(validated));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  const handleStepChange = useCallback((_: number, gateIndex: number | null) => {
    setActiveGateIndex(gateIndex);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <GatePalette definitions={definitions} armedGate={armedGate} onArm={setArmedGate} />

        <div className="bp-panel p-4 flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
                Circuit — {circuit.qubits} qubit{circuit.qubits > 1 ? "s" : ""}
              </p>
              <p className="text-[10px] font-mono text-[var(--bp-text-faint)] mt-1">
                Drag a gate onto a wire. Drop CNOT on control, then target in the same column.
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={removeQubit} className="w-6 h-6 rounded border border-[var(--bp-border-strong)] text-[var(--bp-text-dim)] text-sm hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)]">−</button>
              <button onClick={addQubit} className="w-6 h-6 rounded border border-[var(--bp-border-strong)] text-[var(--bp-text-dim)] text-sm hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)]">+</button>
              <button onClick={clearAll} className="text-xs font-mono text-[var(--bp-text-faint)] hover:text-[var(--bp-coral)] ml-2">clear</button>
            </div>
          </div>

          {loadingGates ? (
            <div className="h-24 flex items-center justify-center text-xs font-mono text-[var(--bp-text-faint)]">Loading gate catalog…</div>
          ) : (
            <div className="overflow-x-auto bp-scrollbar pb-2">
              <div className="relative" style={{ minWidth: circuitWidth }}>
                {Array.from({ length: circuit.qubits }, (_, qi) => (
                  <div key={qi} className="flex items-center h-14 relative">
                    <span className="w-16 shrink-0 font-mono text-sm text-[var(--bp-text-dim)]">q[{qi}]</span>
                    <div className="absolute h-px bg-[var(--bp-border-strong)]" style={{ left: 64, right: 0, top: "50%" }} />

                    {Array.from({ length: maxColumn + 1 }, (_, ci) => {
                      const gate = gateAt(circuit.gates, ci, qi);
                      const isOpenSlot = ci === maxColumn;
                      const pending = pendingControl?.column === ci && pendingControl.qubit === qi;
                      const active = activeGateIndex === ci;
                      const gateColor = gate ? familyColor(definitions, gate.type) : "var(--bp-cyan)";

                      return (
                        <div
                          key={`${qi}-${ci}`}
                          onClick={() => {
                            if (armedGate) placeGate(armedGate, qi, ci);
                            else if (gate) removeColumn(ci);
                          }}
                          onDragOver={onCellDragOver}
                          onDrop={(event) => onCellDrop(event, qi, ci)}
                          title={isOpenSlot || !gate ? "Drop a gate here" : "Click to remove this gate"}
                          className="absolute flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--bp-cyan)]/5"
                          style={{ left: 64 + ci * COL_WIDTH, top: 0, width: COL_WIDTH, height: WIRE_HEIGHT }}
                        >
                          {pending && <span className="absolute w-8 h-8 rounded-md border border-dashed border-[var(--bp-violet)] opacity-70" />}
                          {gate && gate.type === "CNOT" && gate.controls?.[0] === qi && (
                            <span
                              className="block w-3 h-3 rounded-full transition-all duration-300"
                              style={{ background: active ? "var(--bp-cyan)" : "var(--bp-violet)", boxShadow: active ? "0 0 14px var(--bp-cyan)" : "none" }}
                            />
                          )}
                          {gate && gate.type === "CNOT" && gate.targets[0] === qi && (
                            <span
                              className="flex items-center justify-center w-7 h-7 rounded-full border-2 font-mono text-xs transition-all duration-300"
                              style={{ borderColor: active ? "var(--bp-cyan)" : "var(--bp-violet)", color: active ? "var(--bp-cyan)" : "var(--bp-violet)", boxShadow: active ? "0 0 14px var(--bp-cyan)" : "none", transform: active ? "scale(1.08)" : "scale(1)" }}
                            >⊕</span>
                          )}
                          {gate && gate.type !== "CNOT" && gate.targets[0] === qi && (
                            <span
                              className="flex items-center justify-center w-8 h-8 rounded-md font-mono text-xs font-semibold transition-all duration-300"
                              style={{ border: `1.5px solid ${active ? "var(--bp-cyan)" : gateColor}`, color: active ? "var(--bp-cyan)" : gateColor, boxShadow: active ? "0 0 14px var(--bp-cyan)" : "none", transform: active ? "scale(1.08)" : "scale(1)" }}
                            >
                              {definitions.find((definition) => definition.type === gate.type)?.label ?? gate.type}
                            </span>
                          )}
                          {!gate && armedGate && <span className="w-8 h-8 rounded-md border border-dashed border-[var(--bp-cyan)] opacity-40" />}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {circuit.gates.map((gate, ci) =>
                  gate.type === "CNOT" && gate.controls ? (
                    <div
                      key={`conn-${ci}`}
                      className="absolute w-px pointer-events-none transition-all duration-300"
                      style={{
                        left: 64 + ci * COL_WIDTH + COL_WIDTH / 2,
                        top: Math.min(gate.controls[0], gate.targets[0]) * WIRE_HEIGHT + WIRE_HEIGHT / 2,
                        height: Math.abs(gate.targets[0] - gate.controls[0]) * WIRE_HEIGHT,
                        background: activeGateIndex === ci ? "var(--bp-cyan)" : "var(--bp-violet)",
                        opacity: activeGateIndex === ci ? 1 : 0.75,
                        boxShadow: activeGateIndex === ci ? "0 0 10px var(--bp-cyan)" : "none",
                      }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          )}

          {pendingControl && <p className="text-xs font-mono text-[var(--bp-violet)] mt-2">Control set on q[{pendingControl.qubit}] — drop or click the target in the highlighted column.</p>}

          <button onClick={run} disabled={loading || circuit.gates.length === 0} className="mt-4 px-5 py-2 rounded-md font-mono text-sm font-medium transition-all disabled:opacity-40" style={{ background: "var(--bp-cyan)", color: "#081527", boxShadow: loading ? "none" : "0 0 16px var(--bp-cyan-dim)" }}>
            {loading ? "Running…" : "▶ Run circuit"}
          </button>
          {error && <p className="text-sm text-[var(--bp-coral)] mt-2">{error}</p>}
        </div>

        <CodePanel circuit={circuit} onCircuitChange={handleCodeCircuit} />
      </div>

      {result && <ResultsPanel result={result} onStepChange={handleStepChange} />}
    </div>
  );
}
