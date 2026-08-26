"""
Circuit IR and simulation response contracts shared by the builder,
code builder, simulator and results UI.
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


class ComplexAmplitude(BaseModel):
    real: float
    imag: float


class StateSnapshot(BaseModel):
    statevector: dict[str, ComplexAmplitude]
    probabilities: dict[str, float]


class SimulationStep(BaseModel):
    step: int
    after_gate: Optional[Gate]
    state: StateSnapshot


class SimulationResult(BaseModel):
    steps: list[SimulationStep]
    final_statevector: dict[str, ComplexAmplitude]
    final_probabilities: dict[str, float]
    explanation: str
    backend: str
