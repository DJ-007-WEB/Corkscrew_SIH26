"""Small, deterministic Qiskit tools exposed to the tutor service.

These functions are deliberately independent of any LLM.  They are the source
of truth for every circuit-specific number the tutor is allowed to discuss.
"""

from math import atan2

from qiskit.quantum_info import Statevector, partial_trace

from .backends import _build_qiskit_circuit
from .quantum_engine import _general_explanation, run_circuit
from .schemas import Circuit, GroundedFact, SimulationResult


def _bell_state_explanation(circuit: Circuit, result: SimulationResult) -> str:
    """Generate explanation specific to Bell state circuits."""
    probabilities = result.final_probabilities
    pair_00_11 = probabilities.get("00", 0) > 0.4 and probabilities.get("11", 0) > 0.4
    pair_01_10 = probabilities.get("01", 0) > 0.4 and probabilities.get("10", 0) > 0.4

    if pair_00_11 or pair_01_10:
        pair = "|00> and |11>" if pair_00_11 else "|01> and |10>"
        return (
            f"This circuit creates a Bell state. The measurement probabilities show that only {pair} "
            "have non-zero probability, which is the defining characteristic of maximal entanglement: "
            "measuring one qubit instantly determines the state of the other."
        )
    return _general_explanation(circuit, probabilities)


def _deutsch_jozsa_explanation(circuit: Circuit, result: SimulationResult) -> str:
    """Generate explanation specific to Deutsch-Jozsa circuits."""
    probabilities = result.final_probabilities
    n = circuit.qubits - 1
    all_zeros_key = "0" * n
    prob_all_zeros = probabilities.get(all_zeros_key, 0)
    if abs(prob_all_zeros - 1.0) < 1e-8:
        return (
            f"This circuit implements the Deutsch-Jozsa algorithm with {n} input qubit(s). "
            f"The measurement result shows all zeros (|{'0' * n}⟩), meaning the function is constant. "
            f"The quantum algorithm achieved this with only 1 query."
        )
    balanced_outcomes = [basis for basis, prob in probabilities.items()
                        if prob > 0.01 and basis != all_zeros_key]
    return (
        f"This circuit implements the Deutsch-Jozsa algorithm with {n} input qubit(s). "
        f"The measurement outcomes show a balanced function. "
        f"Non-zero probabilities: {', '.join(balanced_outcomes)}. "
        f"The quantum algorithm determined this with 1 query."
    )


def _grovers_explanation(circuit: Circuit, result: SimulationResult) -> str:
    """Generate explanation specific to Grover's algorithm circuits."""
    probabilities = result.final_probabilities
    target = "1" * circuit.qubits
    prob_target = probabilities.get(target, 0)
    if prob_target > 0.9:
        return (
            f"This circuit implements Grover's algorithm with {circuit.qubits} qubit(s). "
            f"The target state |{target}⟩ has probability {prob_target:.4f}, "
            f"which is dramatically amplified from the initial uniform distribution of 1/{2**circuit.qubits}. "
            f"Grover's algorithm achieves this quadratic speedup in O(√N) queries vs O(N) classically."
        )
    return _general_explanation(circuit, probabilities)


def _teleportation_explanation(circuit: Circuit, result: SimulationResult) -> str:
    """Generate explanation specific to quantum teleportation circuits."""
    probabilities = result.final_probabilities
    return (
        "This circuit implements quantum teleportation of a qubit state across 3 qubits. "
        "A Bell pair is created between qubits 1 and 2, then Alice performs a joint measurement "
        "on qubits 0 and 1, and Bob applies corrections to qubit 2. "
        "The original state is transferred without physically traveling through space."
    )


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
        GroundedFact(name="bell_state", value=_bell_state_explanation(circuit, simulation)),
        GroundedFact(name="deutsch_jozsa", value=_deutsch_jozsa_explanation(circuit, simulation)),
        GroundedFact(name="grovers", value=_grovers_explanation(circuit, simulation)),
        GroundedFact(name="teleportation", value=_teleportation_explanation(circuit, simulation)),
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
