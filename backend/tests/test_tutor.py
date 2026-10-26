import logging
from unittest.mock import MagicMock, patch
import pytest

from app.schemas import ChatRequest, Circuit, Gate
from app.tutor_service import answer


@pytest.fixture(autouse=True)
def clear_ai_keys(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)


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


def test_openrouter_answer_success(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    mock_res = MagicMock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "choices": [
            {"message": {"role": "assistant", "content": "Superposition is quantum magic."}}
        ]
    }
    with patch("requests.post", return_value=mock_res) as mock_post:
        res = answer(ChatRequest(message="What is superposition?", circuit=None))
        assert res.provider == "openrouter"
        assert "Superposition is quantum magic." in res.answer
        assert mock_post.called


def test_clean_ai_output_strips_thinking(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    raw_content = (
        "<think>The user wants me to analyze this circuit carefully.</think>\n"
        "### 🌀 Quantum Teleportation Protocol\n"
        "Here is the clean answer."
    )
    mock_res = MagicMock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "choices": [{"message": {"role": "assistant", "content": raw_content}}]
    }
    with patch("requests.post", return_value=mock_res):
        res = answer(ChatRequest(message="Walk through teleportation", circuit=None))
        assert "<think>" not in res.answer
        assert "The user wants me to analyze" not in res.answer
        assert "### 🌀 Quantum Teleportation Protocol" in res.answer


def test_openrouter_timing_and_usage_logging(monkeypatch, caplog):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    mock_res = MagicMock()
    mock_res.status_code = 200
    mock_res.json.return_value = {
        "model": "deepseek/deepseek-chat",
        "usage": {"prompt_tokens": 55, "completion_tokens": 25, "total_tokens": 80},
        "choices": [
            {"message": {"role": "assistant", "content": "Entanglement is spooky action at a distance."}}
        ],
    }
    with patch("requests.post", return_value=mock_res):
        with caplog.at_level(logging.INFO):
            res = answer(ChatRequest(
                message="Explain entanglement in this circuit.",
                circuit=Circuit(qubits=2, gates=[Gate(type="H", targets=[0])]),
            ))
            assert res.provider == "openrouter"
            assert any(
                "Tutor timing:" in record.message
                and "simulation=" in record.message
                and "llm=" in record.message
                and "total=" in record.message
                and "Model: deepseek/deepseek-chat" in record.message
                and "prompt_tokens=55" in record.message
                and "completion_tokens=25" in record.message
                for record in caplog.records
            )


def test_model_priority_fallback_and_retry(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_PRIORITY", "broken-model,working-model")

    res_503 = MagicMock(status_code=503, text="Service Unavailable", headers={})
    res_200 = MagicMock(
        status_code=200,
        json=lambda: {
            "model": "working-model",
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            "choices": [{"message": {"role": "assistant", "content": "Working model response."}}],
        },
    )

    with patch("time.sleep", return_value=None):
        with patch("requests.post", side_effect=[res_503, res_503, res_200]) as mock_post:
            resp = answer(ChatRequest(message="What is a qubit?", circuit=None))
            assert resp.provider == "openrouter"
            assert "Working model response." in resp.answer
            assert mock_post.call_count == 3  # broken (try 1), broken (retry 1), working (try 1)


def test_model_priority_404_skips_immediately(monkeypatch, caplog):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_PRIORITY", "nonexistent-model,working-model")

    res_404 = MagicMock(status_code=404, text='{"error": "model not found"}', headers={})
    res_200 = MagicMock(
        status_code=200,
        json=lambda: {
            "model": "working-model",
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            "choices": [{"message": {"role": "assistant", "content": "Recovered via working model."}}],
        },
    )

    with patch("requests.post", side_effect=[res_404, res_200]) as mock_post:
        with caplog.at_level(logging.ERROR):
            resp = answer(ChatRequest(message="What is a qubit?", circuit=None))
            assert resp.provider == "openrouter"
            assert "Recovered via working model." in resp.answer
            assert mock_post.call_count == 2  # 404 should NOT be retried
            assert any("Configuration error:" in record.message and "nonexistent-model" in record.message for record in caplog.records)


def test_all_models_fail_returns_rule_engine(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_PRIORITY", "failing-model-1,failing-model-2")

    res_500 = MagicMock(status_code=500, text="Internal Server Error", headers={})

    with patch("requests.post", return_value=res_500):
        resp = answer(ChatRequest(message="What is superposition?", circuit=None))
        assert resp.provider == "local-fallback"
        assert "superposition" in resp.answer.lower()
