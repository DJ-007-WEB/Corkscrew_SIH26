from app import contests


def test_decide_duel_winner_score_first():
    assert contests.decide_duel_winner(4, 200.0, 3, 50.0) == "host"
    assert contests.decide_duel_winner(2, 50.0, 5, 290.0) == "guest"


def test_decide_duel_winner_speed_tiebreak():
    assert contests.decide_duel_winner(3, 100.0, 3, 150.0) == "host"
    assert contests.decide_duel_winner(3, 150.0, 3, 100.0) == "guest"
    assert contests.decide_duel_winner(3, 100.0, 3, 100.0) == "tie"
