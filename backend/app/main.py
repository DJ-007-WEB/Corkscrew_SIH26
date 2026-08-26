from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .circuit_builder import circuit_from_qiskit, circuit_to_qiskit, gate_catalog, validate_circuit
from .quantum_engine import run_circuit
from .schemas import Circuit, CodeRequest, GateDefinition, SimulationResult

app = FastAPI(title="Quantum Learning Platform API")

# Dev-only CORS — tighten this before deploying anywhere real.
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
