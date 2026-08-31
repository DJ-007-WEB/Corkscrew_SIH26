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
    gate_index: Optional[int] = None
    after_gate: Optional[Gate]
    state: StateSnapshot


class SimulationResult(BaseModel):
    steps: list[SimulationStep]
    final_statevector: dict[str, ComplexAmplitude]
    final_probabilities: dict[str, float]
    explanation: str
    backend: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    """A tutor request. The current circuit is optional for theory-only questions."""

    message: str = Field(min_length=1, max_length=4000)
    circuit: Optional[Circuit] = None
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
    conversation_id: Optional[str] = Field(default=None, max_length=80)
    focus: Optional[Literal["circuit", "bloch", "q_sphere", "timeline", "gate"]] = None


class GroundedFact(BaseModel):
    name: str
    value: str


class ChatResponse(BaseModel):
    answer: str
    mode: Literal["grounded", "conceptual"]
    tools_used: list[str] = Field(default_factory=list)
    facts: list[GroundedFact] = Field(default_factory=list)
    provider: str
    recommendation: Optional[str] = None
