from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .quantum_engine import run_circuit
from .schemas import Circuit, SimulationResult

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


@app.post("/api/simulate", response_model=SimulationResult)
def simulate(circuit: Circuit):
    if circuit.qubits < 1 or circuit.qubits > 8:
        raise HTTPException(400, "qubits must be between 1 and 8 (roadmap cap)")
    try:
        return run_circuit(circuit)
    except (KeyError, ValueError, IndexError) as e:
        raise HTTPException(400, f"invalid circuit: {e}")
