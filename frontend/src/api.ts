import type { Circuit, SimulationResult } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function simulateCircuit(circuit: Circuit): Promise<SimulationResult> {
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(circuit),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Simulation failed (${res.status}): ${detail}`);
  }

  return res.json();
}
