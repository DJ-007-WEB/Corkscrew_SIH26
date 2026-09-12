from app import gamification


def test_level_thresholds():
    assert gamification.level_for_xp(0) == 1
    assert gamification.level_for_xp(499) == 1
    assert gamification.level_for_xp(500) == 2
    assert gamification.level_for_xp(1250) == 3
    into, needed = gamification.xp_into_level(1250)
    assert (into, needed) == (250, 500)


def test_streak_transitions():
    assert gamification.compute_streak("2026-09-12", "2026-09-12") == 0
    assert gamification.compute_streak("2026-09-11", "2026-09-12") == 1
    assert gamification.compute_streak(None, "2026-09-12") == 1
    assert gamification.compute_streak("2026-09-09", "2026-09-12") == -1


def test_hourly_cap_blocks_farming():
    gamification._hourly_awards.clear()
    total = sum(gamification.check_hourly_cap("u1", 25, float(t)) for t in range(10))
    assert total <= gamification.HOURLY_XP_CAP
