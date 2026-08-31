from app.schemas import ChatRequest, Circuit, Gate
from app.tutor_service import answer


def test_grounded_question_uses_qiskit_tools(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="Why is q[0] at the bottom of the Bloch sphere?",
        circuit=Circuit(qubits=1, gates=[Gate(type="X", targets=[0])]),
    ))
    assert response.mode == "grounded"
    assert "bloch_vector" in response.tools_used
    assert any(fact.name == "q_sphere_points" for fact in response.facts)
    assert "bottom pole, |1⟩" in response.answer


def test_untouched_state_bloch_fallback(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="Explain my current Bloch sphere values.",
        circuit=Circuit(qubits=2, gates=[]),
    ))
    assert response.mode == "grounded"
    assert "top pole, |0⟩" in response.answer
    assert "bottom pole" not in response.answer
    assert "Gates: No gates; initial state is |0...0>." in response.answer
    assert ">.." not in response.answer


def test_superposition_state_bloch_fallback(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="Explain my current Bloch sphere values.",
        circuit=Circuit(qubits=1, gates=[Gate(type="H", targets=[0])]),
    ))
    assert response.mode == "grounded"
    assert "equator" in response.answer
    assert "bottom pole" not in response.answer
    assert "top pole" not in response.answer


def test_qsphere_fallback(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="Explain the Q-Sphere points and phases for this circuit.",
        circuit=Circuit(qubits=2, gates=[]),
        focus="q_sphere",
    ))
    assert response.mode == "grounded"
    assert "Q-Sphere representation" in response.answer
    assert "phase" in response.answer
    assert "bloch vector" not in response.answer


def test_gates_fallback(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="Explain the latest gate in my circuit.",
        circuit=Circuit(qubits=1, gates=[Gate(type="X", targets=[0])]),
        focus="gate",
    ))
    assert response.mode == "grounded"
    assert "gate sequence" in response.answer
    assert "X(q0)" in response.answer


def test_general_qsphere_concept(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="How does the Q-Sphere visualization work?",
        circuit=None,
    ))
    assert response.mode == "conceptual"
    assert "Q-Sphere" in response.answer
    assert "Hamming weight" in response.answer


def test_general_entanglement_concept(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="What is entanglement and Bell state?",
        circuit=None,
    ))
    assert response.mode == "conceptual"
    assert "entanglement" in response.answer.lower()
    assert "Bell state" in response.answer


def test_why_top_of_bloch(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="Why is q[0] at the top of the Bloch sphere?",
        circuit=Circuit(qubits=2, gates=[]),
    ))
    assert "ground state |0⟩" in response.answer
    assert "North Pole" in response.answer


def test_qsphere_conceptual_query_with_circuit(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="What is a Q-Sphere, how to read latitude (Hamming weights), node sizes (probabilities), and color hues (quantum phase angles θ).",
        circuit=Circuit(qubits=2, gates=[]),
    ))
    assert "Hamming weight" in response.answer
    assert "Color / Hue" in response.answer


def test_statevector_evolution_query(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = answer(ChatRequest(
        message="How statevector amplitudes and basis probabilities evolve step-by-step as each gate executes.",
        circuit=Circuit(qubits=2, gates=[]),
    ))
    assert "Probability Timeline" in response.answer




