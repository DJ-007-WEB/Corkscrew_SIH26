# QuantumLab — Quantum Learning Platform

An interactive, Qiskit-grounded quantum computing simulator, 3D visualization suite, and AI tutor platform developed for SIH 2026.

---

## ⚡ Core Features

- **Interactive Circuit Builder**: Drag-and-drop quantum gate editor ($H, X, Y, Z, CNOT$) with multi-qubit controls, real-time circuit validation, and dynamic Qiskit code generation.
- **3D Visualization Microscope**:
  - **Bloch Sphere (Three.js)**: Single-qubit reduced state representation with exact Cartesian ($X, Y, Z$) coordinates and pole orientation.
  - **Q-Sphere**: Full multi-qubit statevector visualization showing basis states, Hamming weight latitude, probability radii, and quantum phase color hues.
  - **Probability Timeline**: Step-by-step gate execution tracking how amplitudes and measurement probabilities evolve.
- **Centralized Floating Quantum Tutor**:
  - Available across all tabs (Home, Circuit Builder, Visualizations, Learning).
  - **Qiskit-Grounded Pipeline**: Qiskit calculates the exact statevector, Bloch coordinates, and Q-Sphere phases *before* the AI is invoked. The LLM receives immutable verified facts, guaranteeing 0% mathematical hallucination.
  - **Resilient AI Tutor**: Uses **Gemini 3.8 Flash** as the primary conversational model, automatically falls back to **NVIDIA NIM / GLM-5.3-Flash** when Gemini times out or returns an error, and finally uses the deterministic local tutor if both providers are unavailable.

---

## 🧠 Quantum Tutor Architecture

```
Student Question + Active Circuit
        ↓
FastAPI Intent & Focus Router
        ↓
Qiskit Aer + quantum_info Tools
  (Computes: statevector, probabilities, timeline, Bloch vectors, Q-Sphere phases)
        ↓
Immutable "CIRCUIT VERIFIED FACTS" Block
        ↓
Google Gemini 3.8 Flash (primary)
        ↓ (timeout / error)
NVIDIA NIM — GLM-5.3-Flash (fallback)
        ↓ (both unavailable)
Deterministic local tutor
        ↓
Student-friendly, mathematically accurate AI response in Floating Drawer
```

---

## 🚀 Getting Started

### Requirements
- **Node.js**: 20.19+ or 22.12+ (Check with `node --version`)
- **Python**: 3.10+ (Check with `python --version`)

---

### 1. Backend Setup

```bash
cd backend

# Create & activate virtual environment
# Windows:
python -m venv venv
venv\Scripts\activate

# Mac/Linux:
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env   # (or create backend/.env)
```

Edit `backend/.env` and configure the AI providers:
```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.8-flash

# Optional but recommended for automatic fallback
NVIDIA_API_KEY=your_nvidia_api_key
NVIDIA_MODEL=z-ai/glm-5-3-flash
```

Gemini 3.8 Flash is the primary model. If the Gemini request times out or returns a non-200 response, the backend automatically tries NVIDIA NIM. If both hosted providers fail, the existing deterministic local tutor remains available.

Start the FastAPI server:
```bash
python run.py
```
*Backend runs on `http://localhost:8000` (Health check: `http://localhost:8000/api/health`).*

---

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## 👤 Role-based Auth, Assessments & Instructor Dashboard

- **Login / Signup (top-right)**: signup is student-only (email+password, or Google) — there is no instructor signup. The single instructor account is seeded automatically on backend startup: `Quantumlab@gmail.com` / `Quantumlab` (change `INSTRUCTOR_DEFAULT_PASSWORD` in `auth.py` before a real deployment).
- **Instructor Dashboard** (instructor-role only) is a hub with four sub-tabs:
  - **Overview** — total sign-ups, active learners (last 7 days), cumulative average assessment score, a 14-day sign-up trend line, a score-distribution histogram, the assessment leaderboard, a per-assessment breakdown, and a real contest/XP leaderboard pulled from the gamification system. All computed live — nothing hardcoded.
  - **Circuit Builder** and **Visualizations** — the same components students use, embedded directly so instructors don't have to leave the dashboard.
  - **Assessments** — create assessments by adding questions one-by-one (with per-question tag/explanation and 2–6 options), or upload a PDF of questions for the backend to parse (`pypdf` + a heuristic block parser expecting `"1. Question"`, `"A) option"`, `"Answer: B"`); parsed questions are added to the editable form for review before publishing, never auto-published blind. Publishing an assessment makes it appear immediately on students' Assessment page.
- **Student Assessment page**: lists published instructor assessments; answers are graded server-side (the answer key is never sent to the client) and, when logged in, saved for the instructor dashboard. Falls back to a built-in practice quiz when no assessments have been published yet.
- Instructor-editable Learning-module topics remain out of scope for this round.

## 📊 Configurable Shots (Bloch Sphere & Q-Sphere)

