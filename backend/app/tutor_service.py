"""Qiskit-grounded tutor orchestration.

For circuit questions, Qiskit is invoked before the LLM and the model receives
the resulting facts as read-only context.  The model is never asked to perform
quantum calculation itself.
"""

import logging
import math
import os
import re
import time

import requests
from dotenv import load_dotenv

from .circuit_builder import validate_circuit
from .quantum_tools import circuit_facts
from .schemas import ChatRequest, ChatResponse, Circuit, Gate, GroundedFact
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
    provider_used = "openrouter" if llm_answer else "local-fallback"

    # 2. If OpenRouter returned nothing/timed out, try direct Google Gemini API
    if not llm_answer:
        gemini_answer, gemini_model, g_time = _gemini_direct_answer(prompt)
        if gemini_answer:
            llm_answer = gemini_answer
            model_name = gemini_model
            llm_time = g_time
            provider_used = "gemini"

    total_time = time.perf_counter() - total_start

    usage_text = ""
    if usage:
        usage_text = (
            f" | prompt_tokens={usage.get('prompt_tokens', 0)}"
            f" | completion_tokens={usage.get('completion_tokens', 0)}"
        )

    logger.info(
        "Tutor timing: simulation=%.3fs, llm=%.3fs, total=%.3fs | Provider: %s | Model: %s%s",
        sim_time,
        llm_time,
        total_time,
        provider_used,
        model_name or "none",
        usage_text,
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
        answer=_fallback_answer(request.message, facts, grounded, request.focus, request.circuit),
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
        fallback = _fallback_answer(request.message, facts, grounded, request.focus, request.circuit)
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


def _fact_map(facts: list[GroundedFact]) -> dict[str, str]:
    return {fact.name: fact.value for fact in facts}


def _parse_probabilities(value: str) -> list[tuple[str, float]]:
    return [(state, float(probability)) for state, probability in re.findall(r"\|([01]+)>:\s*([0-9.]+)", value or "")]


def _parse_timeline(value: str) -> list[tuple[int, list[tuple[str, float]]]]:
    steps: list[tuple[int, list[tuple[str, float]]]] = []
    for chunk in (value or "").split("; "):
        match = re.match(r"step\s+(\d+):\s*(.*)", chunk.strip())
        if not match:
            continue
        outcomes = [(state, float(probability)) for state, probability in re.findall(r"\|([01]+)>=([0-9.]+)", match.group(2))]
        steps.append((int(match.group(1)), outcomes))
    return steps


def _parse_qsphere(value: str) -> list[tuple[str, float, float]]:
    points: list[tuple[str, float, float]] = []
    for chunk in (value or "").split(";"):
        match = re.search(r"\|([01]+)>:\s*probability=([0-9.]+),\s*phase=(-?[0-9.]+)", chunk)
        if match:
            points.append((match.group(1), float(match.group(2)), float(match.group(3))))
    return points


def _parse_bloch(value: str) -> tuple[float, float, float] | None:
    match = re.search(r"\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\)", value or "")
    if not match:
        return None
    return (float(match.group(1)), float(match.group(2)), float(match.group(3)))


def _bloch_position(z: float) -> str:
    if z > 0.1:
        return "top pole, |0⟩"
    if z < -0.1:
        return "bottom pole, |1⟩"
    return "equator (equal-magnitude superposition)"


def _bloch_explanation(x: float, y: float, z: float) -> str:
    if z > 0.1:
        return (
            "It points toward the **North Pole (Z = +1)**, which is the computational ground state |0⟩. "
            f"The Bloch vector has length {math.sqrt(x * x + y * y + z * z):.3f}, and a near-unit Z component "
            "means a measurement is strongly biased toward 0."
        )
    if z < -0.1:
        return (
            "It points toward the **South Pole (Z = -1)**, which is the computational basis state |1⟩. "
            f"The Bloch vector has length {math.sqrt(x * x + y * y + z * z):.3f}, and a near-minus-one Z component "
            "means a measurement is strongly biased toward 1."
        )
    return (
        "It lies on the **equator (Z ≈ 0)** of the Bloch sphere. The equator contains equal-magnitude superpositions "
        "such as |+⟩ and |−⟩; the X and Y coordinates encode the relative phase between |0⟩ and |1⟩. "
        "Because Z ≈ 0, a computational-basis measurement is close to a 50/50 split."
    )


def _gate_label(gate: Gate) -> str:
    if gate.type in ("CNOT", "CZ") and gate.controls:
        return f"{gate.type}(q{gate.controls[0]} → q{gate.targets[0]})"
    if gate.type == "SWAP" and len(gate.targets) >= 2:
        return f"SWAP(q{gate.targets[0]} ↔ q{gate.targets[1]})"
    if gate.params:
        return f"{gate.type}(q{gate.targets[0]}, θ={gate.params[0]:.4g})"
    return f"{gate.type}(q{gate.targets[0]})"


def _gate_explanation(gate: Gate) -> str:
    return {
        "H": "creates an equal superposition of |0⟩ and |1⟩ on that qubit.",
        "X": "flips |0⟩ and |1⟩ (a bit-flip, equivalent to a π rotation about X up to phase).",
        "Y": "performs a bit-flip and a phase-flip together.",
        "Z": "leaves |0⟩ unchanged and multiplies |1⟩ by −1 (a phase-flip).",
        "S": "multiplies |1⟩ by i, adding a quarter-turn phase about Z.",
        "T": "multiplies |1⟩ by e^(iπ/4), adding an eighth-turn phase about Z.",
        "RX": "rotates the qubit state by the given angle about the X axis.",
        "RY": "rotates the qubit state by the given angle about the Y axis.",
        "RZ": "rotates the qubit state by the given angle about the Z axis.",
        "CNOT": "flips the target qubit exactly when the control qubit is |1⟩; this is how the circuit creates entanglement.",
        "CZ": "applies a Z phase to the target exactly when the control qubit is |1⟩.",
        "SWAP": "exchanges the quantum states stored in the two qubits.",
    }.get(gate.type, "applies the corresponding unitary operation to the circuit state.")


def _gate_sequence_section(sequence: str, circuit: Circuit | None) -> str:
    lines = [
        "### 🔗 Gate Sequence",
        "The verified **gate sequence** for the current circuit is:",
        "",
        f"Gates: {sequence}",
    ]
    if circuit and circuit.gates:
        lines += ["", "**What each operation does**"]
        for index, gate in enumerate(circuit.gates, start=1):
            lines.append(f"{index}. `{_gate_label(gate)}` — {_gate_explanation(gate)}")
    elif circuit is not None:
        lines += ["", "No gates have been applied yet, so the circuit is still in its initial state."]
    return "\n".join(lines)


def _probability_table(probabilities: list[tuple[str, float]]) -> str:
    if not probabilities:
        return "_No non-zero measurement outcomes were returned._"
    lines = ["| Basis state | Probability |", "| --- | --- |"]
    for state, probability in sorted(probabilities, key=lambda item: (-item[1], item[0])):
        # The pipe in a ket is escaped as an HTML entity so it cannot split a
        # Markdown table cell.
        lines.append(f"| &#124;{state}⟩ | {probability * 100:.2f}% |")
    return "\n".join(lines)


def _probabilities_section(probabilities: list[tuple[str, float]], backend: str) -> str:
    return "\n".join([
        "### 📊 Measurement Outcomes",
        f"These probabilities come from the actual statevector simulation on **{backend}**:",
        "",
        _probability_table(probabilities),
    ])


def _qsphere_section(points: list[tuple[str, float, float]]) -> str:
    lines = [
        "### 🌐 Q-Sphere Snapshot",
        "The Q-Sphere places every active basis state on one sphere. Latitude is the **Hamming weight** "
        "(the number of 1s in the basis label), node size is the measurement probability, and hue is the relative phase.",
        "",
    ]
    if points:
        lines += ["| Basis state | Probability | Phase (rad) | Phase (deg) | Hamming weight |", "| --- | --- | --- | --- | --- |"]
        for state, probability, phase in sorted(points, key=lambda item: (-item[1], item[0])):
            lines.append(
                f"| &#124;{state}⟩ | {probability * 100:.2f}% | {phase:.4f} | {math.degrees(phase):.1f}° | {state.count('1')} |"
            )
    else:
        lines.append("_No non-zero basis-state points were returned._")
    return "\n".join(lines)


def _timeline_section(timeline: list[tuple[int, list[tuple[str, float]]]], circuit: Circuit | None) -> str:
    lines = [
        "### 🌀 Probability Timeline",
        "Each row shows how the measurement distribution changes as the circuit executes:",
        "",
        "| Step | Operation | Non-zero outcomes |",
        "| --- | --- | --- |",
    ]
    if not timeline:
        lines.append("| — | — | _Timeline data unavailable._ |")
        return "\n".join(lines)
    for step, outcomes in timeline:
        if step == 0:
            operation = "Initial state"
        elif circuit is not None and 0 < step <= len(circuit.gates):
            operation = f"`{_gate_label(circuit.gates[step - 1])}`"
        else:
            operation = f"Step {step}"
        outcome_text = ", ".join(
            f"&#124;{state}⟩ = {probability * 100:.2f}%" for state, probability in outcomes
        ) or "—"
        lines.append(f"| {step} | {operation} | {outcome_text} |")
    return "\n".join(lines)


def _interpretation_section(probabilities: list[tuple[str, float]], circuit: Circuit | None) -> str:
    if not probabilities:
        return "### 💡 What This Means\n\nThe simulator did not return any non-zero measurement outcome."
    non_zero = len(probabilities)
    dominant_state, dominant_probability = max(probabilities, key=lambda item: item[1])
    if non_zero == 1 and abs(dominant_probability - 1.0) < 1e-8:
        meaning = (
            f"The circuit is deterministic in the computational basis: measuring it will produce `|{dominant_state}⟩` "
            "with essentially 100% probability."
        )
    elif non_zero == 2 and all(abs(probability - 0.5) < 0.01 for _, probability in probabilities):
        meaning = (
            "The final state is an equal two-outcome superposition. Repeated measurements will split roughly 50/50 "
            "between the two listed basis states, even though each individual measurement returns only one outcome."
        )
    else:
        meaning = (
            f"The final state is spread across {non_zero} computational-basis state(s). The most likely single outcome "
            f"is `|{dominant_state}⟩` at {dominant_probability * 100:.2f}%."
        )
    if circuit is not None and not circuit.gates:
        meaning += " The circuit currently has no gates, so this is simply the initialized |0...0⟩ state."
    return f"### 💡 What This Means\n\n{meaning}"


def _next_step_section(focus: str | None) -> str:
    if focus == "q_sphere":
        hint = "Add an S or T gate and watch the Q-Sphere hue change while the probabilities stay the same."
    elif focus == "bloch":
        hint = "Compare this Bloch vector before and after one gate to see which axis the gate rotates around."
    elif focus == "timeline":
        hint = "Step through the timeline one gate at a time and identify the exact step where the distribution changes."
    elif focus == "bell":
        hint = "Remove the CNOT and run again: the correlations should disappear, leaving two independent qubits."
    else:
        hint = "Change one gate, rerun the circuit, and compare the new probabilities with the table above."
    return f"### 🚀 Try This Next\n\n{hint}"


def _qsphere_concept_answer() -> str:
    return "\n".join([
        "### 🌐 The Q-Sphere, Explained",
        "The **Q-Sphere** visualizes an entire multi-qubit statevector on a single sphere. Each active computational "
        "basis state becomes a node, so it is the natural multi-qubit companion to the single-qubit Bloch sphere.",
        "",
        "### 📐 How to Read It",
        "- **Latitude — Hamming weight:** the number of 1s in a basis label. |00...0⟩ sits at one pole and |11...1⟩ at the other.",
        "- **Node size / radius — probability:** a larger node means a larger measurement probability |amplitude|².",
        "- **Color / Hue — quantum phase:** the relative phase of that amplitude, usually shown from −π to +π radians.",
        "- **Position around the sphere:** states with the same Hamming weight share a latitude ring, while phase determines their place on that ring.",
        "",
        "### 🧠 Why It Matters",
        "Two states can have identical probabilities but different phases. The Q-Sphere exposes that difference, which is "
        "exactly what matters for interference. A phase that looks invisible today can change the measurement distribution "
        "after another gate is applied.",
        "",
        "### 🧪 How to Use It in QuantumLab",
        "Run a circuit, open **Visualizations**, and compare the Q-Sphere with the probability table. Then add an S, T, or "
        "Z gate and watch the phases move even when the probabilities do not.",
    ])


def _bloch_concept_answer() -> str:
    return "\n".join([
        "### 🧭 The Bloch Sphere, Explained",
        "The **Bloch sphere** is a complete geometric picture of a single qubit's pure state. A point on the surface "
        "encodes both the measurement bias and the relative phase.",
        "",
        "### 📍 Key Locations",
        "- **North Pole (+Z):** the computational ground state |0⟩.",
        "- **South Pole (−Z):** the computational basis state |1⟩.",
        "- **Equator (Z ≈ 0):** equal-magnitude superpositions such as |+⟩ and |−⟩; the longitude encodes relative phase.",
        "",
        "### 🧮 Reading the Coordinates",
        "For a Bloch vector (x, y, z), the computational-basis probabilities are `P(0) = (1 + z) / 2` and "
        "`P(1) = (1 − z) / 2`. The X and Y components describe coherence and phase, not a classical bit value.",
        "",
        "### ⚠️ Important Limitation",
        "The Bloch sphere represents one qubit at a time. For an entangled multi-qubit state, each qubit's reduced "
        "Bloch vector can have length less than one, because some information is stored in correlations rather than "
        "in the individual qubit.",
    ])


def _timeline_concept_answer() -> str:
    return "\n".join([
        "### 🌀 The Probability Timeline",
        "The **Probability Timeline** records the quantum state after every operation. Step 0 is the initialized state; "
        "each later step shows the distribution after one more gate.",
        "",
        "### 🔍 What to Look For",
        "- A gate that changes probabilities moves weight between basis states.",
        "- A phase-only gate can leave the probabilities unchanged while changing the amplitudes and the Q-Sphere phases.",
        "- Interference appears as probability moving into some outcomes and out of others after a later gate.",
        "",
        "### 🧪 Try It",
        "Build `H → Z → H` on one qubit and compare it with `H → H`. The intermediate probabilities may look similar, "
        "but the final interference pattern is different.",
    ])


def _statevector_concept_answer() -> str:
    return "\n".join([
        "### ⚛️ Statevectors and Amplitudes",
        "An N-qubit pure state is written as a superposition of computational-basis states:",
        "",
        "`|ψ⟩ = c₀|0...0⟩ + c₁|0...1⟩ + ... + cₙ|1...1⟩`",
        "",
        "Each `cᵢ` is a complex **probability amplitude**. The measurement probability of basis state `|i⟩` is `|cᵢ|²`, "
        "and all probabilities sum to one. The phase of an amplitude does not affect an immediate measurement, but it "
        "controls how amplitudes interfere when more gates are applied.",
        "",
        "### 📊 In QuantumLab",
        "The statevector panel shows the real and imaginary parts. The probability bars show their squared magnitudes, "
        "and the Q-Sphere shows both magnitude and phase together.",
    ])


def _superposition_concept_answer() -> str:
    return "\n".join([
        "### 🌊 Superposition, Explained",
        "**Superposition** means a quantum system can exist in a linear combination of basis states. For one qubit:",
        "",
        "`|ψ⟩ = α|0⟩ + β|1⟩`, with `|α|² + |β|² = 1`.",
        "",
        "### 🧮 What the Amplitudes Mean",
        "- `α` and `β` are complex probability amplitudes, not classical probabilities.",
        "- A measurement returns 0 with probability `|α|²` and 1 with probability `|β|²`.",
        "- The relative phase between `α` and `β` is invisible in one measurement but affects later interference.",
        "",
        "### ⚡ How It Is Created",
        "A Hadamard gate maps |0⟩ to `(|0⟩ + |1⟩)/√2`, producing an equal superposition. Measurement then collapses the "
        "state to one definite outcome; the superposition is not a hidden classical coin.",
        "",
        "### ⚠️ Common Misconception",
        "A qubit in superposition does not return both answers at once. The power of quantum computing comes from "
        "engineering interference before measurement, not from reading every branch.",
    ])


def _entanglement_concept_answer() -> str:
    return "\n".join([
        "### 🔗 Entanglement and Bell States",
        "**Entanglement** occurs when two or more qubits share a joint quantum state that cannot be factored into "
        "independent single-qubit states. The state carries correlations that no local description can reproduce.",
        "",
        "### 🔔 The Bell State",
        "The standard Bell state is `(|00⟩ + |11⟩)/√2`. Measuring one qubit immediately tells you the other qubit's "
        "outcome: the results are always correlated as 00 or 11, never 01 or 10.",
        "",
        "### 🧪 How to Build It",
        "1. Start with |00⟩.",
        "2. Apply **H** to q0, creating `(|0⟩ + |1⟩)/√2`.",
        "3. Apply **CNOT** with q0 as control and q1 as target.",
        "",
        "The CNOT turns the superposition into a joint entangled state. The measurement table should show roughly 50% "
        "|00⟩ and 50% |11⟩, with essentially zero probability for |01⟩ and |10⟩.",
        "",
        "### ⚠️ Common Misconception",
        "Entanglement does not allow faster-than-light communication. Each local measurement is random; the correlation "
        "only becomes visible when the two results are compared through a classical channel.",
    ])


def _cnot_concept_answer() -> str:
    return "\n".join([
        "### 🔗 The CNOT Gate",
        "The **CNOT** (controlled-NOT) gate has a control qubit and a target qubit. It applies **X** to the target only "
        "when the control is |1⟩; when the control is |0⟩, the target is unchanged.",
        "",
        "### 🧮 Why It Matters",
        "CNOT is the standard two-qubit entangling gate. Combined with single-qubit gates, it forms a universal gate set. "
        "A common recipe for entanglement is `H` on the control followed by `CNOT(control → target)`.",
        "",
        "### 📊 What to Expect",
        "For `H(q0)` then `CNOT(q0 → q1)`, the measurement distribution becomes 50% |00⟩ and 50% |11⟩ instead of an "
        "independent 25% for every two-bit outcome.",
    ])


def _hadamard_concept_answer() -> str:
    return "\n".join([
        "### ⚡ The Hadamard Gate",
        "The **Hadamard** gate creates equal-magnitude superpositions:",
        "",
        "- `H|0⟩ = (|0⟩ + |1⟩)/√2 = |+⟩`",
        "- `H|1⟩ = (|0⟩ − |1⟩)/√2 = |−⟩`",
        "",
        "Geometrically, H rotates the Bloch vector from the Z axis toward the X axis. Applying H twice returns the "
        "original state, up to a global phase.",
        "",
        "### 🧪 Why It Is Everywhere",
        "H is the standard way to prepare a uniform superposition at the start of algorithms such as Deutsch-Jozsa and "
        "Grover's search. It also converts phase information into measurable probability differences.",
    ])


def _phase_concept_answer() -> str:
    return "\n".join([
        "### 🌀 Quantum Phase",
        "A quantum amplitude is a complex number and can be written as `r·e^(iθ)`. The angle `θ` is its **phase**.",
        "",
        "### 🔍 Absolute vs Relative Phase",
        "- A global phase multiplies the whole state and has no observable effect.",
        "- A relative phase between |0⟩ and |1⟩ is physically meaningful: it determines how amplitudes interfere.",
        "",
        "### ⚙️ Gates That Change Phase",
        "Z, S, T, and RZ add relative phase without directly changing computational-basis probabilities. A later "
        "Hadamard or interference step converts that phase difference into a measurable probability difference.",
    ])


def _measurement_concept_answer() -> str:
    return "\n".join([
        "### 📊 Measurement and the Born Rule",
        "Measurement in the computational basis returns one definite outcome. For a state `|ψ⟩ = Σ cᵢ|i⟩`, the "
        "probability of outcome `|i⟩` is `P(i) = |cᵢ|²` (the **Born rule**).",
        "",
        "### 🎯 What Changes After Measurement",
        "The state collapses to the observed basis state. Repeating the same measurement without any new gate therefore "
        "returns the same result. To estimate the original distribution, a quantum device prepares and measures the "
        "circuit many times (shots).",
        "",
        "### 📈 Shots",
        "A histogram from many shots estimates the underlying probabilities. Small shot counts look noisy even when the "
        "statevector probabilities are exact.",
    ])


def _qubit_concept_answer() -> str:
    return "\n".join([
        "### ⚛️ Qubits and Quantum States",
        "A **qubit** is a two-level quantum system. Its computational-basis states are |0⟩ and |1⟩, but it can also be "
        "in a superposition `α|0⟩ + β|1⟩`, where `α` and `β` are complex amplitudes and `|α|² + |β|² = 1`.",
        "",
        "### 🧭 Representing One Qubit",
        "A pure single-qubit state maps to a point on the Bloch sphere. |0⟩ is the North Pole, |1⟩ is the South Pole, "
        "and equal superpositions lie on the equator.",
        "",
        "### 🔗 Many Qubits",
        "N qubits require 2^N amplitudes. That exponential state space is why classical simulation becomes difficult as "
        "the qubit count grows, and why entanglement is a genuinely non-classical resource.",
    ])


def _gates_concept_answer() -> str:
    return "\n".join([
        "### ⚙️ Quantum Gates",
        "A quantum gate is a unitary transformation applied to a qubit or register. Unitaries preserve the norm of the "
        "state, so total probability remains one, and they are reversible.",
        "",
        "### 🧰 The Core Gate Set",
        "- **H** creates superposition.",
        "- **X, Y, Z** are the Pauli operations: bit-flip, combined bit/phase-flip, and phase-flip.",
        "- **S and T** add quarter-turn and eighth-turn phase.",
        "- **RX, RY, RZ** rotate by arbitrary angles.",
        "- **CNOT, CZ, SWAP** act on two qubits; CNOT is the standard entangling gate.",
        "",
        "### 🧪 In QuantumLab",
        "Place gates on the circuit wires, run the simulation, and inspect how each gate changes probabilities, the "
        "Bloch sphere, and the Q-Sphere phases.",
    ])


def _grover_concept_answer() -> str:
    return "\n".join([
        "### 🔍 Grover's Search, Explained",
        "Grover's algorithm searches an unsorted space of N items in roughly √N steps instead of N. It starts with a "
        "uniform superposition, marks the target with a phase oracle, and then applies a diffusion operator that "
        "amplifies the marked amplitude.",
        "",
        "### 🌀 The Amplitude-Amplification Loop",
        "1. Apply H to every qubit to create a uniform superposition.",
        "2. Apply the oracle, which flips the phase of the target state.",
        "3. Apply the diffusion operator, which reflects amplitudes about their mean.",
        "4. Repeat about √N times, then measure.",
        "",
        "### ⚠️ Iteration Count Matters",
        "Too few rounds leave the target under-amplified; too many rounds can rotate the state past the target. For "
        "two qubits, one round can take the marked state to probability 1.0, while a second round overshoots.",
    ])


def _deutsch_concept_answer() -> str:
    return "\n".join([
        "### ⚖️ The Deutsch-Jozsa Algorithm",
        "Deutsch-Jozsa decides whether a promised Boolean function is **constant** or **balanced**. Classically, in the "
        "worst case this can require many queries; the quantum algorithm uses one query to the oracle.",
        "",
        "### 🧪 The Circuit Idea",
        "1. Prepare the input register in a uniform superposition with H.",
        "2. Prepare the ancilla in |−⟩.",
        "3. Apply the oracle, which imprints phase kickback `(-1)^f(x)`.",
        "4. Apply H again and measure the input register.",
        "",
        "An all-zero result indicates a constant function; any non-zero input-register result indicates a balanced "
        "function. The speedup comes from interference, not from evaluating every input and reading every answer.",
    ])


def _teleport_concept_answer() -> str:
    return "\n".join([
        "### 📡 Quantum Teleportation",
        "Teleportation transfers an unknown qubit state from Alice to Bob using a shared Bell pair and two classical "
        "bits. The original state is destroyed, so this does not violate the no-cloning theorem.",
        "",
        "### 🧪 The Protocol",
        "1. Create a Bell pair shared by Alice and Bob.",
        "2. Alice performs a CNOT from the payload onto her half of the pair, then applies H to the payload.",
        "3. Alice measures her two qubits and sends the two classical bits to Bob.",
        "4. Bob applies X and/or Z corrections determined by those bits.",
        "",
        "The final state on Bob's qubit matches the original payload. No quantum information travels faster than light; "
        "the classical message is required to complete the correction.",
    ])


def _noise_concept_answer() -> str:
    return "\n".join([
        "### 🌫️ Noise, Decoherence, and NISQ",
        "Real quantum hardware is not perfectly isolated. Qubits interact with their environment and with each other, "
        "and every operation has a small error rate.",
        "",
        "### 🔻 Main Error Sources",
        "- **Gate errors:** imperfect control pulses.",
        "- **Readout errors:** misclassifying the measured state.",
        "- **Decoherence:** loss of coherence through relaxation and dephasing.",
        "- **Crosstalk:** unwanted interactions between nearby qubits.",
        "",
        "**NISQ** (noisy intermediate-scale quantum) describes the current era of devices that are useful but not yet "
        "fully fault-tolerant. Near-term algorithms must be designed with these hardware limits in mind.",
    ])


def _qiskit_concept_answer() -> str:
    return "\n".join([
        "### 🐍 Qiskit and QuantumLab",
        "Qiskit represents a circuit as a `QuantumCircuit`: qubits are wires, gates are appended operations, and "
        "measurements produce classical bits. QuantumLab uses Qiskit Aer to compute the exact statevector before the "
        "tutor explains the result.",
        "",
        "### 🧪 Typical Workflow",
        "1. Create a circuit with the required number of qubits.",
        "2. Append gates such as `h(0)` and `cx(0, 1)`.",
        "3. Simulate the statevector or sample measurement shots.",
        "4. Inspect probabilities, Bloch vectors, and the Q-Sphere.",
        "",
        "### 🛠️ In This Platform",
        "Build the same circuit visually in Circuit Builder, then use the code panel to see and edit the Qiskit "
        "representation. Every explanation is tied back to the simulated state, not to a pre-written answer.",
    ])


def _concept_answer(text: str) -> str | None:
    if any(term in text for term in ("q-sphere", "q_sphere", "q sphere", "hamming")):
        return _qsphere_concept_answer()
    if "bloch" in text:
        return _bloch_concept_answer()
    if any(term in text for term in ("timeline", "evolution", "evolve")):
        return _timeline_concept_answer()
    if "statevector" in text or "amplitude" in text:
        return _statevector_concept_answer()
    if "superposition" in text or "interference" in text:
        return _superposition_concept_answer()
    if "entangle" in text or "bell" in text:
        return _entanglement_concept_answer()
    if "cnot" in text or "controlled-not" in text or "cx gate" in text:
        return _cnot_concept_answer()
    if "hadamard" in text or "h gate" in text:
        return _hadamard_concept_answer()
    if "phase" in text:
        return _phase_concept_answer()
    if any(term in text for term in ("measure", "born rule", "collapse", "shots")):
        return _measurement_concept_answer()
    if "grover" in text or "search algorithm" in text:
        return _grover_concept_answer()
    if "deutsch" in text or "constant" in text or "balanced" in text:
        return _deutsch_concept_answer()
    if "teleport" in text:
        return _teleport_concept_answer()
    if any(term in text for term in ("noise", "decoherence", "nisq")):
        return _noise_concept_answer()
    if "qiskit" in text:
        return _qiskit_concept_answer()
    if "qubit" in text:
        return _qubit_concept_answer()
    if "gate" in text:
        return _gates_concept_answer()
    return None


def _bloch_position_answer(
    text: str,
    qubit: int | None,
    blochs: list[tuple[int, tuple[float, float, float]]],
    probabilities: list[tuple[str, float]],
    sequence: str,
    circuit: Circuit | None,
) -> str:
    selected = next((item for item in blochs if item[0] == qubit), blochs[0] if blochs else None)
    if selected is None:
        return _generic_grounded_answer(probabilities, blochs, [], None, sequence, circuit, "bloch")

    selected_qubit, (x, y, z) = selected
    if z > 0.1:
        heading = f"Why q[{selected_qubit}] Sits at the Top of the Bloch Sphere"
        lead = (
            f"**q[{selected_qubit}] is at the top pole, |0⟩.** The North Pole corresponds to Z = +1, and the "
            "computational ground state |0⟩ is exactly that point."
        )
    elif z < -0.1:
        heading = f"Why q[{selected_qubit}] Sits at the Bottom of the Bloch Sphere"
        lead = (
            f"**q[{selected_qubit}] is at the bottom pole, |1⟩.** The South Pole corresponds to Z = −1, and the "
            "computational basis state |1⟩ is exactly that point."
        )
    else:
        heading = f"Where q[{selected_qubit}] Sits on the Bloch Sphere"
        lead = (
            f"**q[{selected_qubit}] lies on the equator.** Its Z coordinate is approximately zero, so a "
            "computational-basis measurement is close to an even split between 0 and 1."
        )

    probability_zero = (1 + z) / 2
    probability_one = (1 - z) / 2
    return "\n\n".join([
        f"### 🧭 {heading}",
        lead,
        f"**Verified Bloch vector:** `({x:.6f}, {y:.6f}, {z:.6f})`  \n"
        f"**Measured bias from this vector:** P(0) ≈ {probability_zero * 100:.2f}%, P(1) ≈ {probability_one * 100:.2f}%.",
        _bloch_explanation(x, y, z),
        _gate_sequence_section(sequence, circuit),
        _probabilities_section(probabilities, "Qiskit"),
        _interpretation_section(probabilities, circuit),
        _next_step_section("bloch"),
    ])


def _bloch_values_answer(
    blochs: list[tuple[int, tuple[float, float, float]]],
    probabilities: list[tuple[str, float]],
    sequence: str,
    circuit: Circuit | None,
) -> str:
    lines = [
        "### 🧭 Bloch Sphere Values",
        "The Bloch sphere gives the reduced state of each individual qubit. Here is exactly what the simulator returned:",
        "",
    ]
    if blochs:
        lines += ["| Qubit | Bloch vector (x, y, z) | Where it points | P(0) | P(1) |", "| --- | --- | --- | --- | --- |"]
        for qubit, (x, y, z) in blochs:
            lines.append(
                f"| `q[{qubit}]` | `({x:.4f}, {y:.4f}, {z:.4f})` | {_bloch_position(z)} | "
                f"{(1 + z) / 2 * 100:.1f}% | {(1 - z) / 2 * 100:.1f}% |"
            )
        lines += [""]
        for qubit, (x, y, z) in blochs:
            lines.append(f"**q[{qubit}]:** {_bloch_explanation(x, y, z)}")
    else:
        lines.append("_No Bloch vectors were returned for this circuit._")

    lines += ["", _gate_sequence_section(sequence, circuit), "", _probabilities_section(probabilities, "Qiskit")]
    lines += ["", _interpretation_section(probabilities, circuit), "", _next_step_section("bloch")]
    return "\n".join(lines)


def _qsphere_answer(
    points: list[tuple[str, float, float]],
    probabilities: list[tuple[str, float]],
    sequence: str,
    circuit: Circuit | None,
) -> str:
    lines = [
        "### 🌐 Q-Sphere representation",
        "**Verified from the current simulated statevector:**",
        "",
    ]
    if points:
        lines += ["| Basis state | Probability | Phase (rad) | Phase (deg) | Hamming weight |", "| --- | --- | --- | --- | --- |"]
        for state, probability, phase in sorted(points, key=lambda item: (-item[1], item[0])):
            lines.append(
                f"| &#124;{state}⟩ | {probability * 100:.2f}% | {phase:.4f} | {math.degrees(phase):.1f}° | {state.count('1')} |"
            )
        lines += ["", "### 🧭 How to Read These Points"]
        for state, probability, phase in sorted(points, key=lambda item: (-item[1], item[0])):
            if state.count("1") == 0:
                latitude = "the |00...0⟩ pole"
            elif state.count("1") == len(state):
                latitude = "the |11...1⟩ pole"
            else:
                latitude = f"Hamming-weight {state.count('1')} latitude"
            phase_note = "no relative phase offset" if abs(phase) < 1e-8 else f"a relative phase of {phase:.4f} rad"
            lines.append(
                f"- `|{state}⟩` has probability {probability * 100:.2f}%, sits on {latitude}, and carries {phase_note}."
            )
    else:
        lines.append("_No non-zero basis-state points were returned._")

    lines += [
        "",
        "### 🧠 What the Q-Sphere Tells You",
        "Node latitude is the **Hamming weight**, node size is the measurement probability, and hue is the quantum "
        "**phase**. A phase-only change can move nodes around the sphere without changing their size, which is why the "
        "Q-Sphere is useful for understanding interference.",
        "",
        _gate_sequence_section(sequence, circuit),
        "",
        _probabilities_section(probabilities, "Qiskit"),
        "",
        _interpretation_section(probabilities, circuit),
        "",
        _next_step_section("q_sphere"),
    ]
    return "\n".join(lines)


def _gates_answer(
    probabilities: list[tuple[str, float]],
    blochs: list[tuple[int, tuple[float, float, float]]],
    timeline: list[tuple[int, list[tuple[str, float]]]],
    sequence: str,
    circuit: Circuit | None,
) -> str:
    lines = [
        "### ⚛️ Gate-by-Gate Explanation",
        "Every statement below is derived from the Qiskit simulation of the current circuit.",
        "",
        _gate_sequence_section(sequence, circuit),
        "",
        _probabilities_section(probabilities, "Qiskit"),
        "",
        _timeline_section(timeline, circuit),
        "",
        _interpretation_section(probabilities, circuit),
    ]
    if blochs:
        lines += ["", "### 🧭 Single-Qubit View"]
        for qubit, (x, y, z) in blochs:
            lines.append(f"- **q[{qubit}]:** Bloch vector `({x:.4f}, {y:.4f}, {z:.4f})` — {_bloch_position(z)}.")
    lines += ["", _next_step_section("gate")]
    return "\n".join(lines)


def _bell_answer(
    probabilities: list[tuple[str, float]],
    sequence: str,
    circuit: Circuit | None,
    bell_fact: str | None,
) -> str:
    probability_map = dict(probabilities)
    bell_correlations = (
        probability_map.get("00", 0) > 0.4 and probability_map.get("11", 0) > 0.4
    ) or (
        probability_map.get("01", 0) > 0.4 and probability_map.get("10", 0) > 0.4
    )
    lines = ["### 🔗 Bell State Analysis"]
    if bell_correlations:
        pair = "|00⟩ and |11⟩" if probability_map.get("00", 0) > 0.4 else "|01⟩ and |10⟩"
        detail = (bell_fact or "").replace("This circuit creates a Bell state.", "", 1).strip()
        detail = re.sub(r"\|([01]+)>", r"|\1⟩", detail)
        lines += [
            ("**This circuit creates a Bell state.** " + detail).strip(),
            "",
            f"The pair is perfectly correlated: {pair} are the only outcomes that appear, so the two qubits are never "
            "found in the other two computational-basis states.",
        ]
    else:
        lines += [
            "**This circuit does not yet show Bell-state correlations.** " + (bell_fact or ""),
            "",
            "A Bell state needs two operations: **H** on one qubit to create superposition, followed by **CNOT** with "
            "that qubit as control and the second qubit as target. Without that entangling step, the two qubits behave "
            "independently and the measurement table will not collapse to just two correlated outcomes.",
        ]
    lines += [
        "",
        "### 📊 Verified Measurement Outcomes",
        _probability_table(probabilities),
        "",
        _gate_sequence_section(sequence, circuit),
        "",
        _interpretation_section(probabilities, circuit),
        "",
        "### 🧠 Why Entanglement Matters",
        "The Bell pair is a resource for teleportation, superdense coding, and many quantum algorithms. The correlation "
        "itself cannot send a signal faster than light: each local result is random until the two sides compare notes.",
        "",
        _next_step_section("bell"),
    ]
    return "\n".join(lines)


def _algorithm_answer(
    title: str,
    intro: str,
    fact_value: str | None,
    probabilities: list[tuple[str, float]],
    sequence: str,
    circuit: Circuit | None,
    focus: str,
    extra: str,
) -> str:
    return "\n".join([
        f"### 🧠 {title}",
        intro,
        "",
        f"**Verified analysis:** {fact_value or 'No algorithm-specific analysis was available for this circuit.'}",
        "",
        extra,
        "",
        _probabilities_section(probabilities, "Qiskit"),
        "",
        _gate_sequence_section(sequence, circuit),
        "",
        _interpretation_section(probabilities, circuit),
        "",
        _next_step_section(focus),
    ])


def _timeline_answer(
    timeline: list[tuple[int, list[tuple[str, float]]]],
    probabilities: list[tuple[str, float]],
    sequence: str,
    circuit: Circuit | None,
) -> str:
    return "\n".join([
        "### 🌀 Step-by-Step Evolution",
        "This is the exact step-by-step evolution of the measurement distribution:",
        "",
        _timeline_section(timeline, circuit),
        "",
        _interpretation_section(probabilities, circuit),
        "",
        _gate_sequence_section(sequence, circuit),
        "",
        _next_step_section("timeline"),
    ])


def _generic_grounded_answer(
    probabilities: list[tuple[str, float]],
    blochs: list[tuple[int, tuple[float, float, float]]],
    timeline: list[tuple[int, list[tuple[str, float]]]],
    points: list[tuple[str, float, float]] | None,
    sequence: str,
    circuit: Circuit | None,
    focus: str | None = None,
) -> str:
    lines = ["### ⚛️ Verified Circuit Overview"]
    if circuit is not None:
        lines += [
            f"- **Qubits:** {circuit.qubits}",
            f"- **Gates:** {len(circuit.gates)}",
            f"- **Circuit depth (operation count):** {len(circuit.gates)}",
        ]
    lines += ["", _gate_sequence_section(sequence, circuit), "", _probabilities_section(probabilities, "Qiskit"), ""]
    if blochs:
        lines += ["### 🧭 Bloch Sphere", "The reduced single-qubit states are:", ""]
        for qubit, (x, y, z) in blochs:
            lines.append(f"- **q[{qubit}]:** `({x:.4f}, {y:.4f}, {z:.4f})` — {_bloch_position(z)}.")
        lines.append("")
    if points is not None:
        lines += [_qsphere_section(points), ""]
    lines += [
        _timeline_section(timeline, circuit),
        "",
        _interpretation_section(probabilities, circuit),
        "",
        _next_step_section(focus),
    ]
    return "\n".join(lines)


def _grounded_fallback(
    text: str,
    facts: list[GroundedFact],
    focus: str | None,
    circuit: Circuit | None,
) -> str:
    fact_lookup = _fact_map(facts)
    probabilities = _parse_probabilities(fact_lookup.get("measurement_probabilities", ""))
    timeline = _parse_timeline(fact_lookup.get("probability_timeline", ""))
    points = _parse_qsphere(fact_lookup.get("q_sphere_points", ""))
    sequence = fact_lookup.get("gate_sequence", "No gates; initial state is |0...0>.")
    blochs = [
        (int(name.rsplit("q", 1)[1]), vector)
        for name, value in fact_lookup.items()
        if name.startswith("bloch_vector_q") and (vector := _parse_bloch(value)) is not None
    ]
    qubit = _mentioned_qubit(text)

    if "why" in text and any(term in text for term in ("top", "bottom", "pole", "bloch")):
        return _bloch_position_answer(text, qubit, blochs, probabilities, sequence, circuit)

    if focus == "q_sphere" or any(term in text for term in ("q-sphere", "q_sphere", "q sphere")):
        return _qsphere_answer(points, probabilities, sequence, circuit)

    if focus == "gate" or ("gate" in text and not any(term in text for term in ("bloch", "sphere", "timeline"))):
        return _gates_answer(probabilities, blochs, timeline, sequence, circuit)

    if focus == "bell" or "bell" in text or "entangl" in text:
        return _bell_answer(probabilities, sequence, circuit, fact_lookup.get("bell_state"))

    if focus == "deutsch" or any(term in text for term in ("deutsch", "constant", "balanced", "oracle")):
        return _algorithm_answer(
            "Deutsch-Jozsa Result",
            "The circuit is being read as a Deutsch-Jozsa query. The key question is whether the input register "
            "collapses to all zeros (constant) or to a non-zero outcome (balanced).",
            fact_lookup.get("deutsch_jozsa"),
            probabilities,
            sequence,
            circuit,
            "deutsch",
            "The oracle imprints the function value as a phase. The final Hadamards convert that phase pattern into "
            "the measurement pattern above, so one query can reveal a global property of the function.",
        )

    if focus == "grover" or any(term in text for term in ("grover", "amplif", "marked", "search")):
        return _algorithm_answer(
            "Grover Search Result",
            "Grover's algorithm uses an oracle and a diffusion operator to amplify the marked state. The measurement "
            "table shows whether that amplification succeeded.",
            fact_lookup.get("grovers"),
            probabilities,
            sequence,
            circuit,
            "grover",
            "One round of amplitude amplification can make a two-qubit target overwhelmingly likely; additional rounds "
            "can overshoot and reduce its probability, so the iteration count is part of the algorithm.",
        )

    if focus == "teleport" or "teleport" in text:
        return _algorithm_answer(
            "Quantum Teleportation Result",
            "Teleportation transfers an unknown payload state using a shared Bell pair, a joint measurement, and two "
            "classical correction bits.",
            fact_lookup.get("teleportation"),
            probabilities,
            sequence,
            circuit,
            "teleport",
            "The payload is not copied: Alice's measurement destroys the original state on her side, and Bob recovers "
            "it only after applying the corrections indicated by the classical bits.",
        )

    if focus == "timeline" or "timeline" in text or "step-by-step" in text or "step by step" in text:
        return _timeline_answer(timeline, probabilities, sequence, circuit)

    if focus == "bloch" or "bloch" in text:
        return _bloch_values_answer(blochs, probabilities, sequence, circuit)

    return _generic_grounded_answer(probabilities, blochs, timeline, points, sequence, circuit, focus)


def _fallback_answer(
    message: str,
    facts: list[GroundedFact],
    grounded: bool,
    focus: str | None = None,
    circuit: Circuit | None = None,
) -> str:
    text = message.lower().strip()

    # Conceptual questions should always receive a full theory answer, even
    # when a circuit happens to be open in the builder.
    is_conceptual_query = (
        text.startswith(("what is", "how does", "explain how", "how to read", "what does", "define", "what are", "how do"))
        or "difference between" in text
        or "how statevector" in text
        or "how probability" in text
    )
    concept = _concept_answer(text)
    if concept and (is_conceptual_query or not grounded):
        return concept

    if grounded and facts:
        return _grounded_fallback(text, facts, focus, circuit)

    return "\n".join([
        "### ⚛️ QuantumLab Tutor",
        "I can explain the circuit you are building, the numbers returned by Qiskit, or the quantum concepts behind "
        "them.",
        "",
        "### 🧭 What I Can Answer",
        "- **Circuit questions:** gate sequence, statevector, measurement probabilities, Bloch vectors, Q-Sphere phases, "
        "and step-by-step evolution.",
        "- **Algorithm questions:** Bell states, Deutsch-Jozsa, Grover search, and quantum teleportation.",
        "- **Concept questions:** superposition, entanglement, measurement, phase, gates, noise, and Qiskit.",
        "",
        "### 🚀 Try Asking",
        "- What is superposition?",
        "- Why is q[0] at the top of the Bloch sphere?",
        "- Explain the Q-Sphere points and phases for this circuit.",
        "- Walk through the gates in my circuit step by step.",
    ])



