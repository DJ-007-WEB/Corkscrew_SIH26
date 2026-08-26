// Shared Circuit IR contract. The backend is authoritative for gate definitions,
// validation and code <-> circuit translation.

export type GateType = "H" | "X" | "Y" | "Z" | "CNOT";
export type GateFamily = "basis" | "pauli" | "multi";

export interface Gate {
  type: GateType;
  targets: number[];
  controls?: number[];
}

export interface Circuit {
  qubits: number;
  gates: Gate[];
}

export interface GateDefinition {
  type: GateType;
  label: string;
  family: GateFamily;
  description: string;
}

export interface CodeRequest {
  code: string;
}

export interface SimulationStep {
  after_gate: Gate | null;
  probabilities: Record<string, number>;
}

export interface SimulationResult {
  steps: SimulationStep[];
  final_probabilities: Record<string, number>;
  explanation: string;
  backend: string;
}
