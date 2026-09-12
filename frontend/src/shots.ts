// Client-side "shots" sampling. Corkscrew's simulator returns exact
// statevector probabilities; sampling shots from that distribution mirrors
// what a real quantum device / Qiskit Aer `run(shots=...)` measurement would
// produce, without needing an extra backend round trip.

export function sampleShots(probabilities: Record<string, number>, shots: number): Record<string, number> {
  const entries = Object.entries(probabilities).filter(([, p]) => p > 1e-12);
  const counts: Record<string, number> = {};
  for (const [state] of entries) counts[state] = 0;
  if (!entries.length || shots <= 0) return counts;

  const cumulative: [string, number][] = [];
  let acc = 0;
  for (const [state, p] of entries) {
    acc += p;
    cumulative.push([state, acc]);
  }
  const total = acc || 1;

  for (let i = 0; i < shots; i += 1) {
    const r = Math.random() * total;
    let chosen = cumulative[cumulative.length - 1][0];
    for (const [state, cum] of cumulative) {
      if (r <= cum) {
        chosen = state;
        break;
      }
    }
    counts[chosen] += 1;
  }
  return counts;
}

/** Marginalize sampled full-circuit basis-state counts onto a single qubit's 0/1 outcome. */
export function marginalCounts(basisCounts: Record<string, number>, bitPosition: number): Record<"0" | "1", number> {
  let zero = 0;
  let one = 0;
  const mask = 1 << bitPosition;
  for (const [basis, count] of Object.entries(basisCounts)) {
    const value = Number.parseInt(basis, 2);
    if ((value & mask) === 0) zero += count;
    else one += count;
  }
  return { "0": zero, "1": one };
}
