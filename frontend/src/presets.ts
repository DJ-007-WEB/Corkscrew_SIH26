import type { Circuit } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type BellVariant = "phi_plus" | "phi_minus" | "psi_plus" | "psi_minus";
export type DjOracle = "balanced" | "constant_zero" | "constant_one";
export type TeleportPayload = "zero" | "one" | "plus";

async function getPreset(path: string): Promise<Circuit> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Preset request failed (${res.status})`);
  return res.json();
}

// Local mirrors of backend/app/quantum_engine.py — used only if the API is unreachable.
function localBell(variant: BellVariant): Circuit {
  const gates: Circuit["gates"] = [{ type: "H", targets: [0] }, { type: "CNOT", controls: [0], targets: [1] }];
  if (variant === "phi_minus") gates.push({ type: "Z", targets: [0] });
  if (variant === "psi_plus") gates.push({ type: "X", targets: [1] });
  if (variant === "psi_minus") gates.push({ type: "X", targets: [1] }, { type: "Z", targets: [0] });
  return { qubits: 2, gates };
}

function localDj(n: 1 | 2, oracle: DjOracle): Circuit {
  const gates: Circuit["gates"] = [
    { type: "X", targets: [n] },
    { type: "H", targets: [n] },
    ...Array.from({ length: n + 1 }, (_, q) => ({ type: "H" as const, targets: [q] })),
  ];
  if (oracle === "balanced") {
    for (let c = 0; c < n; c++) gates.push({ type: "CNOT", controls: [c], targets: [n] });
    gates.push({ type: "Z", targets: [n] });
  } else if (oracle === "constant_one") {
    gates.push({ type: "X", targets: [n] });
  }
  for (let q = 0; q < n + 1; q++) gates.push({ type: "H", targets: [q] });
  return { qubits: n + 1, gates };
}

function localGrover(target: string, iterations: 1 | 2): Circuit {
  const cz = (c: number, t: number): Circuit["gates"] => [
    { type: "H", targets: [t] },
    { type: "CNOT", controls: [c], targets: [t] },
    { type: "H", targets: [t] },
  ];
  const oracle = (tgt: string): Circuit["gates"] => {
    const flips = [...tgt].map((b, i) => (b === "0" ? i : -1)).filter((i) => i >= 0);
    return [
      ...flips.map((q) => ({ type: "X" as const, targets: [q] })),
      ...cz(0, 1),
      ...flips.map((q) => ({ type: "X" as const, targets: [q] })),
    ];
  };
  const diffusion: Circuit["gates"] = [
    { type: "H", targets: [0] }, { type: "X", targets: [0] },
    { type: "H", targets: [1] }, { type: "X", targets: [1] },
    ...cz(0, 1),
    { type: "X", targets: [0] }, { type: "H", targets: [0] },
    { type: "X", targets: [1] }, { type: "H", targets: [1] },
  ];
  const gates: Circuit["gates"] = [{ type: "H", targets: [0] }, { type: "H", targets: [1] }];
  // Mirror backend: outcome labels are big-endian, so reverse display target for the oracle.
  const oracleTarget = [...target].reverse().join("");
  for (let k = 0; k < iterations; k++) gates.push(...oracle(oracleTarget), ...diffusion);
  return { qubits: 2, gates };
}

function localTeleport(payload: TeleportPayload): Circuit {
  const gates: Circuit["gates"] = [];
  if (payload === "one") gates.push({ type: "X", targets: [0] });
  if (payload === "plus") gates.push({ type: "H", targets: [0] });
  gates.push(
    { type: "H", targets: [1] },
    { type: "CNOT", controls: [1], targets: [2] },
    { type: "CNOT", controls: [0], targets: [1] },
    { type: "H", targets: [0] },
  );
  return { qubits: 3, gates };
}

export async function fetchBellPreset(variant: BellVariant): Promise<Circuit> {
  try {
    return await getPreset(`/api/presets/bell?variant=${variant}`);
  } catch {
    return localBell(variant);
  }
}

export async function fetchDjPreset(n: 1 | 2, oracle: DjOracle): Promise<Circuit> {
  try {
    return await getPreset(`/api/presets/deutsch-jozsa?n=${n}&oracle=${oracle}`);
  } catch {
    return localDj(n, oracle);
  }
}

export async function fetchGroverPreset(target: string, iterations: 1 | 2): Promise<Circuit> {
  try {
    return await getPreset(`/api/presets/grover?target=${target}&iterations=${iterations}`);
  } catch {
    return localGrover(target, iterations);
  }
}

export async function fetchTeleportPreset(payload: TeleportPayload): Promise<Circuit> {
  try {
    return await getPreset(`/api/presets/teleportation?payload=${payload}`);
  } catch {
    return localTeleport(payload);
  }
}
