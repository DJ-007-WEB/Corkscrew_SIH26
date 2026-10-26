"""Qiskit-grounded tutor orchestration.

For circuit questions, Qiskit is invoked before the LLM and the model receives
the resulting facts as read-only context.  The model is never asked to perform
quantum calculation itself.
"""

import logging
import os
import re
import time

import requests
from dotenv import load_dotenv

from .circuit_builder import validate_circuit
from .quantum_tools import circuit_facts
from .schemas import ChatRequest, ChatResponse, GroundedFact
from .tutor_store import recommendation, save_turn

load_dotenv()

_CIRCUIT_WORDS = (
    "circuit", "q[", "qubit", "gate", "bloch", "sphere", "probability",
    "state", "measure", "result", "timeline", "visual", "phase",
    "amplitude", "histogram", "microscope", "cnot", "hadamard", "step",
    "entanglement", "bell", "constant", "balanced", "oracle", "deutsch", "grover", "teleport"
)
_SYSTEM_PROMPT = """You are QuantumLab AI, an expert, inspiring, and friendly Quantum Physics Professor & AI Tutor.
Your mission is to guide students through quantum computing, circuit simulations, and quantum phenomena with clarity, deep physical intuition, and engaging conversational warmth.

CRITICAL INSTRUCTIONS:
- Directly output your final, beautifully formatted pedagogical response.
- NEVER output internal monologue, chain-of-thought, scratchpads, meta-commentary, or phrases like "The user wants me to...", "Let me analyze...", or "I need to handle this carefully".
- Start immediately with the student-facing answer.

FORMATTING & STYLE RULES:
1. RICH VISUAL STRUCTURE:
   - Organize your answer with clear bold headings (e.g. ### 🌀 Gate Dynamics, ### ⚛️ Statevector Evolution, ### 📊 Measurement Outcomes, ### 💡 Physical Intuition).
   - Use clean bulleted lists with bold keywords to break down complex mechanisms step-by-step.
   - Use helpful contextual emojis (⚛️, 🌀, 🔗, 📊, 💡, 🎯, 🚀) to make explanations inviting and visually engaging.
   - Use Markdown tables when comparing states, gates, or measurement outcomes.
2. CLEAN PLAIN TEXT NOTATION (NO RAW UNRENDERED LATEX):
   - Never use raw LaTeX commands that break readability (never write \\rangle, \\langle, \\to, \\frac, \\psi).
   - Write quantum states and gates using standard readable notation: |0>, |1>, |+>, |->, |00>, |11>, (|00> + |11>)/sqrt(2), q0, q1, ->.
3. GROUNDED IN REAL SIMULATION FACTS:
   - When a 'CIRCUIT VERIFIED FACTS' block is provided, explain why those exact measurement probabilities, Bloch vectors, and Q-Sphere phases follow mathematically and physically from the gates in the circuit.
   - If the user asks about an advanced protocol (like teleportation or Grover) but the current circuit is empty or in an initial state |00>, clearly explain both how the protocol works and note that the current simulator circuit is at step 0 / initial state ready for gates to be added.
4. FULL, INVITING & POLISHED:
   - Always deliver a complete, friendly, structured explanation from start to finish."""



def _clean_latex(text: str) -> str:
    if not text:
        return ""
    t = text
    # Remove block math delimiters $$ ... $$
    t = re.sub(r"\$\$(.*?)\$\$", r"\1", t, flags=re.DOTALL)
    # Replace common LaTeX macros with clean text
    t = t.replace(r"\rangle", ">")
    t = t.replace(r"\langle", "|")
    t = t.replace(r"\longrightarrow", " -> ")
    t = t.replace(r"\rightarrow", " -> ")
    t = t.replace(r"\to", " -> ")
    t = t.replace(r"\otimes", " (x) ")
    t = t.replace(r"\sqrt{2}", "sqrt(2)")
    t = re.sub(r"\\sqrt\{([^}]+)\}", r"sqrt(\1)", t)
    t = re.sub(r"\\frac\{([^}]+)\}\{([^}]+)\}", r"(\1) / (\2)", t)
    t = re.sub(r"\\text\{([^}]+)\}", r"\1", t)
    t = t.replace(r"\pi", "pi")
    t = t.replace(r"\psi", "psi")
    t = t.replace(r"\phi", "phi")
    t = t.replace(r"\Phi", "Phi")
    t = t.replace(r"\Psi", "Psi")
    # Remove inline $...$ math wrappers safely (single line)
    t = re.sub(r"\$([^$\n]+)\$", r"\1", t)
    # Remove any stray dollar signs
    t = t.replace("$", "")
    # Clean up subscripts like q_0 -> q0
    t = re.sub(r"q_(\d+)", r"q\1", t)
    return t


