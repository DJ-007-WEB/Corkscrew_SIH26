"""Multi-SDK statevector simulation layer.

CorkScrew's circuit IR (see schemas.Circuit) is intentionally tiny — H, X, Y,
Z, CNOT — so the same IR can be re-built natively in whichever quantum SDK
the learner picks from the backend dropdown, instead of only ever going
through Qiskit. Each backend below builds the circuit with its own SDK and
runs its own local simulator; nothing is shared except the IR that goes in
and the statevector convention that comes out.

Basis-state convention: Qiskit numbers basis states with qubit 0 as the
*least* significant bit (so |q(n-1)...q1 q0>). Cirq and PennyLane both
number the first wire as the *most* significant bit instead. We bit-reverse
every non-Qiskit result before returning it so the UI can show one
consistent |...> label regardless of which backend produced it.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from .schemas import Circuit, Gate

BACKEND_IDS = ["qiskit_aer", "pennylane", "cirq"]
# "qbraid" is intentionally excluded from the active list: its transpiler
# API differs across qbraid-sdk versions and was producing runtime errors
# during testing. The implementation is kept below (_run_qbraid) — add
# "qbraid" back to this list to re-enable it once pinned against a known
# working qbraid-sdk version.

BACKEND_LABELS: dict[str, str] = {
    "qiskit_aer": "Qiskit Aer",
    "pennylane": "PennyLane",
    "cirq": "Google Cirq",
    "qbraid": "qBraid",
}

BACKEND_DESCRIPTIONS: dict[str, str] = {
    "qiskit_aer": "IBM's statevector simulator. CorkScrew's default engine.",
    "pennylane": "Xanadu's differentiable circuit simulator (default.qubit device).",
    "cirq": "Google's statevector simulator (cirq.Simulator).",
    "qbraid": "Builds the circuit natively, then transpiles it through the qBraid SDK "
    "into Cirq for execution — a live demo of qBraid's cross-framework routing.",
}


class BackendUnavailable(RuntimeError):
    """Raised when the selected backend's SDK isn't installed on the server."""


def backend_catalog() -> list[dict]:
    """Report every backend plus a live availability check (import probe only,
    no circuit is run), so the frontend dropdown can grey out anything that
    isn't actually installed on this server."""
    catalog = []
    for backend_id in BACKEND_IDS:
        available, reason = _probe(backend_id)
        catalog.append(
            {
                "id": backend_id,
                "label": BACKEND_LABELS[backend_id],
                "description": BACKEND_DESCRIPTIONS[backend_id],
                "available": available,
                "unavailable_reason": reason,
            }
        )
    return catalog


def _probe(backend_id: str) -> tuple[bool, str | None]:
    """Import-probe a backend's SDK. Catches *any* exception, not just
    ImportError — a bad install can fail with all sorts of errors (version
    conflicts, missing native deps, config errors on import) and none of
    those should ever take down the whole /api/backends response."""
    try:
        if backend_id == "qiskit_aer":
            import qiskit  # noqa: F401
            import qiskit_aer  # noqa: F401
        elif backend_id == "pennylane":
            import pennylane  # noqa: F401
        elif backend_id == "cirq":
            import cirq  # noqa: F401
        elif backend_id == "qbraid":
            import qbraid  # noqa: F401
            import cirq  # noqa: F401
        else:
            return False, "unknown backend id"
        return True, None
    except Exception as exc:  # noqa: BLE001 - deliberately broad, see docstring
        return False, f"{type(exc).__name__}: {exc}"


@lru_cache(maxsize=None)
def _bit_reverse_permutation(n: int) -> tuple[int, ...]:
    size = 1 << n
    return tuple(int(format(i, f"0{n}b")[::-1], 2) for i in range(size))


def _to_qiskit_convention(state: np.ndarray, n: int) -> np.ndarray:
    perm = _bit_reverse_permutation(n)
    return np.asarray(state)[list(perm)]


