import { FAMILY_COLOR } from "./gates";
import type { GateDefinition, GateType } from "./types";

interface Props {
  definitions: GateDefinition[];
  armedGate: GateType | null;
  onArm: (g: GateType | null) => void;
}

export default function GatePalette({ definitions, armedGate, onArm }: Props) {
  function startDrag(event: React.DragEvent<HTMLButtonElement>, type: GateType) {
    event.dataTransfer.setData("application/x-corkscrew-gate", type);
    event.dataTransfer.effectAllowed = "copy";
    onArm(type);
  }

  return (
    <div className="bp-panel p-4 w-full sm:w-48 shrink-0">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-3">
        Gates
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-2 gap-2">
        {definitions.map((gate) => {
          const color = FAMILY_COLOR[gate.family];
          const active = armedGate === gate.type;
          return (
            <button
              key={gate.type}
              draggable
              title={gate.description}
              onClick={() => onArm(active ? null : gate.type)}
              onDragStart={(event) => startDrag(event, gate.type)}
              className="aspect-square rounded-md flex items-center justify-center font-mono text-sm font-semibold transition-all cursor-grab active:cursor-grabbing"
              style={{
                border: `1.5px solid ${color}`,
                color: active ? "#081527" : color,
                background: active ? color : "transparent",
                boxShadow: active ? `0 0 12px ${color}80` : "none",
              }}
            >
              {gate.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--bp-text-faint)] mt-4 leading-snug">
        {armedGate
          ? `Drag ${armedGate} onto a wire, or click a wire to place it${armedGate === "CNOT" ? " — control first, target second" : ""}.`
          : "Drag a gate onto a qubit wire to place it."}
      </p>
    </div>
  );
}
