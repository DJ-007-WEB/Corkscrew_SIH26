import json
from functools import lru_cache
from pathlib import Path
from typing import Any


OPTION_KEYS = ("A", "B", "C", "D")
DIFFICULTY_TO_IRT = {"Easy": -1.5, "Medium": 0.0, "Hard": 1.5}


class QuestionBankError(ValueError):
    pass


def _bank_path() -> Path:
    return Path(__file__).resolve().parents[2] / "frontend" / "Questions" / "quantum_mcq_bank.json"


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def normalise_question(raw: dict[str, Any]) -> dict[str, Any]:
    options_raw = raw.get("options") or {}
    if isinstance(options_raw, dict):
        options = {key: _text(options_raw.get(key)) for key in OPTION_KEYS}
    elif isinstance(options_raw, list):
        options = {key: _text(options_raw[index]) if index < len(options_raw) else "" for index, key in enumerate(OPTION_KEYS)}
    else:
        options = {}
    difficulty = _text(raw.get("difficulty_level")) or "Medium"
    return {
        **raw,
        "id": _text(raw.get("id")),
        "module_id": _text(raw.get("module_id")),
        "subtopic_id": _text(raw.get("subtopic_id")),
        "assessment_type": _text(raw.get("assessment_type")),
        "question_type": _text(raw.get("question_type")) or "MCQ",
        "question": _text(raw.get("question")),
        "options": options,
        "correct_answer": _text(raw.get("correct_answer")).upper(),
        "explanation": _text(raw.get("explanation")),
        "difficulty_level": difficulty,
        "initial_irt_difficulty": float(raw.get("initial_irt_difficulty", DIFFICULTY_TO_IRT.get(difficulty, 0.0))),
        "irt_difficulty": float(raw.get("irt_difficulty", raw.get("initial_irt_difficulty", DIFFICULTY_TO_IRT.get(difficulty, 0.0)))),
        "irt_status": _text(raw.get("irt_status")) or "expert_initialized",
        "irt_response_count": int(raw.get("irt_response_count", 0) or 0),
        "primary_concept_id": _text(raw.get("primary_concept_id")),
        "related_topics": raw.get("related_topics") if isinstance(raw.get("related_topics"), list) else [],
        "learning_objectives": raw.get("learning_objectives") if isinstance(raw.get("learning_objectives"), list) else [],
        "skills_tagged": raw.get("skills_tagged") if isinstance(raw.get("skills_tagged"), list) else [],
        "question_source": _text(raw.get("question_source")),
        "is_active": bool(raw.get("is_active", True)),
    }


@lru_cache(maxsize=1)
def load_questions() -> list[dict[str, Any]]:
    data = json.loads(_bank_path().read_text(encoding="utf-8"))
    questions = [normalise_question(item) for item in data.get("questions", []) if isinstance(item, dict)]
    validate_questions(questions)
    return questions


def validate_questions(questions: list[dict[str, Any]]) -> None:
    ids = [q["id"] for q in questions]
    if len(ids) != len(set(ids)):
        raise QuestionBankError("Question IDs must be unique")
    valid_subtopics = {q["subtopic_id"] for q in questions if q["subtopic_id"]}
    valid_modules = {q["module_id"] for q in questions if q["module_id"]}
    for q in questions:
        if set(q["options"].keys()) != set(OPTION_KEYS) or any(not q["options"][key] for key in OPTION_KEYS):
            raise QuestionBankError(f"{q['id']} must have exactly four options")
        if q["correct_answer"] not in OPTION_KEYS:
            raise QuestionBankError(f"{q['id']} has invalid correct answer")
        if not q["module_id"] or q["module_id"] not in valid_modules:
            raise QuestionBankError(f"{q['id']} has invalid module")
        if not q["subtopic_id"] or q["subtopic_id"] not in valid_subtopics:
            raise QuestionBankError(f"{q['id']} has invalid subtopic")
        if not q["primary_concept_id"]:
            raise QuestionBankError(f"{q['id']} needs a primary concept")


def question_by_id(question_id: str) -> dict[str, Any] | None:
    return next((q for q in load_questions() if q["id"] == question_id), None) or load_learning_quiz_question_index().get(question_id)


def _module_files() -> list[Path]:
    return sorted((Path(__file__).resolve().parents[2] / "frontend" / "modules").glob("module*.json"))


