"""Quantum simulation engine backed by Qiskit Aer statevector simulation."""

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

from .schemas import Circuit, ComplexAmplitude, Gate, SimulationResult, SimulationStep, StateSnapshot


_SIMULATOR = AerSimulator(method="statevector")
_EPSILON = 1e-10


def _build_qiskit_circuit(circuit: Circuit, gates: list[Gate] | None = None) -> QuantumCircuit:
    qc = QuantumCircuit(circuit.qubits)

    for gate in circuit.gates if gates is None else gates:
        if gate.type == "CNOT":
            qc.cx(gate.controls[0], gate.targets[0])
        else:
            getattr(qc, gate.type.lower())(gate.targets[0])

    return qc


def _run_statevector(qc: QuantumCircuit):
    qc = qc.copy()
    qc.save_statevector()
    result = _SIMULATOR.run(qc).result()
    return result.get_statevector(qc)


def _state_snapshot(statevector, n: int) -> StateSnapshot:
    amplitudes: dict[str, ComplexAmplitude] = {}
    probabilities: dict[str, float] = {}

    for index, amplitude in enumerate(statevector):
        real = float(amplitude.real)
        imag = float(amplitude.imag)
        probability = float(abs(amplitude) ** 2)
        basis = format(index, f"0{n}b")

        amplitudes[basis] = ComplexAmplitude(
            real=0.0 if abs(real) < _EPSILON else real,
            imag=0.0 if abs(imag) < _EPSILON else imag,
        )
        probabilities[basis] = round(probability, 10)

    return StateSnapshot(statevector=amplitudes, probabilities=probabilities)


def _general_explanation(circuit: Circuit, final_probabilities: dict[str, float]) -> str:
    """Generate deterministic learner-facing feedback from simulation data.

    This is deliberately not an LLM call. Every statement is derived from the
    actual circuit/result; the AI explainer will be layered on later.
    """
    non_zero = sum(1 for probability in final_probabilities.values() if probability > _EPSILON)
    total_states = 2 ** circuit.qubits

    if not circuit.gates:
        return f"The circuit contains {circuit.qubits} qubit(s) and no gates. The initial state is |{'0' * circuit.qubits}⟩."

    if non_zero == 1:
        basis, probability = max(final_probabilities.items(), key=lambda item: item[1])
        if abs(probability - 1.0) < 1e-8:
            return (
                f"The circuit ends in the definite computational-basis state |{basis}⟩. "
                "A measurement will therefore produce this outcome with 100% probability."
            )

    if non_zero < total_states:
        return (
            f"The circuit ends with {non_zero} possible measurement outcome(s) out of "
            f"{total_states} basis states. The probabilities shown above are calculated "
            "directly from the simulated quantum state."
        )

    return (
        f"The circuit ends with {non_zero} possible measurement outcome(s). "
        "The displayed probabilities are calculated directly from the simulated statevector."
    )


def run_circuit(circuit: Circuit) -> SimulationResult:
    initial_qc = QuantumCircuit(circuit.qubits)
    initial_state = _run_statevector(initial_qc)
    steps = [
        SimulationStep(
            step=0,
            after_gate=None,
            state=_state_snapshot(initial_state, circuit.qubits),
        )
    ]

    for index in range(1, len(circuit.gates) + 1):
        prefix = circuit.gates[:index]
        qc = _build_qiskit_circuit(circuit, prefix)
        state = _run_statevector(qc)
        steps.append(
            SimulationStep(
                step=index,
                after_gate=circuit.gates[index - 1],
                state=_state_snapshot(state, circuit.qubits),
            )
        )

    final_snapshot = steps[-1].state

    return SimulationResult(
        steps=steps,
        final_statevector=final_snapshot.statevector,
        final_probabilities=final_snapshot.probabilities,
        explanation=_general_explanation(circuit, final_snapshot.probabilities),
        backend="qiskit-aer-statevector",
    )
