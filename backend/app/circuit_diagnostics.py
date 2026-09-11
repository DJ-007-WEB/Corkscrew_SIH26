"""Friendly circuit diagnostics.

circuit_builder.validate_circuit() raises on the *first* problem it finds,
which is fine for a hard API guard but not for teaching. diagnose_circuit()
instead walks the whole circuit, collects every problem it can find, and
proposes a concrete, minimal fix for each one — plus a ready-to-apply
`fixed_circuit` the UI can offer with one click.
"""

from __future__ import annotations

from .circuit_builder import CONTROLLED_TYPES, GATE_DEFINITIONS, MAX_QUBITS, ROTATION_TYPES, SWAP_TYPES
from .schemas import Circuit, CircuitDiagnosis, CircuitIssue, Gate

_ALLOWED_TYPES = {definition.type for definition in GATE_DEFINITIONS}
_SUPPORTED_LIST = ", ".join(sorted(_ALLOWED_TYPES))


def diagnose_circuit(circuit: Circuit) -> CircuitDiagnosis:
    issues: list[CircuitIssue] = []
    qubits = circuit.qubits

    if qubits < 1 or qubits > MAX_QUBITS:
        clamped = max(1, min(qubits, MAX_QUBITS))
        issues.append(
            CircuitIssue(
                gate_index=None,
                message=f"A circuit needs between 1 and {MAX_QUBITS} qubits, this one has {qubits}.",
                suggestion=f"Set the qubit count to {clamped}.",
            )
        )
        # Nothing else can be sensibly checked against an invalid qubit count.
        return CircuitDiagnosis(valid=False, issues=issues, fixed_circuit=None)

    fixed_gates: list[Gate] = []

    for index, gate in enumerate(circuit.gates):
        if gate.type not in _ALLOWED_TYPES:
            issues.append(
                CircuitIssue(
                    gate_index=index,
                    message=f"Gate {index + 1} uses '{gate.type}', which CorkScrew doesn't support yet.",
                    suggestion=f"Supported gates right now are: {_SUPPORTED_LIST}. "
                    "Remove this gate or swap it for one of those.",
                )
            )
            continue  # can't confidently auto-fix an unknown gate — drop it from the repair

        if gate.type in CONTROLLED_TYPES:
            fixed_gate = _check_controlled(gate, index, qubits, issues)
        elif gate.type in SWAP_TYPES:
            fixed_gate = _check_swap(gate, index, qubits, issues)
        elif gate.type in ROTATION_TYPES:
            fixed_gate = _check_rotation(gate, index, qubits, issues)
        else:
            fixed_gate = _check_single_qubit(gate, index, qubits, issues)

        if fixed_gate is not None:
            fixed_gates.append(fixed_gate)

    valid = len(issues) == 0
    fixed_circuit = None if valid else Circuit(qubits=qubits, gates=fixed_gates)

    return CircuitDiagnosis(valid=valid, issues=issues, fixed_circuit=fixed_circuit)


def _check_controlled(gate: Gate, index: int, qubits: int, issues: list[CircuitIssue]) -> Gate | None:
    controls = gate.controls or []
    targets = gate.targets or []

    if len(controls) != 1 or len(targets) != 1:
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) needs exactly one control and one target qubit.",
                suggestion=f"Use the form {gate.type}(control=qA, target=qB) — drop the control qubit "
                "first, then the target, both on the same column.",
            )
        )
        return None

    control, target = controls[0], targets[0]
    problem = False

    if control == target:
        new_target = (control + 1) % qubits
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) uses q{control} as both control and target — "
                "that's not a valid controlled operation.",
                suggestion=f"Change the target to a different qubit, e.g. q{new_target}.",
            )
        )
        target = new_target
        problem = True

    if not (0 <= control < qubits):
        fixed_control = min(max(control, 0), qubits - 1)
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) control q{control} doesn't exist in this "
                f"{qubits}-qubit circuit.",
                suggestion=f"Use a control between q0 and q{qubits - 1} (e.g. q{fixed_control}), "
                f"or add more qubits so q{control} exists.",
            )
        )
        control = fixed_control
        problem = True

    if not (0 <= target < qubits):
        fixed_target = min(max(target, 0), qubits - 1)
        if fixed_target == control:
            fixed_target = (control + 1) % qubits
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) target q{target} doesn't exist in this "
                f"{qubits}-qubit circuit.",
                suggestion=f"Use a target between q0 and q{qubits - 1} (e.g. q{fixed_target}), "
                f"or add more qubits so q{target} exists.",
            )
        )
        target = fixed_target
        problem = True

    if not problem:
        return gate
    return Gate(type=gate.type, controls=[control], targets=[target])


