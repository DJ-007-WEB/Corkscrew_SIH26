import { describe, expect, it } from "vitest";
import { circuitToQiskitCode, createEmptyCircuit } from "./circuitBuilderLogic";

describe("circuit builder logic", () => {
  it("creates an empty circuit with the requested number of qubits", () => {
    expect(createEmptyCircuit(3)).toEqual({ qubits: 3, gates: [] });
  });

  it("generates Qiskit code from the circuit IR", () => {
    const code = circuitToQiskitCode({
      qubits: 2,
      gates: [
        { type: "H", targets: [0] },
        { type: "CNOT", targets: [1], controls: [0] },
      ],
    });

    expect(code).toContain("qc = QuantumCircuit(2)");
    expect(code).toContain("qc.h(0)");
    expect(code).toContain("qc.cx(0, 1)");
  });
});
