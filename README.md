# Quantum Learning Platform — Foundation Scaffold

This is Days 1–3 from the roadmap: frontend + backend scaffolded, one working
API (send circuit → simulate → return results), and Milestone 1 (Bell state)
already running end-to-end.

## Requirements (checked to work on Windows, Mac, Linux)

- **Node.js 20.19+ or 22.12+** — Vite 8 requires this; an older Node (e.g. 18)
  will fail to install. Check with `node --version`.
- **Python 3.10+** — needed for numpy 2.x. Check with `python3 --version`
  (Mac/Linux) or `python --version` (Windows).
- Nothing in here is OS-specific — no shell scripts, no hardcoded paths,
  no platform-only packages in requirements.txt (see the note in that file
  if you ever regenerate it with `pip freeze` — don't).

## What's already working

- Backend: FastAPI + a **real numpy statevector simulator** (not a mock stub —
  it computes actual quantum amplitudes for H/X/Y/Z/CNOT). This means the app
  gives correct results right now, before anyone has touched Qiskit.
- Frontend: React + TypeScript + Vite + Tailwind, with a tab shell matching
  the architecture doc, and a working "Run circuit" demo that calls the
  backend and shows step-by-step probabilities + a placeholder explanation.
- The Circuit IR contract (`frontend/src/types.ts` ↔ `backend/app/schemas.py`)
  — this is the shape everyone builds against, so the circuit builder, the
  code editor, and Qiskit can all plug into the same interface independently.

## Why numpy instead of Qiskit right now

So frontend and backend work can start immediately without blocking on
whoever installs and learns Qiskit. Swapping in Qiskit Aer later is a
**one-file change**: rewrite `backend/app/quantum_engine.py::run_circuit`,
keep the same function signature and `SimulationResult` shape, set
`backend="qiskit-aer"`. Nothing else in the app needs to change.

## Run it

### Backend
```bash
cd backend

# Mac/Linux:
python3 -m venv venv
source venv/bin/activate

# Windows (Command Prompt or PowerShell):
python -m venv venv
venv\Scripts\activate

# then, on any OS:
pip install -r requirements.txt
python run.py
```
`run.py` just wraps the full uvicorn command so you don't have to type it
every time — same server, same `--reload` live-restart behavior, same port
8000. If you ever want the raw command it's wrapping:
`uvicorn app.main:app --reload --port 8000`.
Check it's alive: `curl http://localhost:8000/api/health`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173, go to the "Milestone 1 Demo" tab, click **Run circuit**.
You should see the Bell state: `|00⟩` and `|11⟩` at 50% each, with the
intermediate superposition step shown.

## Next up (whoever's picking these up)

- **AIML 2 (Quantum Intelligence):** swap `quantum_engine.py` for real Qiskit
  Aer. Same function signature, same return shape — see the TODO comment
  in that file.
- **Full-Stack 1 (Frontend):** build the React Flow circuit builder in the
  "Circuit Builder" tab — compile to `Circuit` from `types.ts`, call
  `simulateCircuit()` from `api.ts`. Same for Monaco in "Code Editor".
- **AIML 1 (AI Tutor):** replace `_explain()` in `quantum_engine.py` with
  the grounded LLM call (Section 4 of the roadmap doc) — pass it
  `final_probabilities` and the gate list, nothing else.
- **Backend / Integration:** sandbox code execution before the Code Editor
  tab is wired to a real endpoint (Section 3 of the roadmap doc).

## Project structure
```
quantum-platform/
├── frontend/
│   ├── src/
│   │   ├── types.ts          ← Circuit IR contract (keep in sync with schemas.py)
│   │   ├── api.ts            ← calls backend /api/simulate
│   │   ├── BellStateDemo.tsx ← Milestone 1, already working
│   │   └── App.tsx           ← tab shell (builder/code/learn are placeholders)
│   └── ...
└── backend/
    ├── app/
    │   ├── schemas.py         ← Circuit IR contract (keep in sync with types.ts)
    │   ├── quantum_engine.py  ← numpy simulator — swap for Qiskit here
    │   └── main.py            ← FastAPI app, /api/simulate endpoint
    └── requirements.txt
```
