import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from .adaptive_engine import ASSESSMENT_SIZE, select_adaptive_questions
from .bkt import DEFAULT_BKT_PARAMS, update_mastery
from .irt import DEFAULT_IRT_CONFIG, calibration_status, update_ability
from .question_bank import public_question, question_by_id
from .recommendation import recommend_next_subtopic


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def default_mastery_doc(user_id: str) -> dict[str, Any]:
    return {"user_id": user_id, "concepts": {}, "ability": 0.0, "ability_response_count": 0, "updated_at": utcnow()}


def get_mastery(collection, user_id: str) -> dict[str, Any]:
    if collection is None:
        return default_mastery_doc(user_id)
    doc = collection.find_one({"user_id": user_id})
    return doc or default_mastery_doc(user_id)


def save_mastery(collection, doc: dict[str, Any]) -> None:
    if collection is None:
        return
    doc["updated_at"] = utcnow()
    collection.update_one({"user_id": doc["user_id"]}, {"$set": doc}, upsert=True)


def attempted_context(attempts_collection, user_id: str) -> tuple[set[str], list[str], dict[str, int]]:
    if attempts_collection is None:
        return set(), [], {}
    docs = list(attempts_collection.find({"user_id": user_id}))
    attempted: set[str] = set()
    recent_incorrect: list[str] = []
    exposure: Counter[str] = Counter()
    for doc in docs:
        for question_id in doc.get("question_ids", []):
            attempted.add(question_id)
            exposure[question_id] += 1
        for result in doc.get("results", []):
            if not result.get("is_correct") and result.get("primary_concept_id"):
                recent_incorrect.append(result["primary_concept_id"])
    return attempted, recent_incorrect[-12:], dict(exposure)


def start_assessment(attempts_collection, mastery_collection, user: dict[str, Any]) -> dict[str, Any]:
    mastery_doc = get_mastery(mastery_collection, user["sub"])
    attempted, recent, exposure = attempted_context(attempts_collection, user["sub"])
    assessment_id = uuid.uuid4().hex[:16]
    questions = select_adaptive_questions(
        mastery_doc.get("concepts", {}),
        float(mastery_doc.get("ability", 0.0)),
        attempted,
        recent,
        exposure,
        seed=f"{user['sub']}:{assessment_id}",
    )
    now = utcnow()
    doc = {
        "assessment_id": assessment_id,
        "user_id": user["sub"],
        "user_name": user.get("name", "Quantum Learner"),
        "user_email": user.get("email"),
        "created_at": now,
        "completed_at": None,
        "question_ids": [q["id"] for q in questions],
        "selected_answers": {},
        "score": 0,
        "total": ASSESSMENT_SIZE,
        "percentage": 0.0,
        "results": [],
        "bkt_before": mastery_doc.get("concepts", {}).copy(),
        "bkt_after": None,
        "irt_ability_before": float(mastery_doc.get("ability", 0.0)),
        "irt_ability_after": None,
        "recommendation": None,
        "submitted": False,
    }
    if attempts_collection is not None:
        attempts_collection.insert_one(doc)
    return assessment_response(doc, questions)


def assessment_response(doc: dict[str, Any], questions: list[dict[str, Any]] | None = None, include_answers: bool = False) -> dict[str, Any]:
    questions = questions or [question_by_id(qid) for qid in doc.get("question_ids", [])]
    return {
        "assessment_id": doc["assessment_id"],
        "created_at": doc["created_at"].isoformat() if hasattr(doc["created_at"], "isoformat") else str(doc["created_at"]),
        "completed_at": doc.get("completed_at").isoformat() if hasattr(doc.get("completed_at"), "isoformat") else doc.get("completed_at"),
        "questions": [public_question(q, include_answer=bool(doc.get("submitted"))) for q in questions if q],
        "selected_answers": doc.get("selected_answers", {}),
        "score": int(doc.get("score", 0)),
        "total": int(doc.get("total", ASSESSMENT_SIZE)),
        "percentage": float(doc.get("percentage", 0.0)),
        "results": doc.get("results", []),
        "recommendation": doc.get("recommendation"),
        "bkt_before": doc.get("bkt_before") or {},
        "bkt_after": doc.get("bkt_after") or {},
        "irt_ability_before": float(doc.get("irt_ability_before", 0.0)),
        "irt_ability_after": doc.get("irt_ability_after"),
        "submitted": bool(doc.get("submitted")),
    }


