import { useMemo } from "react";
import type { SimulationStep } from "./types";

const seriesColors = ["#4fd8f0", "#6ee7a8", "#f6c85f", "#f87979", "#b9a7ff", "#ff9f68", "#75a7ff", "#d7e36f"];

function labelForStep(step: SimulationStep): string {
  if (!step.after_gate) return "START";
  const gate = step.after_gate;
  if (gate.type === "CNOT") return `CX q[${gate.controls?.[0] ?? "?"}],q[${gate.targets[0]}]`;
  return `${gate.type} q[${gate.targets[0]}]`;
}

export default function ProbabilityTimeline({
  steps,
  currentStep = 0,
  onStepChange,
}: {
  steps: SimulationStep[];
  currentStep?: number;
  onStepChange?: (step: number) => void;
}) {
  const states = useMemo(() => {
    const set = new Set<string>();
    steps.forEach((step) => Object.keys(step.state.probabilities).forEach((basis) => set.add(basis)));
    return [...set].sort();
  }, [steps]);

  if (!steps.length || !states.length) return null;

  const width = Math.max(640, steps.length * 125);
  const height = 300;
  const plotLeft = 52;
  const plotTop = 24;
  const plotWidth = width - 80;
  const plotHeight = 205;
  const x = (index: number) => plotLeft + (steps.length === 1 ? plotWidth / 2 : (index / (steps.length - 1)) * plotWidth);
  const y = (probability: number) => plotTop + (1 - probability) * plotHeight;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto bp-scrollbar rounded-md border border-[var(--bp-border)] bg-[var(--bp-bg)]">
        <svg width={width} height={height} role="img" aria-label="Measurement probability timeline">
          {[0, 0.25, 0.5, 0.75, 1].map((value) => (
            <g key={value}>
              <line x1={plotLeft} x2={width - 28} y1={y(value)} y2={y(value)} stroke="currentColor" opacity="0.12" />
              <text x={plotLeft - 9} y={y(value) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.55">{value.toFixed(2)}</text>
            </g>
          ))}
          {states.map((basis, stateIndex) => {
            const color = seriesColors[stateIndex % seriesColors.length];
            const points = steps.map((step, index) => `${x(index)},${y(step.state.probabilities[basis] ?? 0)}`).join(" ");
            return (
              <g key={basis}>
                <polyline points={points} fill="none" stroke={color} strokeWidth={currentStep >= 0 ? "2.5" : "2"} opacity="0.85" />
                {steps.map((step, index) => (
                  <circle
                    key={`${basis}-${index}`}
                    cx={x(index)} cy={y(step.state.probabilities[basis] ?? 0)}
                    r={index === currentStep ? 6 : 3.5}
                    fill={color}
                    opacity={index === currentStep ? 1 : 0.78}
                    style={{ cursor: onStepChange ? "pointer" : "default" }}
                    onClick={() => onStepChange?.(index)}
                  />
                ))}
              </g>
            );
          })}
          {steps.map((step, index) => (
            <g key={index} onClick={() => onStepChange?.(index)} style={{ cursor: onStepChange ? "pointer" : "default" }}>
              {index === currentStep && <line x1={x(index)} x2={x(index)} y1={plotTop - 4} y2={plotTop + plotHeight + 7} stroke="var(--bp-cyan)" strokeWidth="1.5" opacity="0.8" />}
              <line x1={x(index)} x2={x(index)} y1={plotTop + plotHeight} y2={plotTop + plotHeight + 7} stroke="currentColor" opacity="0.35" />
              <text x={x(index)} y={plotTop + plotHeight + 24} textAnchor="middle" fontSize="9" fill={index === currentStep ? "var(--bp-cyan)" : "currentColor"} opacity={index === currentStep ? "1" : "0.7"}>{labelForStep(step)}</text>
              <text x={x(index)} y={plotTop + plotHeight + 39} textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.45">Step {index}</text>
            </g>
          ))}
          <line x1={plotLeft} x2={width - 28} y1={plotTop + plotHeight} y2={plotTop + plotHeight} stroke="currentColor" opacity="0.25" />
        </svg>
      </div>
      <div className="flex flex-wrap gap-2 font-mono text-[10px]">
        {states.map((basis, index) => <span key={basis} className="px-2 py-1 rounded border border-[var(--bp-border)]" style={{ color: seriesColors[index % seriesColors.length] }}>|{basis}⟩</span>)}
      </div>
      <p className="text-xs text-[var(--bp-text-faint)] font-mono leading-relaxed">Probabilities are computed from each real Qiskit Aer statevector snapshot. The highlighted step is synchronized with the Bloch sphere and Q sphere.</p>
    </div>
  );
}