def _module_number(raw: dict[str, Any], fallback: int) -> str:
    title = _text(raw.get("MODULE"))
    import re

    match = re.search(r"Module\s+(\d+)", title, re.I)
    return f"M{int(match.group(1)):02d}" if match else f"M{fallback:02d}"


def _option_dict(raw_options: Any) -> dict[str, str]:
    if isinstance(raw_options, dict):
        return {key: _text(raw_options.get(key)) for key in OPTION_KEYS}
    if isinstance(raw_options, list):
        return {key: _text(raw_options[index]) if index < len(raw_options) else "" for index, key in enumerate(OPTION_KEYS)}
    return {key: "" for key in OPTION_KEYS}


@lru_cache(maxsize=1)
def load_learning_quiz_question_index() -> dict[str, dict[str, Any]]:
    bank_by_subtopic: dict[str, list[dict[str, Any]]] = {}
    for question in load_questions():
        bank_by_subtopic.setdefault(question["subtopic_id"], []).append(question)
    index: dict[str, dict[str, Any]] = {}
    for module_index, path in enumerate(_module_files(), start=1):
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
        module_id = _module_number(raw, module_index)
        topics = raw.get("CONCEPTS") if isinstance(raw.get("CONCEPTS"), list) else raw.get("SUBTOPICS", [])
        if not isinstance(topics, list):
            topics = []
        for topic_index, topic in enumerate([item for item in topics if isinstance(item, dict)], start=1):
            subtopic_id = f"{module_id}-S{topic_index:02d}"
            source = (bank_by_subtopic.get(subtopic_id) or [{}])[0]
            concept = source.get("primary_concept_id") or _text(topic.get("CONCEPT_ID")) or subtopic_id
            for raw_question in topic.get("MCQS", []) if isinstance(topic.get("MCQS"), list) else []:
                if not isinstance(raw_question, dict):
                    continue
                question_id = _text(raw_question.get("QUESTION_ID")) or _text(raw_question.get("ID"))
                difficulty = _text(raw_question.get("DIFFICULTY")) or _text(raw_question.get("DIFFICULTY_LEVEL")) or source.get("difficulty_level", "Medium")
                index[question_id] = {
                    "id": question_id,
                    "module_id": module_id,
                    "subtopic_id": subtopic_id,
                    "assessment_type": "module_quiz",
                    "question_type": "MCQ",
                    "question": _text(raw_question.get("QUESTION")),
                    "options": _option_dict(raw_question.get("OPTIONS")),
                    "correct_answer": _text(raw_question.get("CORRECT_ANSWER")).upper(),
                    "explanation": _text(raw_question.get("EXPLANATION")) or "Review the linked lesson content for this concept.",
                    "difficulty_level": difficulty,
                    "initial_irt_difficulty": DIFFICULTY_TO_IRT.get(difficulty, 0.0),
                    "irt_difficulty": DIFFICULTY_TO_IRT.get(difficulty, 0.0),
                    "irt_status": "expert_initialized",
                    "irt_response_count": 0,
                    "primary_concept_id": concept,
                    "related_topics": source.get("related_topics", []),
                    "learning_objectives": topic.get("LEARNING_OBJECTIVES", []) if isinstance(topic.get("LEARNING_OBJECTIVES"), list) else [],
                    "skills_tagged": topic.get("SKILLS_TAGGED", []) if isinstance(topic.get("SKILLS_TAGGED"), list) else [],
                    "question_source": "module_content",
                    "is_active": True,
                }
    return index


def public_question(question: dict[str, Any], include_answer: bool = False) -> dict[str, Any]:
    result = {
        "id": question["id"],
        "module_id": question["module_id"],
        "subtopic_id": question["subtopic_id"],
        "assessment_type": question["assessment_type"],
        "question_type": question["question_type"],
        "question": question["question"],
        "options": question["options"],
        "difficulty_level": question["difficulty_level"],
        "irt_difficulty": question["irt_difficulty"],
        "irt_status": question["irt_status"],
        "primary_concept_id": question["primary_concept_id"],
        "related_topics": question["related_topics"],
        "learning_objectives": question["learning_objectives"],
    }
    if include_answer:
        result["correct_answer"] = question["correct_answer"]
        result["explanation"] = question["explanation"]
    return result
