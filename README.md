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
  - **Two-Tier System**: Works offline with a deterministic rule engine, and seamlessly connects to **Gemini 2.5 Flash** for dynamic conversational teaching when an API key is configured.

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
Google Gemini 2.5 Flash LLM
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

Edit `backend/.env` and add your free Gemini key from [Google AI Studio](https://aistudio.google.com/):
```env
GEMINI_API_KEY=AIzaSy...your_actual_key_here
GEMINI_MODEL=gemini-2.5-flash
```

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
│   │   ├── auth.py             # Google OAuth & JWT token verification
│   │   ├── schemas.py          # Shared Pydantic data models & contracts
│   │   └── main.py             # FastAPI routing & rate limiting
│   ├── tests/
│   │   └── test_tutor.py       # Automated unit tests for Quantum Tutor
│   ├── .env.example            # Environment configuration template
│   ├── requirements.txt        # Backend dependencies
│   └── run.py                  # Uvicorn entrypoint
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Root container with centralized floating Quantum Tutor
│   │   ├── QuantumTutor.tsx    # Centralized floating AI chatbot drawer component
│   │   ├── CircuitBuilder.tsx  # Drag-and-drop circuit canvas
│   │   ├── BlochSphere.tsx     # 3D Three.js single-qubit Bloch Sphere
│   │   ├── QSphere.tsx         # 3D Three.js multi-qubit Q-Sphere
│   │   ├── ProbabilityTimeline.tsx # Step-by-step probability progression
│   │   ├── CodePanel.tsx       # Monaco-powered Qiskit Python code builder
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
