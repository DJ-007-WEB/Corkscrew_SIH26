"""Phase 2 contests: question bank, sprint attempt logic and grading math.

Pure helpers live here for unit tests; HTTP + Mongo wiring lives in main.py,
simulation-graded checking uses quantum_engine.run_circuit at the endpoint.
"""

import random

SPRINT_QUESTIONS = 8
SPRINT_DURATION_SEC = 480  # 8 minutes
SPRINT_SUBMIT_GRACE_SEC = 60
CORRECT_XP = 10
WRONG_PENALTY = 2
MAX_TIME_BONUS = 20

DUEL_QUESTIONS = 5
DUEL_DURATION_SEC = 300  # 5 minutes for the whole duel
DUEL_POLL_GRACE_SEC = 30
DUEL_WINNER_XP = 50
DUEL_LOSER_XP = 10
DUEL_TIE_XP = 30

QUESTION_BANK = [
    {"id": "q1", "tag": "Fundamentals", "question": "Which gate creates an equal superposition from |0⟩?", "options": ["X", "H", "Z", "CNOT"], "answer": 1, "explanation": "The Hadamard gate maps |0⟩ to (|0⟩ + |1⟩)/√2."},
    {"id": "q2", "tag": "Fundamentals", "question": "What does a CNOT do when its control is |1⟩?", "options": ["Measures the target", "Applies X to the target", "Applies Z to the control", "Does nothing"], "answer": 1, "explanation": "CNOT conditionally applies an X gate to its target when the control is |1⟩."},
    {"id": "q3", "tag": "Fundamentals", "question": "What determines the probability of a basis-state measurement?", "options": ["Amplitude magnitude squared", "Circuit title", "Gate color", "Qubit label"], "answer": 0, "explanation": "The Born rule says a basis state's probability is the squared magnitude of its amplitude."},
    {"id": "q4", "tag": "Fundamentals", "question": "Which backend runs Corkscrew's circuit simulations?", "options": ["PennyLane", "Cirq", "Qiskit Aer", "qBraid"], "answer": 2, "explanation": "This platform simulates circuits with Qiskit Aer."},
    {"id": "q5", "tag": "Bell State", "question": "Measuring both qubits of (|00⟩ + |11⟩)/√2 can give…", "options": ["00 or 11 only", "01 or 10 only", "Any of 00/01/10/11 equally", "Always 00"], "answer": 0, "explanation": "Bell correlation: only 00 (P=0.5) or 11 (P=0.5); cross outcomes have zero probability."},
    {"id": "q6", "tag": "Bell State", "question": "Which circuit builds |Φ+⟩ from |00⟩?", "options": ["H(q0) then CNOT(q0→q1)", "CNOT then H(q0)", "X(q0) then X(q1)", "Z(q0) only"], "answer": 0, "explanation": "Hadamard creates superposition on q0, CNOT entangles it onto q1."},
    {"id": "q7", "tag": "Deutsch-Jozsa", "question": "A balanced oracle on n=1 leaves the input qubit…", "options": ["|0⟩ always", "|1⟩ always", "Random each shot", "Unchanged |+⟩"], "answer": 1, "explanation": "Interference kills the |0⟩ amplitude for balanced functions; constant functions give |0⟩."},
    {"id": "q8", "tag": "Deutsch-Jozsa", "question": "How many queries does DJ need vs deterministic classical (worst case)?", "options": ["1 vs up to 2ⁿ⁻¹+1", "N vs 1", "Equal", "0 vs N"], "answer": 0, "explanation": "One quantum query decides constant vs balanced under the promise; classical may need half the inputs plus one."},
    {"id": "q9", "tag": "Grover", "question": "One Grover round on 2 qubits targeting |11⟩ gives…", "options": ["P(11) = 1.0", "Uniform 0.25 each", "P(00) = 1.0", "P(11) = 0.5"], "answer": 0, "explanation": "A single oracle+diffusion rotation fully amplifies the marked state for N=4."},
    {"id": "q10", "tag": "Grover", "question": "Two rounds on the same 2-qubit target give…", "options": ["Overshoot back toward uniform", "P = 1.0 still", "Always |00⟩", "An error"], "answer": 0, "explanation": "Grover rotations overshoot past the target — more iterations are not always better."},
    {"id": "q11", "tag": "Teleportation", "question": "Teleportation of |ψ⟩ requires…", "options": ["A Bell pair + 2 classical bits", "3 classical bits only", "Cloning q[0]", "FTL signalling"], "answer": 0, "explanation": "Shared entanglement plus 2 classical bits; the original is destroyed, nothing is cloned, nothing travels FTL."},
    {"id": "q12", "tag": "Teleportation", "question": "Alice's two bits alone reveal…", "options": ["Nothing about |ψ⟩", "The full state", "One amplitude", "The phase only"], "answer": 0, "explanation": "Each of 00/01/10/11 occurs with 0.25 regardless of payload; Bob's corrections recover it."},
]

CHALLENGE_TASKS = [
    {
        "id": "flip-to-one",
        "title": "Flip to |1⟩",
        "description": "Starting from |0⟩, build a 1-qubit circuit that measures 1 with probability ≥ 0.99.",
        "qubits": 1,
        "max_gates": 2,
        "hint": "One Pauli gate is enough. Which gate swaps |0⟩ and |1⟩?",
    },
    {
        "id": "superposition",
        "title": "Equal Superposition",
        "description": "Build a 1-qubit circuit with P(0) and P(1) each within 0.48–0.52.",
        "qubits": 1,
        "max_gates": 2,
        "hint": "A single gate maps |0⟩ to (|0⟩ + |1⟩)/√2.",
    },
    {
        "id": "bell-phi-plus",
        "title": "Bell State |Φ+⟩",
        "description": "Build a 2-qubit circuit with P(00) and P(11) each within 0.48–0.52 and P(01), P(10) each ≤ 0.02.",
        "qubits": 2,
        "max_gates": 4,
        "hint": "Superposition on q[0] first, then entangle with a controlled gate.",
    },
]


