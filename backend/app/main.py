import logging
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import dns_fix  # noqa: F401
from .auth import current_user, google_login
from .circuit_builder import circuit_from_qiskit, circuit_to_qiskit, gate_catalog, validate_circuit
from .quantum_engine import run_circuit
from .schemas import ChatRequest, ChatResponse, Circuit, CodeRequest, GateDefinition, SimulationResult
from .tutor_service import answer as tutor_answer

app = FastAPI(title="Quantum Learning Platform API")
logger = logging.getLogger("quantum_tutor")
_chat_limits: dict[str, list[float]] = {}

# Dev defaults; production should set FRONTEND_URL in the environment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/gates", response_model=list[GateDefinition])
def gates():
    return gate_catalog()


@app.post("/api/auth/google")
def auth_google(payload: dict):
    credential = payload.get("credential")
    if not credential:
        raise HTTPException(400, "Google credential is required")
    return google_login(credential)


@app.get("/api/auth/me")
def auth_me(request: Request):
    return {"user": current_user(request)}


@app.post("/api/circuits/validate", response_model=Circuit)
def validate(circuit: Circuit):
    try:
        return validate_circuit(circuit)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/circuits/from-code", response_model=Circuit)
def circuit_from_code(request: CodeRequest):
    try:
        return circuit_from_qiskit(request.code)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/circuits/to-code")
def circuit_to_code(circuit: Circuit):
    try:
        return {"code": circuit_to_qiskit(circuit)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/simulate", response_model=SimulationResult)
def simulate(circuit: Circuit):
    try:
        validate_circuit(circuit)
        return run_circuit(circuit)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid circuit: {exc}") from exc


@app.post("/api/tutor/chat", response_model=ChatResponse)
def tutor_chat(request: ChatRequest):
    """Circuit-specific answers are grounded in Qiskit before an LLM sees them."""
    # Lightweight per-process protection. Replace with Redis for multi-instance production.
    client = request.conversation_id or "anonymous"
    now = time.monotonic()
    recent = [stamp for stamp in _chat_limits.get(client, []) if now - stamp < 60]
    if len(recent) >= 20:
        raise HTTPException(429, "Tutor request limit reached. Please retry in a minute.")
    recent.append(now)
    _chat_limits[client] = recent
    try:
        return tutor_answer(request)
    except (KeyError, ValueError, IndexError) as exc:
        logger.warning("Invalid tutor request: %s", exc)
        raise HTTPException(400, f"invalid tutor request: {exc}") from exc
    except Exception as exc:
        logger.exception("Tutor request failed")
        raise HTTPException(502, "Tutor is temporarily unavailable") from exc
