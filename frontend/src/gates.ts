import type { GateType } from "./types";

export interface GateDef {
  type: GateType;
  label: string;
  family: "basis" | "pauli" | "multi";
  description: string;
}

export const GATE_DEFS: GateDef[] = [
  { type: "H", label: "H", family: "basis", description: "Hadamard — creates superposition" },
  { type: "X", label: "X", family: "pauli", description: "Pauli-X — bit flip" },
  { type: "Y", label: "Y", family: "pauli", description: "Pauli-Y — bit + phase flip" },
  { type: "Z", label: "Z", family: "pauli", description: "Pauli-Z — phase flip" },
  { type: "CNOT", label: "CX", family: "multi", description: "Controlled-NOT — entangles two qubits" },
];

export const FAMILY_COLOR: Record<GateDef["family"], string> = {
  basis: "var(--bp-amber)",
  pauli: "var(--bp-coral)",
  multi: "var(--bp-violet)",
};
