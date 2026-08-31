"""Qiskit-grounded tutor orchestration.

For circuit questions, Qiskit is invoked before the LLM and the model receives
the resulting facts as read-only context.  The model is never asked to perform
quantum calculation itself.
"""

import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from dotenv import load_dotenv

from .circuit_builder import validate_circuit
from .quantum_tools import circuit_facts
from .schemas import ChatRequest, ChatResponse, GroundedFact
from .tutor_store import recommendation, save_turn

load_dotenv()

_CIRCUIT_WORDS = (
    "circuit", "q[", "qubit", "gate", "bloch", "sphere", "probability",
    "state", "measure", "result", "timeline", "visual", "phase",
    "amplitude", "histogram", "microscope", "cnot", "hadamard", "step"
)
_SYSTEM_PROMPT = """You are QuantumLab Tutor, a friendly quantum-computing teacher.
For a CIRCUIT VERIFIED FACTS block, treat every numeric fact as immutable Qiskit output.
Never calculate, replace, or invent a statevector, probability, Bloch value, gate, or measurement result.
Explain why the verified result follows from the listed gates in clear student-friendly language.
If the facts do not answer the question, say what simulation/tool result is needed.
For theory and visualization questions, explain clearly with intuition, definitions, and visual analogies."""


def answer(request: ChatRequest) -> ChatResponse:
    grounded = request.circuit is not None and _is_circuit_question(request.message)
    tools_used: list[str] = []
    facts: list[GroundedFact] = []

    if grounded:
        validate_circuit(request.circuit)
        tools_used, facts = circuit_facts(request.circuit, _mentioned_qubit(request.message))

    prompt = _build_prompt(request, facts)
    llm_answer = _gemini_answer(prompt)
    if llm_answer:
        response = ChatResponse(
            answer=llm_answer,
            mode="grounded" if grounded else "conceptual",
            tools_used=tools_used,
            facts=facts,
            provider="gemini",
            recommendation=recommendation(request.message, tools_used),
        )
        save_turn(request.conversation_id, request.message, response.answer, response.mode, tools_used)
        return response

    response = ChatResponse(
        answer=_fallback_answer(request.message, facts, grounded, request.focus),
        mode="grounded" if grounded else "conceptual",
        tools_used=tools_used,
        facts=facts,
        provider="local-fallback",
        recommendation=recommendation(request.message, tools_used),
    )
    save_turn(request.conversation_id, request.message, response.answer, response.mode, tools_used)
    return response


def _is_circuit_question(message: str) -> bool:
    text = message.lower()
    return any(word in text for word in _CIRCUIT_WORDS)


def _mentioned_qubit(message: str) -> int | None:
    match = re.search(r"q\s*\[?\s*(\d+)\s*\]?", message.lower())
    return int(match.group(1)) if match else None


def _build_prompt(request: ChatRequest, facts: list[GroundedFact]) -> str:
    history = "\n".join(f"{item.role}: {item.content}" for item in request.history[-6:])
    verified = "\n".join(f"- {fact.name}: {fact.value}" for fact in facts) or "(No circuit facts: this is a theory or general visualization question.)"
    return f"{history}\nuser: {request.message}\n\nCIRCUIT VERIFIED FACTS:\n{verified}"


