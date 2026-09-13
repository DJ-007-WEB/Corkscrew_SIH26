from datetime import datetime, timezone

from app import assessment_service
from app.adaptive_engine import select_adaptive_questions
from app.bkt import update_mastery
from app.irt import calibration_status, probability_correct, update_ability
from app.question_bank import load_questions, question_by_id


class FakeCollection:
    def __init__(self):
        self.docs = []

    def find_one(self, query, sort=None):
        matches = list(self.find(query))
        if sort:
            key, direction = sort[0]
            matches.sort(key=lambda item: item.get(key) or datetime.min.replace(tzinfo=timezone.utc), reverse=direction < 0)
        return matches[0] if matches else None

    def find(self, query=None):
        query = query or {}
        return FakeCursor([doc for doc in self.docs if self._matches(doc, query)])

    def insert_one(self, doc):
        self.docs.append(doc.copy())
        return type("Result", (), {"inserted_id": doc.get("assessment_id", "fake")})()

    def update_one(self, query, update, upsert=False):
        doc = self.find_one(query)
        if doc is None and upsert:
            doc = query.copy()
            self.docs.append(doc)
        if doc is not None:
            doc.update(update.get("$set", {}))
        return type("Result", (), {"modified_count": 1})()

    def _matches(self, doc, query):
        for key, expected in query.items():
            actual = doc.get(key)
            if isinstance(expected, dict):
                if "$exists" in expected and (key in doc) != expected["$exists"]:
                    return False
                if "$ne" in expected and actual == expected["$ne"]:
                    return False
            elif actual != expected:
                return False
        return True


class FakeCursor(list):
    def sort(self, key, direction):
        return FakeCursor(sorted(self, key=lambda item: item.get(key) or datetime.min.replace(tzinfo=timezone.utc), reverse=direction < 0))

    def limit(self, count):
        return FakeCursor(self[:count])


def test_bkt_update_after_correct_and_incorrect_response():
    prior = 0.35
    assert update_mastery(prior, True) > prior
    assert update_mastery(prior, False) < prior


def test_separate_mastery_for_separate_concepts():
    mastery = {}
    mastery["QC-HADAMARD"] = update_mastery(mastery.get("QC-HADAMARD", 0.35), True)
    mastery["QC-CNOT"] = update_mastery(mastery.get("QC-CNOT", 0.35), False)
    assert mastery["QC-HADAMARD"] != mastery["QC-CNOT"]


def test_irt_probability_and_student_ability_update():
    assert probability_correct(1.5, -1.5) > probability_correct(-1.5, 1.5)
    assert update_ability(0.0, 0.0, True) > 0.0
    assert update_ability(0.0, 0.0, False) < 0.0


def test_adaptive_assessment_returns_seven_active_unique_questions():
    questions = select_adaptive_questions({"QC-HADAMARD": 0.1}, 0.0, seed="test")
    assert len(questions) == 7
    assert len({q["id"] for q in questions}) == 7
    assert all(q["is_active"] for q in questions)


def test_question_bank_integrity():
    questions = load_questions()
    assert len({q["id"] for q in questions}) == len(questions)
    assert all(set(q["options"]) == {"A", "B", "C", "D"} for q in questions)
    assert all(q["correct_answer"] in {"A", "B", "C", "D"} for q in questions)
    assert all(q["module_id"] and q["subtopic_id"] and q["primary_concept_id"] for q in questions)


def test_past_assessment_persisted_with_answers_explanations_and_recommendation():
    attempts = FakeCollection()
    mastery = FakeCollection()
    item_stats = FakeCollection()
    user = {"sub": "student-1", "name": "Student"}
    started = assessment_service.start_assessment(attempts, mastery, user)
    answers = {q["id"]: question_by_id(q["id"])["correct_answer"] for q in started["questions"]}
    graded = assessment_service.submit_assessment(attempts, mastery, item_stats, user, started["assessment_id"], answers)
    assert graded["submitted"] is True
    assert graded["score"] == 7
    assert len(attempts.docs) == 1
    assert all(result["correct_answer"] and result["explanation"] for result in graded["results"])
    assert graded["recommendation"]["subtopic_id"]


def test_module_wise_quiz_responses_update_bkt():
    mastery = FakeCollection()
    item_stats = FakeCollection()
    user = {"sub": "student-2", "name": "Student"}
    before, after, results = assessment_service.apply_responses(mastery, item_stats, user, {"Q_QC_01": "B"})
    assert len(results) == 1
    assert before == {}
    assert after["concepts"]


def test_assessment_responses_update_both_bkt_and_irt():
    attempts = FakeCollection()
    mastery = FakeCollection()
    item_stats = FakeCollection()
    user = {"sub": "student-3", "name": "Student"}
    started = assessment_service.start_assessment(attempts, mastery, user)
    answers = {q["id"]: "A" for q in started["questions"]}
    graded = assessment_service.submit_assessment(attempts, mastery, item_stats, user, started["assessment_id"], answers)
    assert graded["bkt_after"]
    assert graded["irt_ability_after"] != graded["irt_ability_before"]


def test_insufficient_data_and_calibration_status_behavior():
    assert calibration_status(0, 0, 0) == "expert_initialized"
    assert calibration_status(10, 20, 10) == "insufficient_data"
    assert calibration_status(500, 40, 40) == "needs_recalibration"
    assert calibration_status(500, 40, 20) == "calibrating"
