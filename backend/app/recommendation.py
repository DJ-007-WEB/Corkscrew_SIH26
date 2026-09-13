from collections import Counter
from typing import Any

from .question_bank import load_questions


def recommend_next_subtopic(mastery: dict[str, float], recent_results: list[dict[str, Any]]) -> dict[str, Any]:
    questions = load_questions()
    by_concept: dict[str, list[dict[str, Any]]] = {}
    for question in questions:
        by_concept.setdefault(question["primary_concept_id"], []).append(question)
    mistakes = Counter(result.get("primary_concept_id", "") for result in recent_results if not result.get("is_correct"))
    ranked = sorted(
        by_concept.keys(),
        key=lambda concept: (float(mastery.get(concept, 0.35)), -mistakes[concept]),
    )
    concept = ranked[0] if ranked else ""
    if mistakes:
        concept = min(mistakes.keys(), key=lambda item: (float(mastery.get(item, 0.35)), -mistakes[item]))
    source = by_concept.get(concept, [{}])[0]
    reason = f"Recent responses suggest {concept} needs more practice."
    if mistakes.get(concept, 0) > 1:
        reason = f"You missed {mistakes[concept]} recent questions tied to {concept}, and mastery is still developing."
    return {
        "module_id": source.get("module_id", ""),
        "subtopic_id": source.get("subtopic_id", ""),
        "concept_id": concept,
        "title": f"Review {source.get('subtopic_id', '')}",
        "reason": reason,
        "suggested_question_concepts": [concept] if concept else [],
    }
