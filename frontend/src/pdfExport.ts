import type { Circuit, SimulationResult } from "./types";

function pdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "?");
}

function text(x: number, y: number, value: string, size = 10, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
}

function dominantState(probabilities: Record<string, number>) {
  const entry = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0];
  return entry ? `|${entry[0]}> (${(entry[1] * 100).toFixed(1)}%)` : "unavailable";
}

function buildContent(circuit: Circuit, code: string, result: SimulationResult | null) {
  const commands: string[] = ["0.08 0.12 0.2 rg", "0 0 612 792 re f", "0.31 0.85 0.94 rg", text(42, 750, "CORKSCREW CIRCUIT REPORT", 18, true), "0.85 0.9 0.94 rg", text(42, 730, `${circuit.qubits}-qubit Qiskit circuit`, 10)];
  commands.push("0.12 0.23 0.36 RG", "0.7 w", "42 708 m 570 708 l S", "0.85 0.9 0.94 rg", text(42, 688, "Circuit diagram", 12, true));

  const startX = 86;
  const colWidth = Math.min(56, 460 / Math.max(circuit.gates.length, 1));
  for (let qubit = 0; qubit < circuit.qubits; qubit += 1) {
    const y = 650 - qubit * 28;
    commands.push("0.55 0.65 0.75 RG", "0.5 w", `${startX} ${y} m ${startX + Math.max(circuit.gates.length, 1) * colWidth} ${y} l S`, "0.85 0.9 0.94 rg", text(48, y - 3, `q[${qubit}]`, 8));
  }
  circuit.gates.forEach((gate, index) => {
    const x = startX + index * colWidth + colWidth / 2;
    if (gate.type === "CNOT" && gate.controls) {
      const controlY = 650 - gate.controls[0] * 28;
      const targetY = 650 - gate.targets[0] * 28;
      commands.push("0.65 0.55 0.98 RG", "1.2 w", `${x} ${Math.min(controlY, targetY)} m ${x} ${Math.max(controlY, targetY)} l S`, `${x} ${controlY} 5 0 360 arc f`, `${x - 8} ${targetY - 8} m ${x + 8} ${targetY + 8} l S`, `${x - 8} ${targetY + 8} m ${x + 8} ${targetY - 8} l S`);
    } else {
      const y = 650 - gate.targets[0] * 28;
      commands.push("0.31 0.85 0.94 RG", "0.8 w", `${x - 12} ${y - 10} 24 20 re S`, "0.85 0.9 0.94 rg", text(x - 7, y - 3, gate.type, 8, true));
    }
  });

  const stateY = 650 - circuit.qubits * 28 - 45;
  commands.push("0.31 0.85 0.94 rg", text(42, stateY, "State change diagram", 12, true));
  const states = result?.steps.map((step) => dominantState(step.state.probabilities)) ?? [];
  const transitions = ["|0...0>", ...circuit.gates.map((gate, index) => `${gate.type} -> ${states[index + 1] ?? "state"}`)];
  let stateLine = transitions.join("   ");
  if (stateLine.length > 105) stateLine = `${stateLine.slice(0, 102)}...`;
  commands.push("0.85 0.9 0.94 rg", text(42, stateY - 20, stateLine, 8));
  commands.push(text(42, stateY - 43, result ? `The simulator tracks the most likely basis state after each operation. Final state: ${dominantState(result.final_probabilities)}.` : "Run the circuit to calculate exact state probabilities for this report.", 8));

  const explanationY = stateY - 75;
  commands.push("0.31 0.85 0.94 rg", text(42, explanationY, "Circuit explanation", 12, true), "0.85 0.9 0.94 rg", text(42, explanationY - 20, "Each gate transforms the quantum state. H creates superposition, X/Y/Z change", 8), text(42, explanationY - 34, "amplitude or phase, and CNOT conditionally flips its target when its control is |1>.", 8));
  commands.push("0.31 0.85 0.94 rg", text(42, explanationY - 66, "Qiskit code", 12, true));
  code.split("\n").slice(0, 20).forEach((line, index) => commands.push("0.85 0.9 0.94 rg", text(42, explanationY - 86 - index * 12, line.slice(0, 95), 7)));
  return commands.join("\n");
}

export function downloadCircuitPdf(circuit: Circuit, code: string, result: SimulationResult | null) {
  const content = buildContent(circuit, code, result);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "corkscrew-circuit-report.pdf";
  link.click();
  URL.revokeObjectURL(url);
}
