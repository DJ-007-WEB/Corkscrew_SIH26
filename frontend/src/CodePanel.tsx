import type { Circuit } from "./types";

function toQasmLine(gate: Circuit["gates"][number]): string {
  switch (gate.type) {
    case "CNOT":
      return `cx q[${gate.controls?.[0]}], q[${gate.targets[0]}];`;
    default:
      return `${gate.type.toLowerCase()} q[${gate.targets[0]}];`;
  }
}

export default function CodePanel({ circuit }: { circuit: Circuit }) {
  const lines = [
    "OPENQASM 3;",
    "include 'stdgates.inc';",
    "",
    `qubit[${circuit.qubits}] q;`,
    `bit[${circuit.qubits}] c;`,
    "",
    ...circuit.gates.map(toQasmLine),
    "",
    ...circuit.qubits > 0
      ? Array.from({ length: circuit.qubits }, (_, i) => `c[${i}] = measure q[${i}];`)
      : [],
  ];

  return (
    <div className="bp-panel p-4 w-full sm:w-72 shrink-0">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)] mb-3">
        Live code
      </p>
      <div className="font-mono text-[12px] leading-6 overflow-x-auto bp-scrollbar">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-3 whitespace-pre">
            <span className="text-[var(--bp-text-faint)] select-none w-4 text-right shrink-0">
              {line ? i + 1 : ""}
            </span>
            <span
              className={
                line.startsWith("OPENQASM") || line.startsWith("include")
                  ? "text-[var(--bp-cyan)]"
                  : line.startsWith("cx") || /^(h|x|y|z) /.test(line)
                    ? "text-[var(--bp-amber)]"
                    : line.startsWith("c[")
                      ? "text-[var(--bp-mint)]"
                      : "text-[var(--bp-text-dim)]"
              }
            >
              {line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
