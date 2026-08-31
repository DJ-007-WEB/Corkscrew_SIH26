// Shared Circuit IR contract. The backend is authoritative for gate definitions,
// validation, code <-> circuit translation and simulation results.

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

export interface ComplexAmplitude {
  real: number;
  imag: number;
}

export interface StateSnapshot {
  statevector: Record<string, ComplexAmplitude>;
  probabilities: Record<string, number>;
}

export interface SimulationStep {
  step: number;
  gate_index?: number | null;
  after_gate: Gate | null;
  state: StateSnapshot;
}

export interface SimulationResult {
  steps: SimulationStep[];
  final_statevector: Record<string, ComplexAmplitude>;
  final_probabilities: Record<string, number>;
  explanation: string;
  backend: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GroundedFact {
  name: string;
  value: string;
}

export interface TutorResponse {
  answer: string;
  mode: "grounded" | "conceptual";
  tools_used: string[];
  facts: GroundedFact[];
  provider: string;
  recommendation?: string | null;
}