def _build_qiskit_circuit(circuit: Circuit, gates: list[Gate] | None = None):
    from qiskit import QuantumCircuit

    qc = QuantumCircuit(circuit.qubits)
    for gate in (circuit.gates if gates is None else gates):
        if gate.type in ("CNOT", "CZ"):
            method = "cx" if gate.type == "CNOT" else "cz"
            getattr(qc, method)(gate.controls[0], gate.targets[0])
        elif gate.type == "SWAP":
            qc.swap(gate.targets[0], gate.targets[1])
        elif gate.type in ("RX", "RY", "RZ"):
            getattr(qc, gate.type.lower())(gate.params[0], gate.targets[0])
        else:
            getattr(qc, gate.type.lower())(gate.targets[0])
    return qc


def _run_qiskit_aer(circuit: Circuit, gates: list[Gate]) -> np.ndarray:
    from qiskit_aer import AerSimulator

    qc = _build_qiskit_circuit(circuit, gates)
    qc.save_statevector()
    simulator = AerSimulator(method="statevector")
    result = simulator.run(qc).result()
    return np.asarray(result.get_statevector(qc))


def _run_pennylane(circuit: Circuit, gates: list[Gate]) -> np.ndarray:
    import pennylane as qml

    n = circuit.qubits
    device = qml.device("default.qubit", wires=n)

    @qml.qnode(device)
    def _circuit():
        for gate in gates:
            if gate.type == "H":
                qml.Hadamard(wires=gate.targets[0])
            elif gate.type == "X":
                qml.PauliX(wires=gate.targets[0])
            elif gate.type == "Y":
                qml.PauliY(wires=gate.targets[0])
            elif gate.type == "Z":
                qml.PauliZ(wires=gate.targets[0])
            elif gate.type == "S":
                qml.S(wires=gate.targets[0])
            elif gate.type == "T":
                qml.T(wires=gate.targets[0])
            elif gate.type == "RX":
                qml.RX(gate.params[0], wires=gate.targets[0])
            elif gate.type == "RY":
                qml.RY(gate.params[0], wires=gate.targets[0])
            elif gate.type == "RZ":
                qml.RZ(gate.params[0], wires=gate.targets[0])
            elif gate.type == "CNOT":
                qml.CNOT(wires=[gate.controls[0], gate.targets[0]])
            elif gate.type == "CZ":
                qml.CZ(wires=[gate.controls[0], gate.targets[0]])
            elif gate.type == "SWAP":
                qml.SWAP(wires=[gate.targets[0], gate.targets[1]])
        return qml.state()

    state = np.asarray(_circuit())
    return _to_qiskit_convention(state, n)


def _run_cirq(circuit: Circuit, gates: list[Gate]) -> np.ndarray:
    import cirq

    n = circuit.qubits
    qubits = [cirq.LineQubit(i) for i in range(n)]
    program = cirq.Circuit()
    for gate in gates:
        if gate.type == "H":
            program.append(cirq.H(qubits[gate.targets[0]]))
        elif gate.type == "X":
            program.append(cirq.X(qubits[gate.targets[0]]))
        elif gate.type == "Y":
            program.append(cirq.Y(qubits[gate.targets[0]]))
        elif gate.type == "Z":
            program.append(cirq.Z(qubits[gate.targets[0]]))
        elif gate.type == "S":
            program.append(cirq.S(qubits[gate.targets[0]]))
        elif gate.type == "T":
            program.append(cirq.T(qubits[gate.targets[0]]))
        elif gate.type == "RX":
            program.append(cirq.rx(gate.params[0])(qubits[gate.targets[0]]))
        elif gate.type == "RY":
            program.append(cirq.ry(gate.params[0])(qubits[gate.targets[0]]))
        elif gate.type == "RZ":
            program.append(cirq.rz(gate.params[0])(qubits[gate.targets[0]]))
        elif gate.type == "CNOT":
            program.append(cirq.CNOT(qubits[gate.controls[0]], qubits[gate.targets[0]]))
        elif gate.type == "CZ":
            program.append(cirq.CZ(qubits[gate.controls[0]], qubits[gate.targets[0]]))
        elif gate.type == "SWAP":
            program.append(cirq.SWAP(qubits[gate.targets[0]], qubits[gate.targets[1]]))

    simulator = cirq.Simulator()
    result = simulator.simulate(program, qubit_order=qubits)
    state = np.asarray(result.final_state_vector)
    return _to_qiskit_convention(state, n)


