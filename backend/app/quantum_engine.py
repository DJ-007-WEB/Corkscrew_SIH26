"""Quantum simulation engine - runs a validated Circuit on whichever backend
(Qiskit Aer, PennyLane, Cirq, or qBraid) the caller selects. See backends.py
for the per-SDK circuit builders and the statevector-convention adapter that
keeps basis-state labels identical no matter which backend produced them.
"""

from . import backends
from .schemas import Circuit, ComplexAmplitude, SimulationResult, SimulationStep, StateSnapshot

_EPSILON = 1e-10


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


def run_circuit(circuit: Circuit, backend_id: str = "qiskit_aer") -> SimulationResult:
    initial_state = backends.run_statevector(backend_id, circuit, [])
    steps = [
        SimulationStep(
            step=0,
            gate_index=None,
            after_gate=None,
            state=_state_snapshot(initial_state, circuit.qubits),
        )
    ]

    for index in range(1, len(circuit.gates) + 1):
        prefix = circuit.gates[:index]
        state = backends.run_statevector(backend_id, circuit, prefix)
        steps.append(
            SimulationStep(
                step=index,
                gate_index=index - 1,
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
        backend=backends.result_label(backend_id),
    )


def create_bell_circuit(qubits: int = 2, variant: str = "phi_plus") -> Circuit:
    """Create a Bell state circuit.

    variant: phi_plus | phi_minus | psi_plus | psi_minus.
    Uses only H, X, Z, CNOT so it always validates against the gate catalog.
    """
    from .circuit_builder import validate_circuit
    from .schemas import Circuit, Gate

    variant = (variant or "phi_plus").lower()
    if variant not in ("phi_plus", "phi_minus", "psi_plus", "psi_minus"):
        raise ValueError(f"unknown bell variant: {variant}")
    circuit = Circuit(qubits=qubits, gates=[])

    # Base |Phi+> = (|00> + |11>) / sqrt(2)
    circuit.gates.append(Gate(type="H", targets=[0]))
    circuit.gates.append(Gate(type="CNOT", controls=[0], targets=[1]))

    if variant == "phi_minus":
        # (|00> - |11>) / sqrt(2)
        circuit.gates.append(Gate(type="Z", targets=[0]))
    elif variant == "psi_plus":
        # (|01> + |10>) / sqrt(2)
        circuit.gates.append(Gate(type="X", targets=[1]))
    elif variant == "psi_minus":
        # (|01> - |10>) / sqrt(2)
        circuit.gates.append(Gate(type="X", targets=[1]))
        circuit.gates.append(Gate(type="Z", targets=[0]))

    return validate_circuit(circuit)


def run_bell_simulation(qubits: int = 2, variant: str = "phi_plus", backend_id: str = "qiskit_aer") -> SimulationResult:
    """Run the Bell state circuit simulation and return the result."""
    circuit = create_bell_circuit(qubits, variant)
    return run_circuit(circuit, backend_id)


def create_dj_circuit(n: int = 1, oracle: str = "balanced") -> Circuit:
    """Create a Deutsch-Jozsa circuit with n qubits (plus 1 ancilla).

    oracle: balanced | constant_zero | constant_one.
    Uses only H, X, Z, CNOT so it always validates against the gate catalog.
    """
    from .circuit_builder import validate_circuit
    from .schemas import Circuit, Gate

    oracle = (oracle or "balanced").lower()
    if oracle not in ("balanced", "constant_zero", "constant_one", "constant"):
        raise ValueError(f"unknown dj oracle: {oracle}")
    if n < 1 or n > 7:
        raise ValueError("dj n must be between 1 and 7")
    if oracle == "constant":
        oracle = "constant_zero"
    circuit = Circuit(qubits=n + 1, gates=[])  # n qubits + 1 ancilla

    # Ancilla |-> preparation
    circuit.gates.append(Gate(type="X", targets=[n]))
    circuit.gates.append(Gate(type="H", targets=[n]))
    for qubit in range(n + 1):
        circuit.gates.append(Gate(type="H", targets=[qubit]))

    if oracle == "balanced":
        for control in range(n):
            circuit.gates.append(Gate(type="CNOT", controls=[control], targets=[n]))
        circuit.gates.append(Gate(type="Z", targets=[n]))
    elif oracle == "constant_one":
        # f(x) = 1 flips the ancilla
        circuit.gates.append(Gate(type="X", targets=[n]))
    # constant_zero: identity oracle, no gates

    for qubit in range(n + 1):
        circuit.gates.append(Gate(type="H", targets=[qubit]))

    return validate_circuit(circuit)


def run_dj_simulation(n: int = 1, oracle: str = "balanced", backend_id: str = "qiskit_aer") -> SimulationResult:
    """Run the Deutsch-Jozsa circuit simulation and return the result."""
    circuit = create_dj_circuit(n, oracle)
    return run_circuit(circuit, backend_id)


def _append_cz(circuit, control: int, target: int) -> None:
    """Append CZ(control, target) decomposed as H-CNOT-H (catalog-safe)."""
    from .schemas import Gate

    circuit.gates.append(Gate(type="H", targets=[target]))
    circuit.gates.append(Gate(type="CNOT", controls=[control], targets=[target]))
    circuit.gates.append(Gate(type="H", targets=[target]))


def _append_oracle_for_target(circuit, target: str) -> None:
    """Phase-flip an arbitrary 2-qubit target using X wrapping + CZ."""
    from .schemas import Gate

    flips = [i for i, bit in enumerate(target) if bit == "0"]
    for qubit in flips:
        circuit.gates.append(Gate(type="X", targets=[qubit]))
    _append_cz(circuit, 0, 1)
    for qubit in flips:
        circuit.gates.append(Gate(type="X", targets=[qubit]))


def _append_diffusion(circuit, n: int) -> None:
    from .schemas import Gate

    for qubit in range(n):
        circuit.gates.append(Gate(type="H", targets=[qubit]))
        circuit.gates.append(Gate(type="X", targets=[qubit]))
    for qubit in range(n - 1):
        _append_cz(circuit, qubit, qubit + 1)
    for qubit in range(n):
        circuit.gates.append(Gate(type="X", targets=[qubit]))
        circuit.gates.append(Gate(type="H", targets=[qubit]))


def create_grovers_circuit(n: int = 2, target: str = "11", iterations: int = 1) -> Circuit:
    """Create a Grover's algorithm circuit.

    Currently n=2 with target in {00,01,10,11} and iterations 1-2.
    Uses only H, X, and CNOT gates.
    """
    from .circuit_builder import validate_circuit
    from .schemas import Circuit, Gate

    if n != 2:
        raise ValueError("grover n is fixed to 2 in this build")
    target = (target or "11").strip()
    if target not in ("00", "01", "10", "11"):
        raise ValueError(f"unknown grover target: {target}")
    if iterations not in (1, 2):
        raise ValueError("grover iterations must be 1 or 2")

    circuit = Circuit(qubits=n, gates=[])
    for qubit in range(n):
        circuit.gates.append(Gate(type="H", targets=[qubit]))
    # Outcome labels are big-endian (q1q0) while qubit indices are little-endian,
    # so reverse the display target when wrapping the oracle.
    oracle_target = target[::-1]
    for _ in range(iterations):
        _append_oracle_for_target(circuit, oracle_target)
        _append_diffusion(circuit, n)

    return validate_circuit(circuit)


def run_grovers_simulation(n: int = 2, target: str = "11", iterations: int = 1, backend_id: str = "qiskit_aer") -> SimulationResult:
    """Run Grover's algorithm circuit simulation and return the result."""
    circuit = create_grovers_circuit(n, target, iterations)
    return run_circuit(circuit, backend_id)


def create_teleportation_circuit(payload: str = "plus") -> Circuit:
    """Create a quantum teleportation circuit with 3 qubits.

    payload selects q[0] preparation: zero | one | plus.
    Uses only H, X, CNOT so it always validates against the gate catalog.
    """
    from .circuit_builder import validate_circuit
    from .schemas import Circuit, Gate

    payload = (payload or "plus").lower()
    if payload not in ("zero", "one", "plus"):
        raise ValueError(f"unknown teleport payload: {payload}")
    circuit = Circuit(qubits=3, gates=[])

    if payload == "one":
        circuit.gates.append(Gate(type="X", targets=[0]))
    elif payload == "plus":
        circuit.gates.append(Gate(type="H", targets=[0]))
    # zero: leave q[0] in |0>

    # Create Bell pair between q[1] and q[2]
    circuit.gates.append(Gate(type="H", targets=[1]))
    circuit.gates.append(Gate(type="CNOT", controls=[1], targets=[2]))

    # Alice's operations: CNOT(q[0]→q[1]) then H(q[0])
    circuit.gates.append(Gate(type="CNOT", controls=[0], targets=[1]))
    circuit.gates.append(Gate(type="H", targets=[0]))

    return validate_circuit(circuit)


def run_teleportation_simulation(payload: str = "plus", backend_id: str = "qiskit_aer") -> SimulationResult:
    """Run the quantum teleportation circuit simulation."""
    circuit = create_teleportation_circuit(payload)
    return run_circuit(circuit, backend_id)