def _gemini_answer(prompt: str) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    payload = json.dumps({
        "system_instruction": {"parts": [{"text": _SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 500},
    }).encode("utf-8")
    request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=payload,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
        return data["candidates"][0]["content"]["parts"][0].get("text")
    except (HTTPError, URLError, KeyError, IndexError, json.JSONDecodeError):
        return None


def _fallback_answer(message: str, facts: list[GroundedFact], grounded: bool, focus: str | None = None) -> str:
    text = message.lower().strip()

    # 1. Pure conceptual/theory questions: answer conceptually regardless of whether circuit is attached
    is_conceptual_query = (
        text.startswith(("what is", "how does", "explain how", "how to read", "what does", "define", "what are", "how do"))
        or "difference between" in text
        or "how statevector" in text
        or "how probability" in text
    )

    if is_conceptual_query:
        if "q-sphere" in text or "q_sphere" in text or "q sphere" in text or "hamming" in text:
            return (
                "The Q-Sphere is a multi-qubit statevector visualization tool. Unlike the single-qubit Bloch sphere, "
                "the Q-Sphere maps an N-qubit quantum state onto a single sphere:\n"
                "• Latitude (Height): Corresponds to the Hamming weight (number of |1⟩s in the basis state, from |00...0⟩ at the north pole to |11...1⟩ at the south pole).\n"
                "• Node Size / Radius: Proportional to the measurement probability (|amplitude|²).\n"
                "• Color / Hue: Indicates the quantum phase angle θ (from -π to +π rad)."
            )
        if "bloch" in text:
            return (
                "The Bloch sphere is a geometric representation for a single qubit (a 2-level quantum system):\n"
                "• North Pole (+Z): State |0⟩ (ground state).\n"
                "• South Pole (-Z): State |1⟩ (excited state).\n"
                "• Equator (Z ≈ 0): Equal superpositions (|0⟩ ± |1⟩)/√2 (like |+⟩ on +X, |-⟩ on -X, |+i⟩ on +Y).\n"
                "• Longitude / Angle: Represents the relative phase angle φ between |0⟩ and |1⟩."
            )
        if "timeline" in text or "evolution" in text or "evolve" in text:
            return (
                "The Probability Timeline tracks how the quantum statevector evolves step-by-step as each gate is executed. "
                "At step 0 (initial state), all probability is in |0...0⟩. As gates (like Hadamard or CNOT) are applied, "
                "the timeline displays the changing probability amplitudes for each computational basis state."
            )
        if "statevector" in text or "amplitude" in text:
            return (
                "A statevector |ψ⟩ is the mathematical representation of a quantum system as a linear superposition: "
                "|ψ⟩ = Σ c_i |i⟩. Each amplitude c_i is a complex number (a + bi). The probability of measuring state |i⟩ is |c_i|²."
            )
        if "superposition" in text:
            return (
                "Superposition means a qubit can exist simultaneously in a linear combination of basis states |0⟩ and |1⟩: "
                "|ψ⟩ = α|0⟩ + β|1⟩ (with |α|² + |β|² = 1). Measurement collapses this superposition into a single outcome."
            )
        if "entangle" in text or "bell" in text:
            return (
                "Quantum entanglement occurs when two or more qubits are correlated such that the quantum state cannot be factored "
                "into individual qubit states. For example, the Bell state (|00⟩ + |11⟩)/√2 creates maximal entanglement where measuring "
                "one qubit instantly determines the state of the other."
            )
        if "cnot" in text or "cx" in text:
            return (
                "The CNOT (Controlled-NOT) gate flips the target qubit if and only if the control qubit is |1⟩. "
                "It is the fundamental 2-qubit entangling gate."
            )
        if "hadamard" in text or "h gate" in text:
            return (
                "The Hadamard (H) gate creates an equal superposition: H|0⟩ = (|0⟩ + |1⟩)/√2 = |+⟩, and H|1⟩ = (|0⟩ - |1⟩)/√2 = |-⟩. "
                "Geometrically, it rotates the statevector 90° from the Z-axis to the X-axis on the Bloch sphere."
            )
        if "phase" in text:
            return (
                "Quantum phase is the complex argument θ in an amplitude r*e^(iθ). Relative phases between basis states create "
                "constructive and destructive interference when quantum gates are applied."
            )
        if "measure" in text or "born" in text or "collapse" in text:
            return (
                "Measurement collapses a superposition into one definite basis state |x⟩ with probability P(x) = |⟨x|ψ⟩|² (Born's rule)."
            )

    # 2. Grounded circuit questions with active circuit numbers
    if grounded and facts:
        probability = next((fact.value for fact in facts if fact.name == "measurement_probabilities"), "No non-zero outcomes were returned.")
        bloch_fact = next((fact for fact in facts if fact.name.startswith("bloch_vector")), None)
        gates = next((fact.value for fact in facts if fact.name == "gate_sequence"), "").rstrip(".")
        q_sphere = next((fact.value for fact in facts if fact.name == "q_sphere_points"), None)
        timeline = next((fact.value for fact in facts if fact.name == "probability_timeline"), None)

        # Why is q[0] at the top?
        if "why" in text and ("top" in text or "bottom" in text or "pole" in text or "bloch" in text):
            if bloch_fact:
                match = re.search(r"\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)", bloch_fact.value)
                if match:
                    z = float(match.group(3))
                    if z > 0.1:
                        return (
                            f"Qubit q[0] starts in the computational ground state |0⟩. On the Bloch sphere, |0⟩ is located at the North Pole (Z = +1). "
                            f"Because {gates if gates != 'No gates; initial state is |0...0>' else 'no gates have operated on it'}, "
                            f"its Bloch vector is {bloch_fact.value}, pointing directly at the top pole (|0⟩)."
                        )
                    if z < -0.1:
                        return (
                            f"Qubit q[0] is at the bottom pole, |1⟩ because gates ({gates}) flipped or rotated it to the South Pole (Z = -1). "
                            f"Its verified Bloch vector is {bloch_fact.value}."
                        )

        # Q-Sphere button / query
        if focus == "q_sphere" or "q-sphere" in text or "q_sphere" in text or "q sphere" in text:
            points_desc = q_sphere if q_sphere else "No non-zero basis-state points."
            return (
                f"Qiskit verified Q-Sphere representation. Active basis states and phase values: {points_desc}. "
                f"In the Q-Sphere, node position reflects Hamming weight, node size is measurement probability, and hue is quantum phase."
            )

        # Gate button / query
        if focus == "gate" or ("gate" in text and "bloch" not in text and "sphere" not in text and "timeline" not in text):
            return f"Qiskit verified gate sequence: {gates}. Final measurement probabilities: {probability}." + (f" Step-by-step timeline: {timeline}." if timeline else "")

        # Timeline button / query
        if focus == "timeline" or "timeline" in text or "step" in text:
            return f"Qiskit verified probability timeline across execution steps: {timeline}. Final probabilities: {probability}."

        # Bloch sphere button / query
        bloch_note = ""
        if bloch_fact:
            bloch_label = f"{bloch_fact.name.replace('_', ' ')} = {bloch_fact.value}"
            match = re.search(r"\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)", bloch_fact.value)
            if match:
                z = float(match.group(3))
                if z < -0.1:
                    pole_desc = "A Bloch vector near (0, 0, -1) means the qubit is at the bottom pole, |1⟩."
                elif z > 0.1:
                    pole_desc = "A Bloch vector near (0, 0, 1) means the qubit is at the top pole, |0⟩."
                else:
                    pole_desc = "A Bloch vector on the equator (Z ≈ 0) represents an equal superposition between |0⟩ and |1⟩."
                bloch_note = f" {bloch_label}. {pole_desc}"
            else:
                bloch_note = f" {bloch_label}."
        return f"Qiskit verified this circuit. Gates: {gates}. Final measurement probabilities: {probability}.{bloch_note}"

    return (
        "I am QuantumLab Tutor. You can ask me about your active circuit, quantum gates (H, X, Y, Z, CNOT), "
        "visualizations (Bloch Sphere, Q-Sphere, Probability Timeline), or core quantum concepts (Superposition, Entanglement, Phase, Born rule)."
    )