def _qbraid_to_cirq(qiskit_circuit):
    """qbraid-sdk has changed its top-level conversion API across versions —
    try each known shape so this keeps working regardless of which version
    is installed, instead of hard-failing on one exact import path."""
    import qbraid

    if hasattr(qbraid, "transpile"):
        # qbraid-sdk >=0.5: qbraid.transpile(program, target)
        return qbraid.transpile(qiskit_circuit, "cirq")

    try:
        from qbraid.transpiler import transpile as _transpile
        return _transpile(qiskit_circuit, "cirq")
    except ImportError:
        pass

    try:
        from qbraid.transpiler import Conversion  # noqa: F401
        from qbraid.programs import load_program

        return load_program(qiskit_circuit).transpile("cirq")
    except ImportError:
        pass

    if hasattr(qbraid, "circuit_wrapper"):
        # qbraid-sdk <=0.3: circuit_wrapper(program).transpile(target)
        return qbraid.circuit_wrapper(qiskit_circuit).transpile("cirq")

    raise ImportError(
        "installed qbraid-sdk exposes none of the known transpile entry points "
        "(qbraid.transpile / qbraid.transpiler.transpile / qbraid.circuit_wrapper)"
    )


def _run_qbraid(circuit: Circuit, gates: list[Gate]) -> np.ndarray:
    """qBraid's value-add is cross-framework transpilation rather than yet
    another gate-by-gate builder, so we build the circuit once in Qiskit and
    let qBraid's transpiler carry it into Cirq for execution."""
    import cirq

    n = circuit.qubits
    qiskit_circuit = _build_qiskit_circuit(circuit, gates)
    cirq_program = _qbraid_to_cirq(qiskit_circuit)

    simulator = cirq.Simulator()
    result = simulator.simulate(cirq_program)
    state = np.asarray(result.final_state_vector)
    return _to_qiskit_convention(state, n)


_RUNNERS = {
    "qiskit_aer": _run_qiskit_aer,
    "pennylane": _run_pennylane,
    "cirq": _run_cirq,
    "qbraid": _run_qbraid,
}

_RESULT_LABELS = {
    "qiskit_aer": "Qiskit Aer (statevector)",
    "pennylane": "PennyLane (default.qubit)",
    "cirq": "Cirq (Simulator)",
    "qbraid": "qBraid \u2192 Cirq (via transpiler)",
}


def result_label(backend_id: str) -> str:
    return _RESULT_LABELS.get(backend_id, backend_id)


def run_statevector(backend_id: str, circuit: Circuit, gates: list[Gate]) -> np.ndarray:
    runner = _RUNNERS.get(backend_id)
    if runner is None:
        raise BackendUnavailable(
            f"Unknown backend '{backend_id}'. Choose one of: {', '.join(BACKEND_IDS)}."
        )
    label = BACKEND_LABELS.get(backend_id, backend_id)
    try:
        return runner(circuit, gates)
    except ImportError as exc:
        raise BackendUnavailable(
            f"{label} is not installed on the server. Ask the admin to `pip install` it, "
            "or pick another backend from the dropdown."
        ) from exc
    except Exception as exc:  # noqa: BLE001 - surface *any* backend failure as a readable message
        raise BackendUnavailable(
            f"{label} failed to run this circuit ({type(exc).__name__}: {exc}). "
            "Try another backend from the dropdown, or report this to the team."
        ) from exc