def _check_swap(gate: Gate, index: int, qubits: int, issues: list[CircuitIssue]) -> Gate | None:
    targets = gate.targets or []

    if gate.controls:
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} (SWAP) has a control qubit, but SWAP isn't a controlled gate.",
                suggestion="Remove the control — SWAP just needs two target qubits.",
            )
        )
        return None

    if len(targets) != 2:
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} (SWAP) needs exactly two qubits to swap.",
                suggestion="Pick two different qubits, e.g. SWAP(q0, q1).",
            )
        )
        return None

    a, b = targets
    problem = False

    if a == b:
        b = (a + 1) % qubits
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} (SWAP) uses q{a} twice — swapping a qubit with itself does nothing.",
                suggestion=f"Pick a second, different qubit, e.g. q{b}.",
            )
        )
        problem = True

    fixed = []
    for qubit in (a, b):
        if not (0 <= qubit < qubits):
            fixed_qubit = min(max(qubit, 0), qubits - 1)
            issues.append(
                CircuitIssue(
                    gate_index=index,
                    message=f"Gate {index + 1} (SWAP) uses q{qubit}, which doesn't exist in this "
                    f"{qubits}-qubit circuit.",
                    suggestion=f"Use a qubit between q0 and q{qubits - 1} (e.g. q{fixed_qubit}), "
                    f"or add more qubits so q{qubit} exists.",
                )
            )
            fixed.append(fixed_qubit)
            problem = True
        else:
            fixed.append(qubit)

    if not problem:
        return gate
    return Gate(type="SWAP", targets=fixed)


def _check_rotation(gate: Gate, index: int, qubits: int, issues: list[CircuitIssue]) -> Gate | None:
    targets = gate.targets or []

    if len(targets) != 1 or gate.controls:
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) must act on exactly one qubit and takes no control.",
                suggestion=f"Give {gate.type} a single target qubit and an angle, e.g. {gate.type}(θ=1.57, q0).",
            )
        )
        return None

    params = gate.params or []
    angle = params[0] if params else 0.0
    if not params:
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) is missing its rotation angle.",
                suggestion="Set an angle in radians, e.g. 1.5708 for a quarter turn (π/2).",
            )
        )

    target = targets[0]
    problem = not params
    if not (0 <= target < qubits):
        fixed_target = min(max(target, 0), qubits - 1)
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) targets q{target}, which doesn't exist "
                f"in this {qubits}-qubit circuit.",
                suggestion=f"Use a qubit between q0 and q{qubits - 1} (e.g. q{fixed_target}), "
                f"or add more qubits so q{target} exists.",
            )
        )
        target = fixed_target
        problem = True

    if not problem:
        return gate
    return Gate(type=gate.type, targets=[target], params=[angle])


def _check_single_qubit(gate: Gate, index: int, qubits: int, issues: list[CircuitIssue]) -> Gate | None:
    targets = gate.targets or []
    problem = False

    if len(targets) != 1:
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) must act on exactly one qubit.",
                suggestion=f"Give {gate.type} a single target qubit, e.g. q0. To act on several "
                "qubits, add one gate per qubit.",
            )
        )
        return None

    if gate.controls:
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) has a control qubit, but {gate.type} "
                "isn't a controlled gate here.",
                suggestion=f"Remove the control from this {gate.type}. If you meant a controlled "
                f"operation, use CNOT instead.",
            )
        )
        problem = True

    target = targets[0]
    if not (0 <= target < qubits):
        fixed_target = min(max(target, 0), qubits - 1)
        issues.append(
            CircuitIssue(
                gate_index=index,
                message=f"Gate {index + 1} ({gate.type}) targets q{target}, which doesn't exist "
                f"in this {qubits}-qubit circuit.",
                suggestion=f"Use a qubit between q0 and q{qubits - 1} (e.g. q{fixed_target}), "
                f"or add more qubits so q{target} exists.",
            )
        )
        target = fixed_target
        problem = True

    if not problem:
        return gate
    return Gate(type=gate.type, targets=[target])
