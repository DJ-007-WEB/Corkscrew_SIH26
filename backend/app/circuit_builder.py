from .schemas import Circuit, Gate, GateDefinition

MAX_QUBITS = 8

GATE_DEFINITIONS = [
    GateDefinition(type="H", label="H", family="basis", description="Hadamard — creates superposition"),
    GateDefinition(type="X", label="X", family="pauli", description="Pauli-X — bit flip"),
    GateDefinition(type="Y", label="Y", family="pauli", description="Pauli-Y — bit + phase flip"),
    GateDefinition(type="Z", label="Z", family="pauli", description="Pauli-Z — phase flip"),
    GateDefinition(type="S", label="S", family="phase", description="S — quarter-turn phase gate (√Z)"),
    GateDefinition(type="T", label="T", family="phase", description="T — eighth-turn phase gate (√S)"),
    GateDefinition(type="RX", label="RX", family="rotation", description="RX(θ) — rotation about the X axis"),
    GateDefinition(type="RY", label="RY", family="rotation", description="RY(θ) — rotation about the Y axis"),
    GateDefinition(type="RZ", label="RZ", family="rotation", description="RZ(θ) — rotation about the Z axis"),
    GateDefinition(type="CNOT", label="CX", family="multi", description="Controlled-NOT — controlled target flip"),
    GateDefinition(type="CZ", label="CZ", family="multi", description="Controlled-Z — controlled phase flip"),
    GateDefinition(type="SWAP", label="SWAP", family="multi", description="SWAP — exchanges two qubit states"),
]

# Gate "shapes" — used by validation, the code exporter/parser, and diagnostics
# so every place that needs to know "how many controls/targets/params does this
# gate take" reads it from one spot instead of re-deriving it.
SINGLE_QUBIT_TYPES = {"H", "X", "Y", "Z", "S", "T"}
ROTATION_TYPES = {"RX", "RY", "RZ"}
CONTROLLED_TYPES = {"CNOT", "CZ"}
SWAP_TYPES = {"SWAP"}

_QISKIT_METHOD = {"CNOT": "cx", "CZ": "cz", "SWAP": "swap", "RX": "rx", "RY": "ry", "RZ": "rz"}


def gate_catalog() -> list[GateDefinition]:
    return GATE_DEFINITIONS


def validate_circuit(circuit: Circuit) -> Circuit:
    if circuit.qubits < 1 or circuit.qubits > MAX_QUBITS:
        raise ValueError(f"qubits must be between 1 and {MAX_QUBITS}")

    allowed = {definition.type for definition in GATE_DEFINITIONS}

    for index, gate in enumerate(circuit.gates):
        if gate.type not in allowed:
            raise ValueError(f"gate {index}: unsupported gate {gate.type}")

        if gate.type in CONTROLLED_TYPES:
            if len(gate.controls or []) != 1 or len(gate.targets) != 1:
                raise ValueError(f"gate {index}: {gate.type} requires exactly one control and one target")
            control = gate.controls[0]
            target = gate.targets[0]
            if control == target:
                raise ValueError(f"gate {index}: {gate.type} control and target must differ")
            _validate_qubit(control, circuit.qubits, index)
            _validate_qubit(target, circuit.qubits, index)

        elif gate.type in SWAP_TYPES:
            if gate.controls:
                raise ValueError(f"gate {index}: SWAP cannot have control qubits")
            if len(gate.targets) != 2:
                raise ValueError(f"gate {index}: SWAP requires exactly two qubits")
            if gate.targets[0] == gate.targets[1]:
                raise ValueError(f"gate {index}: SWAP requires two different qubits")
            for qubit in gate.targets:
                _validate_qubit(qubit, circuit.qubits, index)

        elif gate.type in ROTATION_TYPES:
            if len(gate.targets) != 1:
                raise ValueError(f"gate {index}: {gate.type} requires exactly one target")
            if gate.controls:
                raise ValueError(f"gate {index}: {gate.type} cannot have control qubits")
            if not gate.params or len(gate.params) != 1:
                raise ValueError(f"gate {index}: {gate.type} requires exactly one angle parameter")
            _validate_qubit(gate.targets[0], circuit.qubits, index)

        else:  # single-qubit, no params: H, X, Y, Z, S, T
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

        two_qubit = re.fullmatch(r"qc\.(cx|cz|swap)\(\s*(\d+)\s*,\s*(\d+)\s*\)", line, re.IGNORECASE)
        if two_qubit:
            method, a, b = two_qubit.group(1).lower(), int(two_qubit.group(2)), int(two_qubit.group(3))
            if method == "swap":
                circuit.gates.append(Gate(type="SWAP", targets=[a, b]))
            else:
                circuit.gates.append(Gate(type="CZ" if method == "cz" else "CNOT", controls=[a], targets=[b]))
            continue

        rotation = re.fullmatch(r"qc\.(rx|ry|rz)\(\s*([-+]?[0-9.]+)\s*,\s*(\d+)\s*\)", line, re.IGNORECASE)
        if rotation:
            circuit.gates.append(
                Gate(type=rotation.group(1).upper(), targets=[int(rotation.group(3))], params=[float(rotation.group(2))])
            )
            continue

        single = re.fullmatch(r"qc\.(h|x|y|z|s|t)\(\s*(\d+)\s*\)", line, re.IGNORECASE)
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
        if gate.type in CONTROLLED_TYPES:
            lines.append(f"qc.{_QISKIT_METHOD[gate.type]}({gate.controls[0]}, {gate.targets[0]})")
        elif gate.type in SWAP_TYPES:
            lines.append(f"qc.swap({gate.targets[0]}, {gate.targets[1]})")
        elif gate.type in ROTATION_TYPES:
            lines.append(f"qc.{_QISKIT_METHOD[gate.type]}({gate.params[0]}, {gate.targets[0]})")
        else:
            lines.append(f"qc.{gate.type.lower()}({gate.targets[0]})")

    lines.extend(["", "print(qc)"])
    return "\n".join(lines)


def circuit_to_qasm(circuit: Circuit) -> str:
    """Export the circuit as OPENQASM 2.0 (same gate set as the builder)."""
    validate_circuit(circuit)
    lines = ["OPENQASM 2.0;", 'include "qelib1.inc";', f"qreg q[{circuit.qubits}];", f"creg c[{circuit.qubits}];", ""]
    _QASM_METHOD = {"CNOT": "cx", "RX": "rx", "RY": "ry", "RZ": "rz"}

    for gate in circuit.gates:
        if gate.type in CONTROLLED_TYPES:
            lines.append(f"{_QASM_METHOD.get(gate.type, gate.type.lower())} q[{gate.controls[0]}],q[{gate.targets[0]}];")
        elif gate.type in SWAP_TYPES:
            lines.append(f"swap q[{gate.targets[0]}],q[{gate.targets[1]}];")
        elif gate.type in ROTATION_TYPES:
            lines.append(f"{_QASM_METHOD[gate.type]}({gate.params[0]}) q[{gate.targets[0]}];")
        else:
            lines.append(f"{gate.type.lower()} q[{gate.targets[0]}];")

    return "\n".join(lines) + "\n"
