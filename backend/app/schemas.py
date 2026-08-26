"""
Circuit IR contract — must stay in sync with frontend/src/types.ts.
This is the JSON shape both the drag-and-drop builder and the code editor
compile to before hitting the backend.
"""

from typing import Literal, Optional
from pydantic import BaseModel

GateType = Literal["H", "X", "Y", "Z", "CNOT"]


class Gate(BaseModel):
    type: GateType
    targets: list[int]
    controls: Optional[list[int]] = None


class Circuit(BaseModel):
    qubits: int
    gates: list[Gate]


class SimulationStep(BaseModel):
    after_gate: Optional[Gate]  # None = initial state, before any gate
    probabilities: dict[str, float]


class SimulationResult(BaseModel):
    steps: list[SimulationStep]
    final_probabilities: dict[str, float]
    explanation: str
    backend: str  # "numpy-statevector" until Qiskit Aer is wired in
