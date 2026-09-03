"""Optional persistence for tutor conversations and learning signals.

The app remains usable without MongoDB; persistence is enabled automatically
when MONGODB_URI is configured by the deployment team.
"""

from datetime import datetime, timezone

from .auth import get_db


def save_turn(conversation_id: str | None, message: str, answer: str, mode: str, tools: list[str]) -> None:
    if not conversation_id:
        return
    db = get_db()
    if db is None:
        return
    db["tutor_conversations"].insert_one({
        "conversation_id": conversation_id,
        "message": message,
        "answer": answer,
        "mode": mode,
        "tools": tools,
        "created_at": datetime.now(timezone.utc),
    })


def recommendation(message: str, tools: list[str]) -> str | None:
    text = message.lower()
    if "bloch" in text or "bloch_vector" in tools:
        return "Next, compare the Bloch vector before and after one gate to see how its direction changes."
    if "q sphere" in text or "q_sphere_data" in tools:
        return "Next, inspect the Q-Sphere phases and compare them with the measurement probabilities."
    if "cnot" in text or "entang" in text:
        return "Next, try H on q[0] followed by CNOT(q[0] → q[1]) and compare both single-qubit Bloch vectors."
    return "Try running one gate at a time and ask why the probability timeline changes at each step."