def pick_questions(n: int = SPRINT_QUESTIONS, seed: str = "") -> list[dict]:
    rng = random.Random(seed)
    return rng.sample(QUESTION_BANK, min(n, len(QUESTION_BANK)))


def public_question(question: dict) -> dict:
    return {"id": question["id"], "tag": question["tag"], "question": question["question"], "options": question["options"]}


def grade_sprint(questions: list[dict], answers: dict[str, int]) -> tuple[int, int, list[dict]]:
    """Grade a sprint attempt. Returns (correct, wrong, per-question results)."""
    correct = 0
    wrong = 0
    results = []
    for question in questions:
        raw = answers.get(question["id"])
        picked = raw if isinstance(raw, int) and 0 <= raw < len(question["options"]) else None
        ok = picked == question["answer"]
        if picked is None:
            pass  # skipped: no penalty, no credit
        elif ok:
            correct += 1
        else:
            wrong += 1
        results.append(
            {
                "id": question["id"],
                "tag": question["tag"],
                "question": question["question"],
                "options": question["options"],
                "your_option": picked,
                "correct_option": question["answer"],
                "is_correct": ok if picked is not None else False,
                "answered": picked is not None,
                "explanation": question["explanation"],
            }
        )
    return correct, wrong, results


def sprint_xp(correct: int, wrong: int, elapsed_sec: float, duration_sec: int = SPRINT_DURATION_SEC) -> tuple[int, int, int]:
    """Returns (base_score, time_bonus, total). Base may be 0; bonus needs elapsed within duration."""
    base = max(0, correct * CORRECT_XP - wrong * WRONG_PENALTY)
    bonus = 0
    if elapsed_sec <= duration_sec and (correct + wrong) > 0:
        bonus = round(MAX_TIME_BONUS * (1 - elapsed_sec / duration_sec))
    return base, bonus, min(base + bonus, 150)


def sprint_new_solve_xp(new_correct: int, wrong: int, elapsed_sec: float, duration_sec: int = SPRINT_DURATION_SEC) -> tuple[int, int, int]:
    """First-solve payout: XP only for questions solved correctly for the first
    time. Returns (base, time_bonus, total) with the same scale as sprint_xp."""
    base = max(0, new_correct * CORRECT_XP - wrong * WRONG_PENALTY)
    bonus = 0
    if new_correct > 0 and elapsed_sec <= duration_sec:
        bonus = round(MAX_TIME_BONUS * (1 - elapsed_sec / duration_sec))
    return base, bonus, min(base + bonus, 150)


def check_challenge(task_id: str, probabilities: dict[str, float], gate_count: int) -> tuple[bool, str]:
    """Pure checker over final measurement probabilities. Returns (passed, message)."""
    task = next((t for t in CHALLENGE_TASKS if t["id"] == task_id), None)
    if task is None:
        return False, "Unknown challenge task."
    if gate_count > task["max_gates"]:
        return False, f"Too many gates: used {gate_count}, limit is {task['max_gates']}. Try a shorter circuit."
    get = lambda bit: float(probabilities.get(bit, 0.0))
    if task_id == "flip-to-one":
        if get("1") >= 0.99:
            return True, f"Correct — P(1) = {get('1'):.3f}."
        return False, f"Not there yet — P(1) = {get('1'):.3f}, need ≥ 0.990."
    if task_id == "superposition":
        if 0.48 <= get("0") <= 0.52 and 0.48 <= get("1") <= 0.52:
            return True, f"Correct — P(0) = {get('0'):.3f}, P(1) = {get('1'):.3f}."
        return False, f"Not there yet — P(0) = {get('0'):.3f}, P(1) = {get('1'):.3f}; need both in [0.48, 0.52]."
    if task_id == "bell-phi-plus":
        ok = 0.48 <= get("00") <= 0.52 and 0.48 <= get("11") <= 0.52 and get("01") <= 0.02 and get("10") <= 0.02
        if ok:
            return True, f"Correct — P(00) = {get('00'):.3f}, P(11) = {get('11'):.3f}."
        return False, (
            f"Not there yet — P(00) = {get('00'):.3f}, P(11) = {get('11'):.3f}, "
            f"P(01) = {get('01'):.3f}, P(10) = {get('10'):.3f}."
        )
    return False, "Unknown challenge task."


def challenge_xp(passed: bool, gate_count: int, max_gates: int) -> int:
    if not passed:
        return 0
    efficiency = max(0, (max_gates - gate_count)) * 10
    return min(50 + min(efficiency, 30), 100)


def decide_duel_winner(host_correct: int, host_elapsed: float, guest_correct: int, guest_elapsed: float) -> str:
    """Pure duel outcome. Returns 'host', 'guest' or 'tie'.

    More correct answers wins; ties on score break toward the faster finisher
    (smaller elapsed); exact ties stay ties.
    """
    if host_correct != guest_correct:
        return "host" if host_correct > guest_correct else "guest"
    if host_elapsed != guest_elapsed:
        return "host" if host_elapsed < guest_elapsed else "guest"
    return "tie"
