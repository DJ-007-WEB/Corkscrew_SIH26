"""
Circuit IR and simulation response contracts shared by the builder,
code builder, simulator and results UI.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field

GateType = Literal["H", "X", "Y", "Z", "S", "T", "RX", "RY", "RZ", "CNOT", "CZ", "SWAP"]
GateFamily = Literal["basis", "pauli", "phase", "rotation", "multi"]


class Gate(BaseModel):
    type: GateType
    targets: list[int]
    controls: Optional[list[int]] = None
    params: Optional[list[float]] = None


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


BackendId = Literal["qiskit_aer", "pennylane", "cirq"]  # "qbraid" disabled — see backends.py


class SimulateRequest(Circuit):
    backend: BackendId = "qiskit_aer"


class BackendInfo(BaseModel):
    id: str
    label: str
    description: str
    available: bool
    unavailable_reason: Optional[str] = None


class CircuitIssue(BaseModel):
    gate_index: Optional[int] = None
    message: str
    suggestion: str


class CircuitDiagnosis(BaseModel):
    valid: bool
    issues: list[CircuitIssue]
    fixed_circuit: Optional[Circuit] = None


class SavedWorkRequest(BaseModel):
    code: str = Field(min_length=1, max_length=20000)
    title: str = Field(default="Untitled circuit", min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class SavedWork(BaseModel):
    id: str
    title: str
    description: str = ""
    code: str
    created_at: str
    updated_at: str


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
    focus: Optional[Literal["circuit", "bloch", "q_sphere", "timeline", "gate", "bell", "deutsch", "grover", "teleport"]] = None


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


class UserStats(BaseModel):
    user_id: str
    name: str
    total_xp: int
    level: int
    xp_into_level: int
    xp_for_next_level: int
    streak_count: int
    best_streak: int
    contests_played: int
    duels_won: int
    rank: Optional[int] = None


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: str = ""
    name: str
    total_xp: int
    level: int
    streak_count: int
    is_me: bool = False


class ProfileActivity(BaseModel):
    kind: str
    points: int
    created_at: str


class UserPublicProfile(BaseModel):
    user_id: str
    name: str
    picture: Optional[str] = None
    total_xp: int
    level: int
    xp_into_level: int
    xp_for_next_level: int
    streak_count: int
    best_streak: int
    contests_played: int
    duels_won: int
    rank: Optional[int] = None
    is_me: bool = False
    recent_activity: list[ProfileActivity] = Field(default_factory=list)


class ActivityRequest(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    detail: str = Field(default="", max_length=200)


class QuizQuestion(BaseModel):
    id: str
    tag: str
    question: str
    options: list[str]


class SprintStartResponse(BaseModel):
    attempt_id: str
    questions: list[QuizQuestion]
    duration_sec: int
    started_at: str


class SprintSubmitRequest(BaseModel):
    attempt_id: str = Field(min_length=1, max_length=60)
    answers: dict[str, int] = Field(default_factory=dict)


class SprintQuestionResult(BaseModel):
    id: str
    tag: str
    question: str
    options: list[str]
    your_option: Optional[int] = None
    correct_option: int
    is_correct: bool
    answered: bool
    explanation: str


class SprintSubmitResponse(BaseModel):
    correct: int
    wrong: int
    skipped: int
    total: int
    time_sec: float
    base_score: int
    time_bonus: int
    xp_earned: int
    already_solved: bool = False
    results: list[SprintQuestionResult]
    stats: UserStats


class ChallengeTask(BaseModel):
    id: str
    title: str
    description: str
    qubits: int
    max_gates: int
    hint: str


class ChallengeSubmitRequest(BaseModel):
    task_id: str = Field(min_length=1, max_length=40)
    circuit: Circuit


class ChallengeSubmitResponse(BaseModel):
    passed: bool
    message: str
    probabilities: dict[str, float]
    gates_used: int
    xp_earned: int
    already_solved: bool = False
    stats: UserStats


class DuelCreateResponse(BaseModel):
    code: str


class DuelJoinRequest(BaseModel):
    code: str = Field(min_length=1, max_length=12)


class DuelAnswerRequest(BaseModel):
    question_id: str = Field(min_length=1, max_length=20)
    option: int = Field(ge=0, le=5)


class DuelPlayerResult(BaseModel):
    name: str
    correct: int
    wrong: int
    answered: int
    elapsed_sec: float
    xp_earned: int


class DuelState(BaseModel):
    code: str
    status: str  # waiting | live | finished
    host_name: str
    guest_name: str = ""
    is_host: bool = False
    questions: list[QuizQuestion] = Field(default_factory=list)
    duration_sec: int = 0
    time_left_sec: float = 0
    my_answers: dict[str, int] = Field(default_factory=dict)
    my_submitted: bool = False
    opponent_name: str = ""
    opponent_answered: int = 0
    opponent_submitted: bool = False
    winner: str = ""  # host | guest | tie | ""
    winner_name: str = ""
    is_winner: Optional[bool] = None
    host_result: Optional[DuelPlayerResult] = None
    guest_result: Optional[DuelPlayerResult] = None
    results: list[SprintQuestionResult] = Field(default_factory=list)
    stats: Optional[UserStats] = None