The Visualization Lab now includes a shots selector (128–8192) under both the Bloch Sphere and Q-Sphere panels. Each draws that many samples from the current step's exact statevector probabilities (client-side multinomial sampling — the same distribution Qiskit Aer's `shots=` measurement would produce) and renders a live histogram of the sampled outcomes. Bloch Sphere shows the marginal 0/1 counts for the selected qubit; Q-Sphere shows counts per full basis state. Both resample on shot-count change or via the "Run shots" button.

## 📡 API Reference


### Tutor Chat Endpoint: `POST /api/tutor/chat`

#### Request Body:
```json
{
  "message": "Why is q[0] at the top of the Bloch sphere?",
  "circuit": {
    "qubits": 2,
    "gates": []
  },
  "history": [],
  "focus": "bloch"
}
```

#### Response Body:
```json
{
  "answer": "Qubit q[0] starts in ground state |0⟩, which is mapped to the North Pole (Z = +1). Since no gates have rotated it, its Bloch vector remains at (0, 0, 1).",
  "mode": "grounded",
  "tools_used": ["simulate_circuit", "measurement_probabilities", "probability_timeline", "q_sphere_data", "bloch_vector"],
  "facts": [
    { "name": "measurement_probabilities", "value": "|00>: 1.0000" },
    { "name": "bloch_vector_q0", "value": "(0.000000, 0.000000, 1.000000)" }
  ],
  "provider": "gemini",
  "recommendation": "Next, compare the Bloch vector before and after one gate to see how its direction changes."
}
```

### Other Key Endpoints:
- `POST /api/simulate`: Runs circuit through Qiskit statevector simulator and returns steps, amplitudes, and probabilities.
- `POST /api/circuits/validate`: Validates circuit IR constraints (1–8 qubits, target index bounds).
- `POST /api/circuits/to-code`: Converts visual circuit to executable Qiskit Python code.
- `POST /api/circuits/from-code`: Parses Qiskit Python code into circuit IR.
- `GET /api/gates`: Returns the supported gate catalog ($H, X, Y, Z, CNOT$).

---

## 📁 Project Structure

```
Corkscrew_SIH26/
├── backend/
│   ├── app/
│   │   ├── circuit_builder.py  # Qiskit code parsing & circuit IR validation
│   │   ├── quantum_engine.py   # Qiskit Aer simulation engine
│   │   ├── quantum_tools.py    # Deterministic Qiskit factual extraction tools
│   │   ├── tutor_service.py    # Grounding prompt builder, Gemini API, offline fallbacks
│   │   ├── tutor_store.py      # Conversation turn persistence & learning signals
│   │   ├── auth.py             # Google OAuth, password auth, JWT, seeded instructor account
│   │   ├── assessments.py      # Assessment grading + heuristic PDF question parser
│   │   ├── schemas.py          # Shared Pydantic data models & contracts
│   │   └── main.py             # FastAPI routing & rate limiting
│   ├── tests/
│   │   └── test_tutor.py       # Automated unit tests for Quantum Tutor
│   ├── .env.example            # Environment configuration template
│   ├── requirements.txt        # Backend dependencies
│   └── run.py                  # Uvicorn entrypoint
│
├── frontend/
|   ├──modules                  # all the module and quizzes content included its difficulty level and question-concept mapping
│   ├── src/
|   |   |──Questions            # All the assessment questions are stored here 
│   │   ├── App.tsx             # Root container with centralized floating Quantum Tutor
│   │   ├── QuantumTutor.tsx    # Centralized floating AI chatbot drawer component
│   │   ├── CircuitBuilder.tsx  # Drag-and-drop circuit canvas
│   │   ├── BlochSphere.tsx     # 3D Three.js single-qubit Bloch Sphere (+ shots histogram)
│   │   ├── QSphere.tsx         # 3D Three.js multi-qubit Q-Sphere (+ shots histogram)
│   │   ├── shots.ts            # Client-side multinomial shot sampling
│   │   ├── ProbabilityTimeline.tsx # Step-by-step probability progression
│   │   ├── CodePanel.tsx       # Monaco-powered Qiskit Python code builder
│   │   ├── AuthForm.tsx        # Shared role-based login/signup form (+ Google)
│   │   ├── AuthModal.tsx       # Top-right header Login/Signup modal
│   │   ├── AuthPage.tsx        # Full-page auth gate for Learning/My Works tabs
│   │   ├── InstructorDashboard.tsx # Instructor hub: overview + builder + visualizations + assessments
│   │   ├── InstructorAssessments.tsx # Create/edit assessments, one-by-one or via PDF upload
│   │   ├── MiniCharts.tsx      # Dependency-free SVG bar/line charts for the dashboard
│   │   ├── api.ts              # Typed backend client
│   │   └── types.ts            # TypeScript interfaces & IR contracts
│   ├── package.json
│   └── vite.config.ts
│
├── .gitignore
└── README.md
```

---

## 🧪 Testing

To run the backend test suite:
```bash
cd backend
venv\Scripts\python -m pytest tests   # Windows
# or: pytest tests                     # Linux/Mac
```
