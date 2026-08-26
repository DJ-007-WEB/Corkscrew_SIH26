import type { Circuit, Gate, GateType } from "./types";

export function addSingleQubitGate(circuit: Circuit, type: Exclude<GateType, "CNOT">, qubit: number, column = circuit.gates.length): Circuit {
  const nextGate: Gate = { type, targets: [qubit] };
  return {
    ...circuit,
    gates: [...circuit.gates.slice(0, column), nextGate, ...circuit.gates.slice(column)],
  };
}

export function addCnotGate(circuit: Circuit, control: number, target: number, column = circuit.gates.length): Circuit {
  if (control === target) return circuit;
  const nextGate: Gate = { type: "CNOT", controls: [control], targets: [target] };
  return {
    ...circuit,
    gates: [...circuit.gates.slice(0, column), nextGate, ...circuit.gates.slice(column)],
  };
}

export function removeGate(circuit: Circuit, index: number): Circuit {
  if (index < 0 || index >= circuit.gates.length) return circuit;
  return {
    ...circuit,
    gates: circuit.gates.filter((_, gateIndex) => gateIndex !== index),
  };
}
