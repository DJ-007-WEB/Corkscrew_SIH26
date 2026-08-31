"""Small, deterministic Qiskit tools exposed to the tutor service.

These functions are deliberately independent of any LLM.  They are the source
of truth for every circuit-specific number the tutor is allowed to discuss.
"""

from math import atan2

from qiskit.quantum_info import Statevector, partial_trace

from .quantum_engine import _build_qiskit_circuit, run_circuit
from .schemas import Circuit, GroundedFact


def circuit_facts(circuit: Circuit, requested_qubit: int | None = None) -> tuple[list[str], list[GroundedFact]]:
    """Run the circuit once and return compact, model-safe verified facts."""
    simulation = run_circuit(circuit)
    tools_used = ["simulate_circuit", "measurement_probabilities", "probability_timeline"]
    facts = [
        GroundedFact(name="backend", value=simulation.backend),
        GroundedFact(
            name="measurement_probabilities",
            value=", ".join(f"|{state}>: {probability:.4f}" for state, probability in simulation.final_probabilities.items() if probability > 1e-10),
        ),
        GroundedFact(name="gate_sequence", value=_gate_sequence(circuit)),
        GroundedFact(name="probability_timeline", value="; ".join(
            f"step {step.step}: " + ", ".join(f"|{basis}>={probability:.3f}" for basis, probability in step.state.probabilities.items() if probability > 1e-10)
            for step in simulation.steps
        )),
    ]

    targets = [requested_qubit] if requested_qubit is not None else list(range(circuit.qubits))
    state = Statevector.from_instruction(_build_qiskit_circuit(circuit))
    q_sphere_points = []
    for basis, amplitude in simulation.final_statevector.items():
        probability = simulation.final_probabilities[basis]
        if probability > 1e-10:
            q_sphere_points.append(f"|{basis}>: probability={probability:.6f}, phase={atan2(amplitude.imag, amplitude.real):.6f} rad")
    facts.append(GroundedFact(name="q_sphere_points", value="; ".join(q_sphere_points) or "No non-zero basis-state points."))
    tools_used.append("q_sphere_data")
    for qubit in targets:
        if qubit is None or not 0 <= qubit < circuit.qubits:
            continue
        x, y, z = _bloch_vector(state, circuit.qubits, qubit)
        facts.append(GroundedFact(name=f"bloch_vector_q{qubit}", value=f"({x:.6f}, {y:.6f}, {z:.6f})"))
        tools_used.append("bloch_vector")

    return list(dict.fromkeys(tools_used)), facts


def _bloch_vector(state: Statevector, qubits: int, qubit: int) -> tuple[float, float, float]:
    trace_out = [index for index in range(qubits) if index != qubit]
    rho = partial_trace(state, trace_out).data if trace_out else state.to_operator().data
    coherence = rho[0, 1]
    return (float(2 * coherence.real), float(-2 * coherence.imag), float(rho[0, 0].real - rho[1, 1].real))


def _gate_sequence(circuit: Circuit) -> str:
    if not circuit.gates:
        return "No gates; initial state is |0...0>."
    parts = []
    for gate in circuit.gates:
        if gate.type == "CNOT":
            parts.append(f"CNOT(q{gate.controls[0]} → q{gate.targets[0]})")
        else:
            parts.append(f"{gate.type}(q{gate.targets[0]})")
    return " → ".join(parts)
