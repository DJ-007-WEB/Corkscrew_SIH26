// Shared circuit IR contract — this is the JSON shape both the drag-and-drop
// builder and the code editor must compile to before hitting the backend.
// Backend team: this is the contract /api/simulate expects and returns.
// Keep this file in sync with backend/app/schemas.py.

export type GateType = "H" | "X" | "Y" | "Z" | "CNOT";

export interface Gate {
  type: GateType;
  targets: number[];
  controls?: number[];
}

export interface Circuit {
  qubits: number;
  gates: Gate[];
}

export interface SimulationStep {
  after_gate: Gate | null; // null = initial state, before any gate
  probabilities: Record<string, number>; // e.g. { "00": 0.5, "11": 0.5 }
}

export interface SimulationResult {
  steps: SimulationStep[];
  final_probabilities: Record<string, number>;
  explanation: string;
  backend: string; // "mock" until Qiskit is wired in, then "qiskit-aer"
}
