"""
Quantum engine — numpy statevector simulator.

This gives CORRECT results for H/X/Y/Z/CNOT circuits (small qubit counts,
per the roadmap's 6-8 qubit cap) without depending on Qiskit, so frontend
and backend work can proceed in parallel before Qiskit is wired in.

TODO (AIML 2 — Quantum Intelligence): replace the body of `run_circuit`
with a real Qiskit Aer call. Keep the function signature and the
SimulationResult shape identical so nothing else in the app has to change —
that's the whole point of the seam. Set `backend="qiskit-aer"` once swapped.
"""

import numpy as np

from .schemas import Circuit, Gate, SimulationResult, SimulationStep

_H = (1 / np.sqrt(2)) * np.array([[1, 1], [1, -1]], dtype=complex)
_X = np.array([[0, 1], [1, 0]], dtype=complex)
_Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
_Z = np.array([[1, 0], [0, -1]], dtype=complex)

_SINGLE_QUBIT_GATES = {"H": _H, "X": _X, "Y": _Y, "Z": _Z}


def _single_qubit_full_matrix(gate_matrix: np.ndarray, qubit: int, n: int) -> np.ndarray:
    ops = [np.eye(2, dtype=complex)] * n
    ops[qubit] = gate_matrix
    full = ops[0]
    for op in ops[1:]:
        full = np.kron(full, op)
    return full


def _cnot_full_matrix(control: int, target: int, n: int) -> np.ndarray:
    dim = 2**n
    mat = np.zeros((dim, dim), dtype=complex)
    for i in range(dim):
        bits = list(format(i, f"0{n}b"))  # qubit 0 = leftmost bit
        if bits[control] == "1":
            bits[target] = "0" if bits[target] == "1" else "1"
        j = int("".join(bits), 2)
        mat[j, i] = 1
    return mat


def _gate_matrix(gate: Gate, n: int) -> np.ndarray:
    if gate.type == "CNOT":
        if not gate.controls:
            raise ValueError("CNOT requires a control qubit")
        return _cnot_full_matrix(gate.controls[0], gate.targets[0], n)
    return _single_qubit_full_matrix(_SINGLE_QUBIT_GATES[gate.type], gate.targets[0], n)


def _probabilities(state: np.ndarray, n: int) -> dict[str, float]:
    probs = {}
    for i, amplitude in enumerate(state):
        p = float(abs(amplitude) ** 2)
        if p > 1e-9:
            probs[format(i, f"0{n}b")] = round(p, 6)
    return probs


def _explain(circuit: Circuit, final_probs: dict[str, float]) -> str:
    """Placeholder explanation. Replace with the grounded AI explainer
    (Section 4 of the roadmap): feed final_probs + gate sequence to the
    LLM and let it narrate ONLY from this structured data."""
    gate_types = [g.type for g in circuit.gates]
    if gate_types == ["H", "CNOT"] and len(final_probs) == 2:
        return (
            "This is a Bell state: the H gate puts qubit 0 into superposition, "
            "then the CNOT entangles it with qubit 1. Measuring one qubit "
            "instantly determines the other — that's quantum entanglement."
        )
    return (
        f"Circuit with {len(circuit.gates)} gate(s) on {circuit.qubits} qubit(s). "
        "Wire in the grounded AI explainer to replace this placeholder text."
    )


def run_circuit(circuit: Circuit) -> SimulationResult:
    n = circuit.qubits
    state = np.zeros(2**n, dtype=complex)
    state[0] = 1.0  # |00...0>

    steps = [SimulationStep(after_gate=None, probabilities=_probabilities(state, n))]

    for gate in circuit.gates:
        matrix = _gate_matrix(gate, n)
        state = matrix @ state
        steps.append(SimulationStep(after_gate=gate, probabilities=_probabilities(state, n)))

    final_probs = _probabilities(state, n)

    return SimulationResult(
        steps=steps,
        final_probabilities=final_probs,
        explanation=_explain(circuit, final_probs),
        backend="numpy-statevector",
    )
