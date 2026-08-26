import { GATE_DEFS, FAMILY_COLOR } from "./gates";
import type { GateType } from "./types";

interface Props {
  armedGate: GateType | null;
  onArm: (g: GateType | null) => void;
}

export default function GatePalette({ armedGate, onArm }: Props) {
  return (
    <div className="bp-panel p-4 w-full sm:w-48 shrink-0">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-3">
        Gates
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-2 gap-2">
        {GATE_DEFS.map((g) => {
          const color = FAMILY_COLOR[g.family];
          const active = armedGate === g.type;
          return (
            <button
              key={g.type}
              title={g.description}
              onClick={() => onArm(active ? null : g.type)}
              className="aspect-square rounded-md flex items-center justify-center font-mono text-sm font-semibold transition-all"
              style={{
                border: `1.5px solid ${color}`,
                color: active ? "#081527" : color,
                background: active ? color : "transparent",
                boxShadow: active ? `0 0 12px ${color}80` : "none",
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--bp-text-faint)] mt-4 leading-snug">
        {armedGate
          ? `Click a qubit wire to place ${armedGate}${armedGate === "CNOT" ? " (control, then target)" : ""}.`
          : "Select a gate, then click a wire to place it."}
      </p>
    </div>
  );
}
