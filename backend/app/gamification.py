"""Gamification foundation: XP, levels, streaks and leaderboards.

Phase 1 of the Contests roadmap. All date logic uses UTC and is computed
server-side so streaks/scores can never be faked by client clocks.

Collections:
- user_stats: one doc per user_id {user_id, name, total_xp, level,
  streak_count, best_streak, last_active_day, contests_played, duels_won, updated_at}
- xp_events: append-only audit log {user_id, kind, points, meta, created_at}
"""

from datetime import datetime, timedelta, timezone

LEVEL_STEP = 500  # XP per level

# Base XP per activity kind. Timer-based contests and duels (phases 2-3)
# award their own computed amounts; this map covers passive learning actions.
ACTIVITY_XP = {
    "circuit_run": 10,
    "save_circuit": 5,
    "assessment_complete": 25,
    "lesson_visit": 2,
}

# Anti-farm cap: max XP earnable from passive activities per user per hour.
HOURLY_XP_CAP = 120

_hourly_awards: dict[str, list[tuple[float, int]]] = {}


def level_for_xp(total_xp: int) -> int:
    return int(total_xp) // LEVEL_STEP + 1


def xp_into_level(total_xp: int) -> tuple[int, int]:
    """Return (xp_progress_in_current_level, xp_needed_for_next_level)."""
    return int(total_xp) % LEVEL_STEP, LEVEL_STEP


def compute_streak(last_active_day: str | None, today: str) -> int:
    """Pure streak transition. Dates are 'YYYY-MM-DD' UTC strings.

    Returns the streak count increment signal: 0 = already counted today,
    1 = extend by one (yesterday) or reset to one (gap / first day).
    Caller applies it; kept pure for unit tests.
    """
    if last_active_day == today:
        return 0
    if last_active_day is None:
        return 1
    try:
        last = datetime.strptime(last_active_day, "%Y-%m-%d").date()
        now = datetime.strptime(today, "%Y-%m-%d").date()
    except ValueError:
        return 1
    if (now - last).days == 1:
        return 1  # consecutive day -> caller increments
    if (now - last).days < 1:
        return 0
    return -1  # gap -> caller resets to 1


def utc_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _hourly_total(user_id: str, now_ts: float) -> int:
    entries = [(ts, pts) for ts, pts in _hourly_awards.get(user_id, []) if now_ts - ts < 3600]
    _hourly_awards[user_id] = entries
    return sum(pts for _, pts in entries)


def check_hourly_cap(user_id: str, points: int, now_ts: float) -> int:
    """Clamp points so hourly passive earnings stay under HOURLY_XP_CAP."""
    earned = _hourly_total(user_id, now_ts)
    allowed = max(0, HOURLY_XP_CAP - earned)
    granted = min(points, allowed)
    if granted > 0:
        _hourly_awards[user_id].append((now_ts, granted))
    return granted


def week_start_utc(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def blank_stats(user_id: str, name: str) -> dict:
    from datetime import datetime as _dt, timezone as _tz

    return {
        "user_id": user_id,
        "name": name,
        "total_xp": 0,
        "streak_count": 0,
        "best_streak": 0,
        "last_active_day": None,
        "contests_played": 0,
        "duels_won": 0,
        "updated_at": _dt.now(_tz.utc),
    }


def apply_award(doc: dict, points: int, today: str) -> dict:
    """Pure stats transition: streak advance + XP. Returns the $set update dict."""
    from datetime import datetime as _dt, timezone as _tz

    update: dict = {"updated_at": _dt.now(_tz.utc)}
    signal = compute_streak(doc.get("last_active_day"), today)
    if signal != 0:
        new_streak = doc.get("streak_count", 0) + 1 if signal == 1 else 1
        update["streak_count"] = new_streak
        update["best_streak"] = max(int(doc.get("best_streak", 0)), new_streak)
        update["last_active_day"] = today
    if points:
        update["total_xp"] = int(doc.get("total_xp", 0)) + points
    return update
