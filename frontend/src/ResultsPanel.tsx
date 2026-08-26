import { useEffect, useMemo, useState } from "react";
import type { Gate, SimulationResult } from "./types";

function gateLabel(gate: Gate | null) {
  if (!gate) return "Initial state";
  if (gate.type === "CNOT") return `CNOT q[${gate.controls?.[0]}] → q[${gate.targets[0]}]`;
  return `${gate.type} q[${gate.targets[0]}]`;
}

function gateExplanation(gate: Gate | null, probabilities: Record<string, number>) {
  if (!gate) return "This is the starting state before any quantum gate is applied.";
  const active = Object.entries(probabilities).filter(([, p]) => p > 1e-10).length;
  const dominant = Object.entries(probabilities).sort(([, a], [, b]) => b - a)[0];

  if (gate.type === "H") {
    return `Hadamard was applied to q[${gate.targets[0]}]. The simulated state now has ${active} measurable basis state${active === 1 ? "" : "s"}.`;
  }
  if (gate.type === "CNOT") {
    return `CNOT used q[${gate.controls?.[0]}] as the control and q[${gate.targets[0]}] as the target. The result above is the state produced by that controlled operation.`;
  }
  if (gate.type === "X") {
    return `Pauli-X was applied to q[${gate.targets[0]}], flipping its computational basis component. The probabilities shown are calculated from the resulting state.`;
  }
  if (gate.type === "Y") {
    return `Pauli-Y was applied to q[${gate.targets[0]}]. It changes both the basis and phase components of the qubit.`;
  }
  if (gate.type === "Z") {
    return `Pauli-Z was applied to q[${gate.targets[0]}]. It changes the phase of the |1⟩ component without changing measurement probabilities by itself.`;
  }
  return dominant
    ? `After this operation, the most likely outcome is |${dominant[0]}⟩ at ${(dominant[1] * 100).toFixed(1)}%.`
    : "The state has been updated by the applied gate.";
}

function formatAmplitude(real: number, imag: number) {
  const r = Math.abs(real) < 1e-9 ? 0 : real;
  const i = Math.abs(imag) < 1e-9 ? 0 : imag;
  if (i === 0) return r.toFixed(3);
  if (r === 0) return `${i.toFixed(3)}i`;
  return `${r.toFixed(3)} ${i >= 0 ? "+" : "−