import logging
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from . import backends, dns_fix  # noqa: F401
from .auth import current_user, get_saved_works_collection, google_login
from .circuit_builder import circuit_from_qiskit, circuit_to_qasm, circuit_to_qiskit, gate_catalog, validate_circuit
from .circuit_diagnostics import diagnose_circuit
from .quantum_engine import (
    create_bell_circuit,
    create_dj_circuit,
    create_grovers_circuit,
    create_teleportation_circuit,
    run_circuit,
)
from .schemas import (
    BackendInfo,
    ChatRequest,
    ChatResponse,
    Circuit,
    CircuitDiagnosis,
    CodeRequest,
    GateDefinition,
    SavedWork,
    SavedWorkRequest,
    SimulateRequest,
    SimulationResult,
)
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


@app.get("/api/backends", response_model=list[BackendInfo])
def backend_list():
    return backends.backend_catalog()


@app.post("/api/circuits/validate", response_model=Circuit)
def validate(circuit: Circuit):
    try:
        return validate_circuit(circuit)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/circuits/diagnose", response_model=CircuitDiagnosis)
def diagnose(circuit: Circuit):
    """Non-throwing companion to /validate: returns every problem found in
    the circuit plus a suggested (and auto-applicable) fix for each."""
    return diagnose_circuit(circuit)


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


@app.post("/api/circuits/to-qasm")
def circuit_to_qasm_endpoint(circuit: Circuit):
    try:
        return {"qasm": circuit_to_qasm(circuit)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/works", response_model=list[SavedWork])
def list_saved_works(request: Request):
    user = current_user(request)
    collection = get_saved_works_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    works = collection.find({"user_id": user["sub"]}).sort("updated_at", -1)
    return [
        {
            "id": str(work["_id"]),
            "title": work["title"],
            "description": work.get("description", ""),
            "code": work["code"],
            "created_at": work["created_at"].isoformat(),
            "updated_at": work["updated_at"].isoformat(),
        }
        for work in works
    ]


@app.post("/api/works", response_model=SavedWork)
def save_work(payload: SavedWorkRequest, request: Request):
    user = current_user(request)
    collection = get_saved_works_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        code = circuit_to_qiskit(circuit_from_qiskit(payload.code))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    now = datetime.now(timezone.utc)
    document = {"user_id": user["sub"], "title": payload.title.strip(), "description": payload.description.strip(), "code": code, "created_at": now, "updated_at": now}
    result = collection.insert_one(document)
    return {"id": str(result.inserted_id), "title": document["title"], "description": document["description"], "code": code, "created_at": now.isoformat(), "updated_at": now.isoformat()}


@app.patch("/api/works/{work_id}", response_model=SavedWork)
def rename_work(work_id: str, payload: dict, request: Request):
    from bson import ObjectId

    user = current_user(request)
    collection = get_saved_works_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        oid = ObjectId(work_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid work id") from exc
    update: dict = {"updated_at": datetime.now(timezone.utc)}
    if "title" in payload and isinstance(payload["title"], str) and payload["title"].strip():
        update["title"] = payload["title"].strip()[:120]
    if "description" in payload and isinstance(payload["description"], str):
        update["description"] = payload["description"].strip()[:500]
    if len(update) == 1:
        raise HTTPException(400, "Nothing to update")
    result = collection.find_one_and_update({"_id": oid, "user_id": user["sub"]}, {"$set": update}, return_document=True)
    if result is None:
        raise HTTPException(404, "Saved work not found")
    return {"id": str(result["_id"]), "title": result["title"], "description": result.get("description", ""), "code": result["code"], "created_at": result["created_at"].isoformat(), "updated_at": result["updated_at"].isoformat()}


@app.delete("/api/works/{work_id}")
def delete_work(work_id: str, request: Request):
    from bson import ObjectId

    user = current_user(request)
    collection = get_saved_works_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        oid = ObjectId(work_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid work id") from exc
    result = collection.delete_one({"_id": oid, "user_id": user["sub"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Saved work not found")
    return {"ok": True}


@app.post("/api/simulate", response_model=SimulationResult)
def simulate(request: SimulateRequest):
    circuit = Circuit(qubits=request.qubits, gates=request.gates)
    try:
        validate_circuit(circuit)
    except ValueError as exc:
        raise HTTPException(400, f"invalid circuit: {exc}") from exc
    try:
        return run_circuit(circuit, request.backend)
    except backends.BackendUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid circuit: {exc}") from exc


@app.get("/api/presets/bell", response_model=Circuit)
def preset_bell(variant: str = "phi_plus"):
    try:
        return create_bell_circuit(2, variant)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid bell preset: {exc}") from exc


@app.get("/api/presets/deutsch-jozsa", response_model=Circuit)
def preset_dj(n: int = 1, oracle: str = "balanced"):
    try:
        return create_dj_circuit(n, oracle)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid deutsch-jozsa preset: {exc}") from exc


@app.get("/api/presets/grover", response_model=Circuit)
def preset_grover(target: str = "11", iterations: int = 1):
    try:
        return create_grovers_circuit(2, target, iterations)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid grover preset: {exc}") from exc


@app.get("/api/presets/teleportation", response_model=Circuit)
def preset_teleportation(payload: str = "plus"):
    try:
        return create_teleportation_circuit(payload)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid teleportation preset: {exc}") from exc


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
