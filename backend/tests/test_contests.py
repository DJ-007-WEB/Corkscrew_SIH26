from app import contests


def test_pick_questions_returns_requested_count_without_answers():
    picked = contests.pick_questions(seed="test-seed")
    assert len(picked) == contests.SPRINT_QUESTIONS
    assert len({q["id"] for q in picked}) == contests.SPRINT_QUESTIONS
    public = [contests.public_question(q) for q in picked]
    assert all("answer" not in q and "explanation" not in q for q in public)


def test_grade_sprint_scoring_and_skip():
    questions = contests.QUESTION_BANK[:3]
    answers = {questions[0]["id"]: questions[0]["answer"], questions[1]["id"]: (questions[1]["answer"] + 1) % 4}
    correct, wrong, results = contests.grade_sprint(questions, answers)
    assert (correct, wrong) == (1, 1)
    assert len(results) == 3
    assert results[2]["answered"] is False


def test_sprint_xp_time_bonus_decays():
    base_fast, bonus_fast, _ = contests.sprint_xp(8, 0, 60.0)
    base_slow, bonus_slow, _ = contests.sprint_xp(8, 0, 470.0)
    assert base_fast == base_slow == 80
    assert bonus_fast > bonus_slow >= 0


def test_sprint_new_solve_xp_only_pays_fresh_questions():
    base, bonus, total = contests.sprint_new_solve_xp(8, 0, 60.0)
    assert (base, total) == (80, 80 + bonus) and bonus > 0
    # Perfect paper, nothing new: zero payout, zero bonus.
    assert contests.sprint_new_solve_xp(0, 0, 60.0) == (0, 0, 0)
    # Partially fresh: only new questions count toward base.
    base, _, _ = contests.sprint_new_solve_xp(3, 1, 60.0)
    assert base == 3 * contests.CORRECT_XP - contests.WRONG_PENALTY


def test_challenge_checkers():
    ok, _ = contests.check_challenge("flip-to-one", {"0": 0.0, "1": 1.0}, 1)
    assert ok is True
    ok, _ = contests.check_challenge("flip-to-one", {"0": 0.5, "1": 0.5}, 1)
    assert ok is False
    ok, _ = contests.check_challenge("superposition", {"0": 0.5, "1": 0.5}, 1)
    assert ok is True
    ok, msg = contests.check_challenge("bell-phi-plus", {"00": 0.5, "11": 0.5, "01": 0.0, "10": 0.0}, 2)
    assert ok is True
    ok, _ = contests.check_challenge("bell-phi-plus", {"00": 0.25, "11": 0.25, "01": 0.25, "10": 0.25}, 2)
    assert ok is False
    ok, msg = contests.check_challenge("bell-phi-plus", {"00": 0.5, "11": 0.5}, 9)
    assert ok is False and "Too many gates" in msg


def test_challenge_xp_rewards_efficiency():
    assert contests.challenge_xp(False, 2, 4) == 0
    assert contests.challenge_xp(True, 2, 4) > contests.challenge_xp(True, 4, 4) >= 50
