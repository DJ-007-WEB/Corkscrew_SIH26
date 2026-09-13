import random
from collections import Counter
from typing import Any

from .irt import probability_correct
from .question_bank import load_questions


ASSESSMENT_SIZE = 7


def _concept_mastery(mastery: dict[str, float], concept: str) -> float:
    return float(mastery.get(concept, 0.35))


def select_adaptive_questions(
    mastery: dict[str, float],
    ability: float,
    attempted_question_ids: set[str] | None = None,
    recent_incorrect_concepts: list[str] | None = None,
    exposure_counts: dict[str, int] | None = None,
    seed: str | None = None,
) -> list[dict[str, Any]]:
    attempted = attempted_question_ids or set()
    recent = Counter(recent_incorrect_concepts or [])
    exposure = exposure_counts or {}
    rng = random.Random(seed)
    active = [q for q in load_questions() if q.get("is_active", True)]
    selected: list[dict[str, Any]] = []
    covered_modules: set[str] = set()
    covered_subtopics: set[str] = set()

    def score(question: dict[str, Any]) -> float:
        concept = question["primary_concept_id"]
        mastery_score = _concept_mastery(mastery, concept)
        weak = 1.0 - mastery_score
        near_ability = 1.0 - min(1.0, abs(float(question["irt_difficulty"]) - ability) / 4.0)
        information = 1.0 - abs(probability_correct(ability, float(question["irt_difficulty"])) - 0.5) * 2.0
        novelty = 0.0 if question["id"] in attempted else 0.4
        recent_need = min(0.4, recent[concept] * 0.16)
        exposure_penalty = min(0.6, exposure.get(question["id"], 0) * 0.15)
        coverage = (0.12 if question["module_id"] not in covered_modules else 0.0) + (0.08 if question["subtopic_id"] not in covered_subtopics else 0.0)
        jitter = rng.random() * 0.025
        return weak * 0.38 + near_ability * 0.24 + information * 0.16 + novelty + recent_need + coverage - exposure_penalty + jitter

    candidates = active[:]
    while candidates and len(selected) < ASSESSMENT_SIZE:
        candidates.sort(key=score, reverse=True)
        pick = candidates.pop(0)
        selected.append(pick)
        covered_modules.add(pick["module_id"])
        covered_subtopics.add(pick["subtopic_id"])
        candidates = [q for q in candidates if q["id"] != pick["id"]]

    if len(selected) != ASSESSMENT_SIZE:
        raise ValueError("Question bank does not contain enough active questions")
    return selected
