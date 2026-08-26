from .schemas import Circuit, Gate, GateDefinition

MAX_QUBITS = 8

GATE_DEFINITIONS = [
    GateDefinition(type="H", label="H", family="basis", description="Hadamard — creates superposition"),
    GateDefinition(type="X", label="X", family="pauli", description="Pauli-X — bit flip"),
    GateDefinition(type="Y", label="Y", family="pauli", description="Pauli-Y — bit + phase flip"),
    GateDefinition(type="Z", label="Z", family="pauli", description="Pauli-Z — phase flip"),
    GateDefinition(type="CNOT", label="CX", family="multi", description="Controlled-NOT — controlled target flip"),
]


def gate_catalog() -> list[GateDefinition]:
    return GATE_DEFINITIONS


def validate_circuit(circuit: Circuit) -> Circuit:
    if circuit.qubits < 1 or circuit.qubits > MAX_QUBITS:
        raise ValueError(f"qubits must be between 1 and {MAX_QUBITS}")

    allowed = {definition.type for definition in GATE_DEFINITIONS}

    for index, gate in enumerate(circuit.gates):
        if gate.type not in allowed:
            raise ValueError(f"gate {index}: unsupported gate {gate.type}")

        if gate.type == "CNOT":
            if len(gate.controls or []) != 1 or len(gate.targets) != 1:
                raise ValueError(f"gate {index}: CNOT requires exactly one control and one target")
            control = gate.controls[0]
            target = gate.targets[0]
            if control == target:
                raise ValueError(f"gate {index}: CNOT control and target must differ")
            _validate_qubit(control, circuit.qubits, index)
            _validate_qubit(target, circuit.qubits, index)
        else:
            if len(gate.targets) != 1:
                raise ValueError(f"gate {index}: {gate.type} requires exactly one target")
            if gate.controls:
                raise ValueError(f"gate {index}: {gate.type} cannot have control qubits")
            _validate_qubit(gate.targets[0], circuit.qubits, index)

    return circuit


def _validate_qubit(qubit: int, qubits: int, gate_index: int) -> None:
    if qubit < 0 or qubit >= qubits:
        raise ValueError(f"gate {gate_index}: qubit q{qubit} is outside q0–q{qubits - 1}")


def circuit_from_qiskit(source: str) -> Circuit:
    """Parse the deliberately small, safe Qiskit subset supported by the playground.

    This is a circuit parser, not Python execution. No user code is executed.
    """
    import re

    match = re.search(r"QuantumCircuit\s*\(\s*(\d+)\s*\)", source)
    if not match:
        raise ValueError("Create a circuit with QuantumCircuit(n) first")

    circuit = Circuit(qubits=int(match.group(1)), gates=[])
    if circuit.qubits < 1 or circuit.qubits > MAX_QUBITS:
        raise ValueError(f"qubits must be between 1 and {MAX_QUBITS}")

    for raw_line in source.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or line.startswith("from ") or line.startswith("import "):
            continue
        if line.startswith("qc =") or line == "print(qc)":
            continue

        cnot = re.fullmatch(r"qc\.cx\(\s*(\d+)\s*,\s*(\d+)\s*\)", line, re.IGNORECASE)
        if cnot:
            circuit.gates.append(
                Gate(type="CNOT", controls=[int(cnot.group(1))], targets=[int(cnot.group(2)])
            )
            continue

        single = re.fullmatch(r"qc\.(h|x|y|z)\(\s*(\d+)\s*\)", line, re.IGNORECASE)
        if single:
            circuit.gates.append(
                Gate(type=single.group(1).upper(), targets=[int(single.group(2))])
            )
            continue

        raise ValueError(f"Unsupported Qiskit statement: {line}")

    return validate_circuit(circuit)


def circuit_to_qiskit(circuit: Circuit) -> str:
    validate_circuit(circuit)
    lines = ["from qiskit import QuantumCircuit", "", f"qc = QuantumCircuit({circuit.qubits})", ""]

    for gate in circuit.gates:
        if gate.type == "CNOT":
            lines.append(f"qc.cx({gate.controls[0]}, {gate.targets[0]})")
        else:
            lines.append(f"qc.{gate.type.lower()}({gate.targets[0]})")

    lines.extend(["", "print(qc)"])
    return "\n".join(lines)
