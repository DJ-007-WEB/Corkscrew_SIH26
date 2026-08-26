"""
Circuit IR contract shared by the visual builder, code builder and simulator.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field

GateType = Literal["H", "X", "Y", "Z", "CNOT"]
GateFamily = Literal["basis", "pauli", "multi"]


class Gate(BaseModel):
    type: GateType
    targets: list[int]
    controls: Optional[list[int]] = None


class Circuit(BaseModel):
    qubits: int = Field(ge=1, le=8)
    gates: list[Gate]


class GateDefinition(BaseModel):
    type: GateType
    label: str
    family: GateFamily
    description: str


class CodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=20000)


class SimulationStep(BaseModel):
    after_gate: Optional[Gate]
    probabilities: dict[str, float]


class SimulationResult(BaseModel):
    steps: list[SimulationStep]
    final_probabilities: dict[str, float]
    explanation: str
    backend: str
