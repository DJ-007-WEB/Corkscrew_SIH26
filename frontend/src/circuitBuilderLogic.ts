import type { Circuit, Gate, GateType } from "./types";

export const SUPPORTED_GATES: GateType[] = ["H", "X", "Y", "Z", "CNOT"];

export function createEmptyCircuit(qubits = 2): Circuit {
  return { qubits, gates: [] };
}

export function cloneCircuit(circuit: Circuit): Circuit {
  return {
    qubits: circuit.qubits,
    gates: circuit.gates.map((gate) => ({
      ...gate,
      targets: [...gate.targets],
      controls: gate.controls ? [...gate.controls] : undefined,
    })),
  };
}

export function addSingleQubitGate(circuit: Circuit, type: Exclude<GateType, "CNOT">, qubit: number): Circuit {
  const next = cloneCircuit(circuit);
  next.gates.push({ type, targets: [qubit] });
  return next;
}

export function addCnotGate(circuit: Circuit, control: number, target: number): Circuit {
  if (control === target) return circuit;
  const next = cloneCircuit(circuit);
  next.gates.push({ type: "CNOT", targets: [target], controls: [control] });
  return next;
}

export function removeGate(circuit: Circuit, index: number): Circuit {
  if (index < 0 || index >= circuit.gates.length) return circuit;
  const next = cloneCircuit(circuit);
  next.gates.splice(index, 1);
  return next;
}

export function moveGate(circuit: Circuit, from: number, to: number): Circuit {
  if (from < 0 || from >= circuit.gates.length || to < 0 || to >= circuit.gates.length || from === to) {
    return circuit;
  }

  const next = cloneCircuit(circuit);
  const [gate] = next.gates.splice(from, 1);
  next.gates.splice(to, 0, gate);
  return next;
}

export function gateLabel(gate: Gate): string {
  if (gate.type === "CNOT") {
    return `CNOT q${gate.controls?.[0] ?? "?"} → q${gate.targets[0] ?? "?"}`;
  }
  return `${gate.type} q${gate.targets[0] ?? "?"}`;
}

export function circuitToQiskitCode(circuit: Circuit): string {
  const lines = [
    "from qiskit import QuantumCircuit",
    "",
    `qc = QuantumCircuit(${circuit.qubits})`,
    "",
  ];

  circuit.gates.forEach((gate) => {
    if (gate.type === "CNOT") {
      const control = gate.controls?.[0];
      const target = gate.targets[0];
      if (control !== undefined && target !== undefined) {
        lines.push(`qc.cx(${control}, ${target})`);
      }
      return;
    }

    const target = gate.targets[0];
    if (target === undefined) return;
    lines.push(`qc.${gate.type.toLowerCase()}(${target})`);
  });

  lines.push("", "print(qc)");
  return lines.join("\n");
}

export function parseSupportedQiskitCode(source: string): Circuit {
  const circuitMatch = source.match(/QuantumCircuit\s*\(\s*(\d+)\s*\)/);
  if (!circuitMatch) {
    throw new Error("Create a circuit with QuantumCircuit(n) before adding gates.");
  }

  const qubits = Number(circuitMatch[1]);
  if (!Number.isInteger(qubits) || qubits < 1 || qubits > 8) {
    throw new Error("The playground supports between 1 and 8 qubits.");
  }

  const circuit: Circuit = createEmptyCircuit(qubits);
  const lines = source.split(/\r?\n/);
  const allowed = new Set(SUPPORTED_GATES.map((gate) => gate.toLowerCase()));

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line || line.startsWith("from ") || line.startsWith("import ") || line.startsWith("qc =") || line === "print(qc)") {
      continue;
    }

    const cnot = line.match(/^qc\.cx\(\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (cnot) {
      const control = Number(cnot[1]);
      const target = Number(cnot[2]);
      if (control >= qubits || target >= qubits) throw new Error(`CNOT references a qubit outside q0–q${qubits - 1}.`);
      if (control === target) throw new Error("CNOT control and target must be different qubits.");
      circuit.gates.push({ type: "CNOT", controls: [control], targets: [target] });
      continue;
    }

    const single = line.match(/^qc\.(h|x|y|z)\(\s*(\d+)\s*\)$/i);
    if (single && allowed.has(single[1].toLowerCase())) {
      const type = single[1].toUpperCase() as Exclude<GateType, "CNOT">;
      const target = Number(single[2]);
      if (target >= qubits) throw new Error(`${type} references a qubit outside q0–q${qubits - 1}.`);
      circuit.gates.push({ type, targets: [target] });
      continue;
    }

    throw new Error(`Unsupported code: ${line}`);
  }

  return circuit;
}