def _clean_ai_output(text: str) -> str:
    """Filter out chain-of-thought, reasoning tags, and clean math notation."""
    if not text:
        return ""
    t = text
    # 1. Strip explicit reasoning/thinking tags
    t = re.sub(r"<(think|thought)>.*?</\1>", "", t, flags=re.DOTALL).strip()

    # 2. If model leaked untagged self-talk preamble before a Markdown heading, strip it
    match = re.search(r"(###?\s+[^\n]+)", t)
    if match and match.start() > 0:
        preamble = t[:match.start()].strip()
        thinking_markers = [
            "the user wants", "circuit verified facts", "let me analyze", "i need to handle",
            "let's check", "wait, there's", "i should:", "my task is", "looking at the facts"
        ]
        if any(marker in preamble.lower() for marker in thinking_markers):
            t = t[match.start():].strip()

    # 3. Clean LaTeX artifacts
    return _clean_latex(t)


def answer(request: ChatRequest) -> ChatResponse:
    total_start = time.perf_counter()
    sim_time = 0.0

    grounded = request.circuit is not None and _is_circuit_question(request.message)
    tools_used: list[str] = []
    facts: list[GroundedFact] = []

    if grounded:
        sim_start = time.perf_counter()
        validate_circuit(request.circuit)
        tools_used, facts = circuit_facts(request.circuit, _mentioned_qubit(request.message))
        sim_time = time.perf_counter() - sim_start

    prompt = _build_prompt(request, facts)
    
    # 1. Try OpenRouter first if configured
    llm_answer, model_name, usage, llm_time = _openrouter_answer(prompt)
    provider_used = "openrouter"

    # 2. If OpenRouter returned nothing/timed out, try direct Google Gemini API
    if not llm_answer:
        gemini_answer, gemini_model, g_time = _gemini_direct_answer(prompt)
        if gemini_answer:
            llm_answer = gemini_answer
            model_name = gemini_model
            llm_time = g_time
            provider_used = "gemini"

    total_time = time.perf_counter() - total_start

    logger.info(
        "Tutor timing: simulation=%.3fs, llm=%.3fs, total=%.3fs | Provider: %s | Model: %s",
        sim_time,
        llm_time,
        total_time,
        provider_used,
        model_name or "none",
    )

    if llm_answer:
        cleaned_answer = _clean_ai_output(llm_answer)
        response = ChatResponse(
            answer=cleaned_answer,
            mode="grounded" if grounded else "conceptual",
            tools_used=tools_used,
            facts=facts,
            provider=provider_used,
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


def _gemini_direct_answer(prompt: str) -> tuple[str | None, str, float]:
    """Direct fast call to Google Gemini REST endpoint as secondary provider."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None, "", 0.0

    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": f"{_SYSTEM_PROMPT}\n\n{prompt}"}]}],
        "generationConfig": {
            "temperature": 0.5,
            "maxOutputTokens": 1024,
        },
    }
    t0 = time.perf_counter()
    try:
        res = requests.post(url, json=payload, timeout=7.0)
        dur = time.perf_counter() - t0
        if res.status_code == 200:
            data = res.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                text = "".join(p.get("text", "") for p in parts if "text" in p)
                if text.strip():
                    return text.strip(), model, dur
        else:
            logger.warning("Direct Gemini call returned %s: %s", res.status_code, res.text[:200])
    except Exception as exc:
        logger.warning("Direct Gemini call failed: %s", exc)
    return None, "", time.perf_counter() - t0


def stream_answer(request: ChatRequest):
    """Generator yielding SSE events formatted as JSON chunks."""
    import json

    grounded = request.circuit is not None and _is_circuit_question(request.message)
    tools_used: list[str] = []
    facts: list[GroundedFact] = []

    if grounded:
        try:
            validate_circuit(request.circuit)
            tools_used, facts = circuit_facts(request.circuit, _mentioned_qubit(request.message))
        except Exception as exc:
            logger.warning("Circuit pre-computation error in streaming: %s", exc)

    rec = recommendation(request.message, tools_used)

    # Initial metadata chunk
    init_meta = {
        "type": "meta",
        "mode": "grounded" if grounded else "conceptual",
        "tools_used": tools_used,
        "facts": [f.model_dump() if hasattr(f, "model_dump") else f.__dict__ for f in facts],
        "recommendation": rec,
    }
    yield f"data: {json.dumps(init_meta)}\n\n"

    prompt = _build_prompt(request, facts)
    full_text: list[str] = []

    # 1. Try streaming from OpenRouter
    streamed = False
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    models = _get_model_priority()

    if api_key and models:
        for model in models:
            try:
                res = requests.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "HTTP-Referer": "http://localhost:5173",
                        "X-Title": "QuantumLab AI Tutor",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": _SYSTEM_PROMPT},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.5,
                        "max_tokens": 1024,
                        "stream": True,
                    },
                    timeout=7.0,
                    stream=True,
                )
                if res.status_code == 200:
                    for line in res.iter_lines():
                        if not line:
                            continue
                        if line.startswith(b"data: "):
                            raw = line[6:].decode("utf-8").strip()
                            if raw == "[DONE]":
                                streamed = True
                                break
                            try:
                                chunk = json.loads(raw)
                                choices = chunk.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    delta_text = delta.get("content", "")
                                    if delta_text:
                                        cleaned = _clean_latex(delta_text)
                                        full_text.append(cleaned)
                                        yield f"data: {json.dumps({'type': 'token', 'token': cleaned})}\n\n"
                            except Exception:
                                continue
                    if streamed:
                        break
            except Exception as exc:
                logger.warning("Streaming from OpenRouter model %s failed: %s", model, exc)

    # 2. If OpenRouter didn't stream, try direct Gemini streaming
    if not streamed:
        gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
        gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
        if gemini_key:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:streamGenerateContent?alt=sse&key={gemini_key}"
                res = requests.post(
                    url,
                    json={
                        "contents": [{"parts": [{"text": f"{_SYSTEM_PROMPT}\n\n{prompt}"}]}],
                        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 1024},
                    },
                    timeout=8.0,
                    stream=True,
                )
                if res.status_code == 200:
                    for line in res.iter_lines():
                        if not line:
                            continue
                        if line.startswith(b"data: "):
                            raw = line[6:].decode("utf-8").strip()
                            try:
                                chunk = json.loads(raw)
                                candidates = chunk.get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    for p in parts:
                                        t = p.get("text", "")
                                        if t:
                                            cleaned = _clean_latex(t)
                                            full_text.append(cleaned)
                                            yield f"data: {json.dumps({'type': 'token', 'token': cleaned})}\n\n"
                                    if candidates[0].get("finishReason") in ("STOP", "MAX_TOKENS"):
                                        streamed = True
                            except Exception:
                                continue
            except Exception as exc:
                logger.warning("Streaming from direct Gemini failed: %s", exc)

    # 3. Fallback if no stream succeeded
    if not full_text:
        fallback = _fallback_answer(request.message, facts, grounded, request.focus)
        full_text.append(fallback)
        yield f"data: {json.dumps({'type': 'token', 'token': fallback})}\n\n"

    final_content = "".join(full_text).strip()
    save_turn(request.conversation_id, request.message, final_content, "grounded" if grounded else "conceptual", tools_used)
    yield f"data: {json.dumps({'type': 'done'})}\n\n"


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


logger = logging.getLogger("quantum_tutor")


def _get_model_priority() -> list[str]:
    """Read MODEL_PRIORITY list from environment without hardcoded models."""
    raw = os.getenv("MODEL_PRIORITY", "").strip()
    if not raw:
        raw = os.getenv("OPENROUTER_MODEL", "").strip()
    if not raw:
        return []
    return [model.strip() for model in raw.split(",") if model.strip()]


def _openrouter_answer(prompt: str) -> tuple[str | None, str, dict, float]:
    """Try models from MODEL_PRIORITY in order with retry, error handling, and 20s total cap.

    Returns:
        (answer_text, model_name, usage_dict, total_llm_duration)
    """
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        logger.info("OPENROUTER_API_KEY is not configured; skipping OpenRouter.")
        return None, "", {}, 0.0

    models = _get_model_priority()
    if not models:
        logger.warning("No models found in MODEL_PRIORITY or OPENROUTER_MODEL; skipping OpenRouter.")
        return None, "", {}, 0.0

    overall_start = time.perf_counter()
    total_cap = 20.0
    deadline = overall_start + total_cap

    for model in models:
        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            logger.warning("Total LLM time budget (%.1fs) exhausted before trying model %s", total_cap, model)
            break

        # Max 1 retry on 429 or 503 (attempt 0 = initial, attempt 1 = retry)
        for attempt in range(2):
            now = time.perf_counter()
            remaining = deadline - now
            if remaining <= 0.5:
                break

            call_timeout = min(10.0, remaining)
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.5,
                "max_tokens": 1024,
            }

            try:
                res = requests.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "HTTP-Referer": "http://localhost:5173",
                        "X-Title": "QuantumLab AI Tutor",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=call_timeout,
                )

                # Check 404 or "model not found"
                if res.status_code == 404 or "model not found" in res.text.lower() or "model_not_found" in res.text.lower():
                    logger.error(
                        "Configuration error: OpenRouter model '%s' was not found (404). Check MODEL_PRIORITY in .env.",
                        model,
                    )
                    break  # Skip this model immediately, do not retry

                # Check 429 or 503: retry max 1 time with wait
                if res.status_code in (429, 503):
                    if attempt == 0:
                        retry_after = res.headers.get("Retry-After")
                        wait_sec = 1.5
                        if retry_after:
                            try:
                                wait_sec = max(1.0, min(float(retry_after), 3.0))
                            except ValueError:
                                wait_sec = 1.5
                        logger.warning(
                            "OpenRouter model %s returned %s (attempt %d/2). Waiting %.1fs before retry...",
                            model,
                            res.status_code,
                            attempt + 1,
                            wait_sec,
                        )
                        if deadline - time.perf_counter() > wait_sec:
                            time.sleep(wait_sec)
                            continue
                        else:
                            break
                    else:
                        logger.warning("OpenRouter model %s failed on retry with status %s", model, res.status_code)
                        break

                if res.status_code != 200:
                    logger.warning("OpenRouter model %s returned status %s: %s", model, res.status_code, res.text[:300])
                    break  # Try next model

                data = res.json()
                answered_model = data.get("model", model)
                usage = data.get("usage", {})
                choices = data.get("choices", [])
                if choices:
                    message = choices[0].get("message", {})
                    content = message.get("content")
                    if isinstance(content, str) and content.strip():
                        duration = time.perf_counter() - overall_start
                        return content.strip(), answered_model, usage, duration

                logger.warning("OpenRouter model %s returned no text choice in response.", model)
                break  # Try next model

            except requests.Timeout:
                logger.warning("OpenRouter model %s timed out after %.1fs (attempt %d/2)", model, call_timeout, attempt + 1)
                break  # Timed out, try next model
            except requests.RequestException as exc:
                logger.warning("OpenRouter model %s request failed: %s", model, exc)
                break
            except (ValueError, TypeError, KeyError) as exc:
                logger.warning("OpenRouter model %s returned unexpected response structure: %s", model, exc)
                break

    duration = time.perf_counter() - overall_start
    logger.info("All OpenRouter models in MODEL_PRIORITY failed or timed out after %.3fs. Falling back to rule engine.", duration)
    return None, "", {}, duration


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
        if "bell" in text or "entangl" in text:
            return (
                "A Bell state is a maximally entangled state of two qubits. The state (|00⟩ + |11⟩)/√2 means "
                "that measuring one qubit instantly determines the state of the other. When you measure both qubits, "
                "you will always get correlated results: either both 0 (|00⟩) or both 1 (|11⟩). You will never get "
                "opposite outcomes (|01⟩ or |10⟩). This correlation is the hallmark of entanglement."
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

        # Bell state query
        if focus == "bell" or "bell" in text or "entangl" in text:
            bell_note = ""
            if "probabilities" in text or "outcome" in text:
                bell_note = f" Verified probabilities: {probability}."
            bell_fact = next((fact for fact in facts if fact.name == "bell_state"), None)
            bell_text = bell_fact.value if bell_fact else "Bell state analysis unavailable."
            return f"Qiskit verified Bell state: {bell_text}{bell_note}"

        # Deutsch-Jozsa query
        if focus == "deutsch" or "deutsch" in text or "constant" in text or "balanced" in text or "oracle" in text:
            dj_fact = next((fact for fact in facts if fact.name == "deutsch_jozsa"), None)
            dj_text = dj_fact.value if dj_fact else "Deutsch-Jozsa analysis unavailable."
            return f"Qiskit verified Deutsch-Jozsa result: {dj_text} Final measurement probabilities: {probability}."

        # Grover's algorithm query
        if focus == "grover" or "grover" in text or "amplitude" in text or "search" in text or "amplif" in text:
            grover_fact = next((fact for fact in facts if fact.name == "grovers"), None)
            grover_text = grover_fact.value if grover_fact else "Grover's algorithm analysis unavailable."
            return f"Qiskit verified Grover's algorithm: {grover_text} Final measurement probabilities: {probability}."

        # Quantum teleportation query
        if focus == "teleport" or "teleport" in text or "teleportation" in text:
            teleport_fact = next((fact for fact in facts if fact.name == "teleportation"), None)
            teleport_text = teleport_fact.value if teleport_fact else "Teleportation analysis unavailable."
            return f"Qiskit verified quantum teleportation: {teleport_text} Final measurement probabilities: {probability}."

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