def record_response(item_stats_collection, user_id: str, question: dict[str, Any], correct: bool) -> dict[str, Any]:
    if item_stats_collection is None:
        return {"irt_status": question["irt_status"], "irt_response_count": question["irt_response_count"]}
    item_id = question["id"]
    stats = item_stats_collection.find_one({"question_id": item_id}) or {
        "question_id": item_id,
        "student_ids": [],
        "response_count": int(question.get("irt_response_count", 0)),
        "correct_count": 0,
        "irt_difficulty": float(question["irt_difficulty"]),
        "irt_status": question["irt_status"],
    }
    students = set(stats.get("student_ids", []))
    students.add(user_id)
    response_count = int(stats.get("response_count", 0)) + 1
    correct_count = int(stats.get("correct_count", 0)) + (1 if correct else 0)
    status = calibration_status(len(students), response_count, correct_count, str(stats.get("irt_status", question["irt_status"])))
    update = {
        "student_ids": sorted(students),
        "response_count": response_count,
        "correct_count": correct_count,
        "irt_difficulty": float(stats.get("irt_difficulty", question["irt_difficulty"])),
        "irt_status": status,
        "updated_at": utcnow(),
    }
    item_stats_collection.update_one({"question_id": item_id}, {"$set": update}, upsert=True)
    return {"irt_status": status, "irt_response_count": response_count}


def apply_responses(mastery_collection, item_stats_collection, user: dict[str, Any], answers: dict[str, str]) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    mastery_doc = get_mastery(mastery_collection, user["sub"])
    before = mastery_doc.get("concepts", {}).copy()
    concepts = mastery_doc.setdefault("concepts", {})
    ability = float(mastery_doc.get("ability", 0.0))
    results: list[dict[str, Any]] = []
    for question_id, selected in answers.items():
        question = question_by_id(question_id)
        if not question:
            continue
        selected_answer = str(selected).upper()
        correct = selected_answer == question["correct_answer"]
        concept = question["primary_concept_id"]
        concepts[concept] = update_mastery(concepts.get(concept, DEFAULT_BKT_PARAMS.initial_mastery), correct)
        ability = update_ability(ability, float(question["irt_difficulty"]), correct)
        item_state = record_response(item_stats_collection, user["sub"], question, correct)
        results.append({
            **public_question(question, include_answer=True),
            "selected_answer": selected_answer,
            "is_correct": correct,
            "irt_status": item_state["irt_status"],
            "irt_response_count": item_state["irt_response_count"],
        })
    mastery_doc["ability"] = ability
    mastery_doc["ability_response_count"] = int(mastery_doc.get("ability_response_count", 0)) + len(results)
    save_mastery(mastery_collection, mastery_doc)
    return before, mastery_doc, results


def submit_assessment(attempts_collection, mastery_collection, item_stats_collection, user: dict[str, Any], assessment_id: str, answers: dict[str, str]) -> dict[str, Any]:
    if attempts_collection is None:
        raise ValueError("assessment storage unavailable")
    doc = attempts_collection.find_one({"assessment_id": assessment_id, "user_id": user["sub"]})
    if not doc:
        raise KeyError("assessment not found")
    if doc.get("submitted"):
        raise ValueError("assessment already submitted")
    valid_answers = {qid: str(answers.get(qid, "")).upper() for qid in doc.get("question_ids", []) if answers.get(qid)}
    before, mastery_doc, results = apply_responses(mastery_collection, item_stats_collection, user, valid_answers)
    score = sum(1 for result in results if result["is_correct"])
    total = len(doc.get("question_ids", []))
    recommendation = recommend_next_subtopic(mastery_doc.get("concepts", {}), results)
    completed = utcnow()
    update = {
        "completed_at": completed,
        "selected_answers": valid_answers,
        "score": score,
        "total": total,
        "percentage": round((score / total) * 100, 2) if total else 0.0,
        "results": results,
        "bkt_before": before,
        "bkt_after": mastery_doc.get("concepts", {}).copy(),
        "irt_ability_after": float(mastery_doc.get("ability", 0.0)),
        "recommendation": recommendation,
        "submitted": True,
    }
    attempts_collection.update_one({"assessment_id": assessment_id}, {"$set": update})
    doc.update(update)
    return assessment_response(doc, include_answers=True)
