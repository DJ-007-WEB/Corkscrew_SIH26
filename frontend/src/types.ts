// Shared Circuit IR contract. The backend is authoritative for gate definitions,
// validation, code <-> circuit translation and simulation results.

export type GateType = "H" | "X" | "Y" | "Z" | "S" | "T" | "RX" | "RY" | "RZ" | "CNOT" | "CZ" | "SWAP";
export type GateFamily = "basis" | "pauli" | "phase" | "rotation" | "multi";

export interface Gate {
  type: GateType;
  targets: number[];
  controls?: number[];
  params?: number[];
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

export type BackendId = "qiskit_aer" | "pennylane" | "cirq"; // "qbraid" disabled server-side, see backend/app/backends.py

export interface BackendInfo {
  id: BackendId;
  label: string;
  description: string;
  available: boolean;
  unavailable_reason?: string | null;
}

export interface CircuitIssue {
  gate_index: number | null;
  message: string;
  suggestion: string;
}

export interface CircuitDiagnosis {
  valid: boolean;
  issues: CircuitIssue[];
  fixed_circuit: Circuit | null;
}

export interface SavedWork {
  id: string;
  title: string;
  code: string;
  created_at: string;
  updated_at: string;
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
