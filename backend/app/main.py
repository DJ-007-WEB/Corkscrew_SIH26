import io
import logging
import time
from datetime import datetime, timedelta, timezone

def _as_aware(value) -> datetime:
    """Coerce a Mongo/ISO datetime to tz-aware UTC.

    MongoDB returns naive datetimes (tzinfo stripped on storage), so any
    timestamp read back from the DB must be re-anchored to UTC before
    arithmetic against datetime.now(timezone.utc).
    """
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import backends, contests, dns_fix, gamification
from . import assessment_service
from .auth import (
    current_user,
    ensure_instructor_account,
    get_assessment_results_collection,
    get_assessment_submissions_collection,
    get_assessments_collection,
    get_challenge_solves_collection,
    get_contest_attempts_collection,
    get_duel_rooms_collection,
    get_item_stats_collection,
    get_learner_mastery_collection,
    get_saved_works_collection,
    get_sprint_solves_collection,
    get_user_stats_collection,
    get_users_collection,
    get_xp_events_collection,
    google_login,
    login as password_login,
    optional_user,
    require_instructor,
    signup as password_signup,
)
from . import assessments as assessments_logic
from .circuit_builder import circuit_from_qiskit, circuit_to_qasm, circuit_to_qiskit, gate_catalog, validate_circuit
from .circuit_diagnostics import diagnose_circuit
from .gamification import ACTIVITY_XP
from .quantum_engine import (
    create_bell_circuit,
    create_dj_circuit,
    create_grovers_circuit,
    create_teleportation_circuit,
    run_circuit,
)
from .schemas import (
    ActivityRequest,
    AdaptiveAssessment,
    AssessmentHistoryResponse,
    AssessmentResult,
    AssessmentSubmitAnswersRequest,
    AssessmentAnswerSubmit,
    AssessmentAttemptResult,
    AssessmentBreakdown,
    AssessmentCreateRequest,
    AssessmentInstructorDetail,
    AssessmentResult,
    AssessmentStudentDetail,
    AssessmentSubmitRequest,
    AssessmentSummary,
    AssessmentUpdateRequest,
    AuthResponse,
    BackendInfo,
    ChallengeSubmitRequest,
    ChallengeSubmitResponse,
    ChallengeTask,
    ChatRequest,
    ChatResponse,
    Circuit,
    CircuitDiagnosis,
    CodeRequest,
    DailyCount,
    DuelAnswerRequest,
    DuelCreateResponse,
    DuelJoinRequest,
    DuelState,
    GateDefinition,
    GoogleAuthRequest,
    InstructorDashboard,
    LeaderboardEntry,
    LearningQuizSubmitRequest,
    LearningQuizSubmitResponse,
    LoginRequest,
    ParsedQuestions,
    QuizQuestion,
    SavedWork,
    SavedWorkRequest,
    SignupRequest,
    SimulateRequest,
    SimulationResult,
    SprintQuestionResult,
    SprintStartResponse,
    SprintSubmitRequest,
    SprintSubmitResponse,
    TopPerformer,
    UserPublicProfile,
    UserStats,
)
from .tutor_service import answer as tutor_answer

try:
    from pypdf import PdfReader
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

app = FastAPI(title="Quantum Learning Platform API")
logger = logging.getLogger("quantum_tutor")
_chat_limits: dict[str, list[float]] = {}
_sprint_solves_index_ready = False

# Dev defaults; production should set FRONTEND_URL in the environment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _seed_instructor_account() -> None:
    """Ensure the single instructor login always works, even on a fresh DB."""
    ensure_instructor_account()




@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/gates", response_model=list[GateDefinition])
def gates():
    return gate_catalog()


@app.post("/api/auth/google", response_model=AuthResponse)
def auth_google(payload: GoogleAuthRequest):
    if not payload.credential:
        raise HTTPException(400, "Google credential is required")
    return google_login(payload.credential)


@app.post("/api/auth/signup", response_model=AuthResponse)
def auth_signup(payload: SignupRequest):
    return password_signup(payload.name, payload.email, payload.password)


@app.post("/api/auth/login", response_model=AuthResponse)
def auth_login(payload: LoginRequest):
    return password_login(payload.email, payload.password)


@app.get("/api/auth/me")
def auth_me(request: Request):
    return {"user": current_user(request)}


def _stats_doc(user_id: str, name: str) -> dict:
    return {
        "user_id": user_id,
        "name": name,
        "total_xp": 0,
        "streak_count": 0,
        "best_streak": 0,
        "last_active_day": None,
        "contests_played": 0,
        "duels_won": 0,
        "updated_at": datetime.now(timezone.utc),
    }


def _stats_response(doc: dict, rank: int | None = None) -> dict:
    total = int(doc.get("total_xp", 0))
    into, needed = gamification.xp_into_level(total)
    return {
        "user_id": doc["user_id"],
        "name": doc.get("name", "Quantum Learner"),
        "total_xp": total,
        "level": gamification.level_for_xp(total),
        "xp_into_level": into,
        "xp_for_next_level": needed,
        "streak_count": int(doc.get("streak_count", 0)),
        "best_streak": int(doc.get("best_streak", 0)),
        "contests_played": int(doc.get("contests_played", 0)),
        "duels_won": int(doc.get("duels_won", 0)),
        "rank": rank,
    }


def _my_rank(stats_collection, total_xp: int) -> int:
    try:
        return int(stats_collection.count_documents({"total_xp": {"$gt": total_xp}})) + 1
    except Exception:
        return 1


@app.get("/api/gamification/me", response_model=UserStats)
def gamification_me(request: Request):
    user = current_user(request)
    stats_collection = get_user_stats_collection()
    if stats_collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    doc = stats_collection.find_one({"user_id": user["sub"]})
    if doc is None:
        doc = _stats_doc(user["sub"], user.get("name", "Quantum Learner"))
        stats_collection.insert_one(doc)
    return _stats_response(doc, _my_rank(stats_collection, int(doc.get("total_xp", 0))))


@app.post("/api/gamification/activity", response_model=UserStats)
def gamification_activity(payload: ActivityRequest, request: Request):
    """Award XP for a passive learning action and advance the daily streak.

    Fire-and-forget from the client: unknown kinds earn 0 XP but still
    count toward the streak. Hourly cap prevents farming.
    """
    import time as _time

    user = current_user(request)
    stats_collection = get_user_stats_collection()
    events_collection = get_xp_events_collection()
    if stats_collection is None or events_collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    kind = payload.kind.strip().lower()
    base = int(ACTIVITY_XP.get(kind, 0))
    granted = gamification.check_hourly_cap(user["sub"], base, _time.monotonic()) if base else 0

    name = user.get("name", "Quantum Learner")
    doc = stats_collection.find_one({"user_id": user["sub"]})
    if doc is None:
        doc = _stats_doc(user["sub"], name)
        stats_collection.insert_one(doc)

    today = gamification.utc_today()
    signal = gamification.compute_streak(doc.get("last_active_day"), today)
    update: dict = {"name": name, "updated_at": datetime.now(timezone.utc)}
    if signal != 0:
        new_streak = doc.get("streak_count", 0) + 1 if signal == 1 else 1
        update["streak_count"] = new_streak
        update["best_streak"] = max(int(doc.get("best_streak", 0)), new_streak)
        update["last_active_day"] = today
    if granted:
        update["total_xp"] = int(doc.get("total_xp", 0)) + granted
    stats_collection.update_one({"user_id": user["sub"]}, {"$set": update})
    if granted:
        events_collection.insert_one(
            {"user_id": user["sub"], "kind": kind, "points": granted, "meta": payload.detail[:200], "created_at": datetime.now(timezone.utc)}
        )
    doc = stats_collection.find_one({"user_id": user["sub"]})
    return _stats_response(doc, _my_rank(stats_collection, int(doc.get("total_xp", 0))))


@app.get("/api/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(request: Request, period: str = "all"):
    user = current_user(request)
    stats_collection = get_user_stats_collection()
    events_collection = get_xp_events_collection()
    if stats_collection is None or events_collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    period = period.strip().lower()
    entries: list[dict] = []
    if period == "weekly":
        start = gamification.week_start_utc()
        pipeline = [
            {"$match": {"created_at": {"$gte": start}}},
            {"$group": {"_id": "$user_id", "points": {"$sum": "$points"}}},
            {"$sort": {"points": -1}},
            {"$limit": 50},
        ]
        weekly = list(events_collection.aggregate(pipeline))
        for index, row in enumerate(weekly, start=1):
            doc = stats_collection.find_one({"user_id": row["_id"]}) or {}
            total = int(doc.get("total_xp", row["points"]))
            entries.append(
                {
                    "rank": index,
                    "user_id": row["_id"],
                    "name": doc.get("name", "Quantum Learner"),
                    "total_xp": total,
                    "level": gamification.level_for_xp(total),
                    "streak_count": int(doc.get("streak_count", 0)),
                    "is_me": row["_id"] == user["sub"],
                }
            )
        return entries
    docs = list(stats_collection.find().sort("total_xp", -1).limit(50))
    return [
        {
            "rank": index,
            "user_id": doc.get("user_id", ""),
            "name": doc.get("name", "Quantum Learner"),
            "total_xp": int(doc.get("total_xp", 0)),
            "level": gamification.level_for_xp(int(doc.get("total_xp", 0))),
            "streak_count": int(doc.get("streak_count", 0)),
            "is_me": doc.get("user_id") == user["sub"],
        }
        for index, doc in enumerate(docs, start=1)
    ]


@app.get("/api/users/{user_id}", response_model=UserPublicProfile)
def user_profile(user_id: str, request: Request):
    """Public LeetCode-style profile: any signed-in user may view any player's
    overview. Never exposes email or credentials — only name, avatar, public
    stats, rank and recent scoring activity."""
    me = current_user(request)
    stats_collection = get_user_stats_collection()
    events_collection = get_xp_events_collection()
    users_collection = get_users_collection()
    if stats_collection is None or events_collection is None or users_collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    target = user_id.strip()[:64]
    doc = stats_collection.find_one({"user_id": target})
    if doc is None:
        raise HTTPException(404, "Player not found")
    account = users_collection.find_one({"google_id": target}) or {}
    total = int(doc.get("total_xp", 0))
    into, needed = gamification.xp_into_level(total)
    recent = list(events_collection.find({"user_id": target}).sort("created_at", -1).limit(10))
    return {
        "user_id": target,
        "name": doc.get("name", account.get("name", "Quantum Learner")),
        "picture": account.get("picture"),
        "total_xp": total,
        "level": gamification.level_for_xp(total),
        "xp_into_level": into,
        "xp_for_next_level": needed,
        "streak_count": int(doc.get("streak_count", 0)),
        "best_streak": int(doc.get("best_streak", 0)),
        "contests_played": int(doc.get("contests_played", 0)),
        "duels_won": int(doc.get("duels_won", 0)),
        "rank": _my_rank(stats_collection, total),
        "is_me": target == me["sub"],
        "recent_activity": [
            {
                "kind": str(e.get("kind", "")),
                "points": int(e.get("points", 0)),
                "created_at": e.get("created_at").isoformat() if e.get("created_at") else "",
            }
            for e in recent
        ],
    }


def _award_contest_xp(user: dict, kind: str, points: int, detail: str) -> dict:
    """Shared contest payout: streak advance + XP + audit event + contests_played bump."""
    stats_collection = get_user_stats_collection()
    events_collection = get_xp_events_collection()
    if stats_collection is None or events_collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    name = user.get("name", "Quantum Learner")
    doc = stats_collection.find_one({"user_id": user["sub"]})
    if doc is None:
        doc = gamification.blank_stats(user["sub"], name)
        stats_collection.insert_one(doc)
    update = gamification.apply_award(doc, points, gamification.utc_today())
    update["name"] = name
    update["contests_played"] = int(doc.get("contests_played", 0)) + 1
    stats_collection.update_one({"user_id": user["sub"]}, {"$set": update})
    events_collection.insert_one(
        {"user_id": user["sub"], "kind": kind, "points": points, "meta": detail[:200], "created_at": datetime.now(timezone.utc)}
    )
    fresh = stats_collection.find_one({"user_id": user["sub"]})
    return _stats_response(fresh, _my_rank(stats_collection, int(fresh.get("total_xp", 0))))


@app.post("/api/contests/sprint/start", response_model=SprintStartResponse)
def sprint_start(request: Request):
    import uuid

    user = current_user(request)
    attempts = get_contest_attempts_collection()
    if attempts is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    attempt_id = uuid.uuid4().hex[:16]
    questions = contests.pick_questions(seed=f"{user['sub']}:{attempt_id}")
    started = datetime.now(timezone.utc)
    attempts.insert_one(
        {
            "attempt_id": attempt_id,
            "user_id": user["sub"],
            "question_ids": [q["id"] for q in questions],
            # Order-independent identity of this quiz set: a repeat of the
            # same questions (any order) pays XP only the first time.
            "quiz_key": ",".join(sorted(q["id"] for q in questions)),
            "started_at": started,
            "duration_sec": contests.SPRINT_DURATION_SEC,
            "submitted": False,
        }
    )
    return {
        "attempt_id": attempt_id,
        "questions": [contests.public_question(q) for q in questions],
        "duration_sec": contests.SPRINT_DURATION_SEC,
        "started_at": started.isoformat(),
    }


@app.post("/api/contests/sprint/submit", response_model=SprintSubmitResponse)
def sprint_submit(payload: SprintSubmitRequest, request: Request):
    user = current_user(request)
    attempts = get_contest_attempts_collection()
    if attempts is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    # Atomic single-submit claim: only the first submit for an attempt proceeds;
    # concurrent retries find submitted=True already set and get the 400 below.
    # Payout is per-question first-solve (see below): new questions earn XP,
    # already-solved ones grade normally but pay nothing.
    now = datetime.now(timezone.utc)
    attempt = attempts.find_one_and_update(
        {"attempt_id": payload.attempt_id, "user_id": user["sub"], "submitted": {"$ne": True}},
        {"$set": {"submitted": True, "submitted_at": now}},
    )
    if attempt is None:
        existing = attempts.find_one({"attempt_id": payload.attempt_id, "user_id": user["sub"]})
        if existing is None:
            raise HTTPException(404, "Sprint attempt not found")
        raise HTTPException(400, "This attempt was already submitted")
    bank = {q["id"]: q for q in contests.QUESTION_BANK}
    questions = [bank[qid] for qid in attempt["question_ids"] if qid in bank]
    if not questions:
        raise HTTPException(400, "Sprint attempt has no valid questions")
    started = _as_aware(attempt["started_at"])
    elapsed = max(0.0, (now - started).total_seconds())
    if elapsed > attempt["duration_sec"] + contests.SPRINT_SUBMIT_GRACE_SEC:
        raise HTTPException(400, "Time expired — this attempt is no longer submittable. Start a new sprint.")
    answers = {qid: val for qid, val in (payload.answers or {}).items() if isinstance(val, int)}
    correct, wrong, results = contests.grade_sprint(questions, answers)
    base, bonus, _ = contests.sprint_xp(correct, wrong, elapsed, attempt["duration_sec"])
    attempts.update_one({"attempt_id": payload.attempt_id}, {"$set": {"score": base}})
    # First-solve credit: XP only for questions this user has never answered
    # correctly before. Re-solving known questions (even a perfect paper)
    # still grades normally but earns nothing — LeetCode-style, no farming by
    # replaying overlapping quiz sets.
    solves = get_sprint_solves_collection()
    stats_collection = get_user_stats_collection()
    if solves is None or stats_collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    global _sprint_solves_index_ready
    if not _sprint_solves_index_ready:
        solves.create_index([("user_id", 1), ("question_id", 1)], unique=True)
        _sprint_solves_index_ready = True
    from pymongo.errors import DuplicateKeyError

    fresh_ids: list[str] = []
    for r in results:
        if not r["is_correct"]:
            continue
        if solves.find_one({"user_id": user["sub"], "question_id": r["id"]}) is None:
            fresh_ids.append(r["id"])
    new_correct = 0
    for qid in fresh_ids:
        try:
            solves.insert_one(
                {"user_id": user["sub"], "question_id": qid, "created_at": datetime.now(timezone.utc)}
            )
            new_correct += 1
        except DuplicateKeyError:
            pass  # lost a concurrent first-solve race: no credit, no crash
    _, _, total = contests.sprint_new_solve_xp(new_correct, wrong, elapsed, attempt["duration_sec"])
    already_solved = correct > 0 and new_correct == 0
    if already_solved:
        doc = stats_collection.find_one({"user_id": user["sub"]})
        if doc is None:
            doc = gamification.blank_stats(user["sub"], user.get("name", "Quantum Learner"))
            stats_collection.insert_one(doc)
        stats = _stats_response(doc, _my_rank(stats_collection, int(doc.get("total_xp", 0))))
        return {
            "correct": correct,
            "wrong": wrong,
            "skipped": len(questions) - correct - wrong,
            "total": len(questions),
            "time_sec": round(elapsed, 1),
            "base_score": base,
            "time_bonus": bonus,
            "xp_earned": 0,
            "already_solved": True,
            "results": results,
            "stats": stats,
        }
    stats = _award_contest_xp(
        user, "sprint_quiz", total, f"{correct}/{len(questions)} correct ({new_correct} new) in {elapsed:.0f}s"
    )
    return {
        "correct": correct,
        "wrong": wrong,
        "skipped": len(questions) - correct - wrong,
        "total": len(questions),
        "time_sec": round(elapsed, 1),
        "base_score": base,
        "time_bonus": bonus,
        "xp_earned": total,
        "already_solved": False,
        "results": results,
        "stats": stats,
    }


@app.get("/api/contests/challenges", response_model=list[ChallengeTask])
def challenge_list():
    return contests.CHALLENGE_TASKS


@app.post("/api/contests/challenges/submit", response_model=ChallengeSubmitResponse)
def challenge_submit(payload: ChallengeSubmitRequest, request: Request):
    user = current_user(request)
    task = next((t for t in contests.CHALLENGE_TASKS if t["id"] == payload.task_id), None)
    if task is None:
        raise HTTPException(404, "Challenge task not found")
    try:
        circuit = validate_circuit(payload.circuit)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if circuit.qubits != task["qubits"]:
        raise HTTPException(400, f"This task needs exactly {task['qubits']} qubit(s); yours has {circuit.qubits}.")
    try:
        result = run_circuit(circuit, "qiskit_aer")
    except backends.BackendUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid circuit: {exc}") from exc
    passed, message = contests.check_challenge(task["id"], result.final_probabilities, len(circuit.gates))
    solves = get_challenge_solves_collection()
    stats_collection = get_user_stats_collection()
    if solves is None or stats_collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    # First successful submission per task per user earns XP; later passes
    # only report correctness so challenge XP can't be farmed by resubmitting.
    already_solved = solves.find_one({"user_id": user["sub"], "task_id": task["id"]}) is not None
    if passed and already_solved:
        doc = stats_collection.find_one({"user_id": user["sub"]})
        if doc is None:
            doc = gamification.blank_stats(user["sub"], user.get("name", "Quantum Learner"))
            stats_collection.insert_one(doc)
        stats = _stats_response(doc, _my_rank(stats_collection, int(doc.get("total_xp", 0))))
        return {
            "passed": passed,
            "message": message,
            "probabilities": result.final_probabilities,
            "gates_used": len(circuit.gates),
            "xp_earned": 0,
            "already_solved": True,
            "stats": stats,
        }
    xp = contests.challenge_xp(passed, len(circuit.gates), task["max_gates"])
    if passed:
        solves.insert_one(
            {"user_id": user["sub"], "task_id": task["id"], "xp": xp, "created_at": datetime.now(timezone.utc)}
        )
    stats = _award_contest_xp(user, "circuit_challenge", xp, f"{task['id']}: {'pass' if passed else 'fail'}")
    return {
        "passed": passed,
        "message": message,
        "probabilities": result.final_probabilities,
        "gates_used": len(circuit.gates),
        "xp_earned": xp,
        "already_solved": already_solved,
        "stats": stats,
    }


DUEL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _new_duel_code(rooms) -> str:
    import random as _random

    for _ in range(20):
        code = "".join(_random.choice(DUEL_CODE_ALPHABET) for _ in range(6))
        if rooms.find_one({"code": code, "status": {"$ne": "finished"}}) is None:
            return code
    raise HTTPException(503, "Could not create a duel room right now. Try again.")


def _duel_deadline(room) -> datetime:
    started = _as_aware(room["started_at"])
    return started + timedelta(seconds=room["duration_sec"] + 10)


def _finish_duel(room) -> dict:
    """Grade a live room, pay out XP to both players, mark finished. Idempotent.

    The live -> finishing claim is a single atomic write, so simultaneous
    submits (or a submit racing the deadline poll) can only ever pay out
    once per duel. Re-submits after that are pure reads: no XP, no rank delta.
    """
    rooms = get_duel_rooms_collection()
    stats_collection = get_user_stats_collection()
    events_collection = get_xp_events_collection()
    claimed = rooms.update_one({"code": room["code"], "status": "live"}, {"$set": {"status": "finishing"}})
    if claimed.modified_count == 0:
        return rooms.find_one({"code": room["code"]}) or room
    room = rooms.find_one({"code": room["code"]}) or room
    bank = {q["id"]: q for q in contests.QUESTION_BANK}
    questions = [bank[qid] for qid in room["question_ids"] if qid in bank]
    now = datetime.now(timezone.utc)
    deadline = _duel_deadline(room)

    def elapsed(side: str) -> float:
        started = _as_aware(room["started_at"])
        submitted_at = room.get(f"{side}_submitted_at")
        if submitted_at:
            return max(0.0, (_as_aware(submitted_at) - started).total_seconds())
        return max(0.0, min((now - started).total_seconds(), room["duration_sec"]))

    host_answers = {k: v for k, v in (room.get("host_answers") or {}).items() if isinstance(v, int)}
    guest_answers = {k: v for k, v in (room.get("guest_answers") or {}).items() if isinstance(v, int)}
    host_correct, host_wrong, _ = contests.grade_sprint(questions, host_answers)
    guest_correct, guest_wrong, _ = contests.grade_sprint(questions, guest_answers)
    host_time, guest_time = elapsed("host"), elapsed("guest")
    winner = contests.decide_duel_winner(host_correct, host_time, guest_correct, guest_time)

    payouts = {}
    if winner == "tie":
        payouts = {"host": contests.DUEL_TIE_XP, "guest": contests.DUEL_TIE_XP}
    elif winner == "host":
        payouts = {"host": contests.DUEL_WINNER_XP, "guest": contests.DUEL_LOSER_XP}
    else:
        payouts = {"host": contests.DUEL_LOSER_XP, "guest": contests.DUEL_WINNER_XP}

    today = gamification.utc_today()
    for side in ("host", "guest"):
        uid = room.get(f"{side}_id")
        if not uid:
            continue
        doc = stats_collection.find_one({"user_id": uid})
        if doc is None:
            doc = gamification.blank_stats(uid, room.get(f"{side}_name", "Quantum Learner"))
            stats_collection.insert_one(doc)
        update = gamification.apply_award(doc, payouts[side], today)
        update["name"] = room.get(f"{side}_name", doc.get("name", "Quantum Learner"))
        if winner != "tie" and winner == side:
            update["duels_won"] = int(doc.get("duels_won", 0)) + 1
        stats_collection.update_one({"user_id": uid}, {"$set": update})
        events_collection.insert_one(
            {"user_id": uid, "kind": "duel", "points": payouts[side], "meta": f"duel {room['code']}: {winner}", "created_at": now}
        )

    rooms.update_one(
        {"code": room["code"]},
        {"$set": {
            "status": "finished",
            "finished_at": now,
            "winner": winner,
            "host_correct": host_correct,
            "host_wrong": host_wrong,
            "guest_correct": guest_correct,
            "guest_wrong": guest_wrong,
            "host_elapsed": host_time,
            "guest_elapsed": guest_time,
            "host_xp": payouts["host"],
            "guest_xp": payouts["guest"],
        }},
    )
    return rooms.find_one({"code": room["code"]})


def _maybe_finish_duel(room) -> dict:
    """Finalize a live room when both players submitted or the deadline passed."""
    if room.get("status") != "live":
        return room
    now = datetime.now(timezone.utc)
    both_in = room.get("host_submitted") and room.get("guest_submitted")
    if both_in or now >= _duel_deadline(room):
        return _finish_duel(room)
    return room


def _duel_state(room, user: dict) -> dict:
    uid = user["sub"]
    is_host = room.get("host_id") == uid
    if room.get("host_id") != uid and room.get("guest_id") != uid:
        raise HTTPException(403, "You are not a player in this duel")
    bank = {q["id"]: q for q in contests.QUESTION_BANK}
    questions = [bank[qid] for qid in room.get("question_ids", []) if qid in bank]
    side = "host" if is_host else "guest"
    other = "guest" if is_host else "host"
    now = datetime.now(timezone.utc)
    time_left = 0.0
    # "finishing" is the transient grading state inside _finish_duel (lasts
    # milliseconds); clients only know waiting | live | finished.
    status = room.get("status", "waiting")
    if status == "finishing":
        status = "live"
    if status == "live":
        time_left = max(0.0, (_duel_deadline(room) - now).total_seconds())
    state: dict = {
        "code": room["code"],
        "status": status,
        "host_name": room.get("host_name", "Quantum Learner"),
        "guest_name": room.get("guest_name", ""),
        "is_host": is_host,
        "questions": [contests.public_question(q) for q in questions] if status in ("live", "finished") else [],
        "duration_sec": room.get("duration_sec", contests.DUEL_DURATION_SEC),
        "time_left_sec": round(time_left, 1),
        "my_answers": room.get(f"{side}_answers") or {},
        "my_submitted": bool(room.get(f"{side}_submitted")),
        "opponent_name": room.get(f"{other}_name", ""),
        "opponent_answered": len(room.get(f"{other}_answers") or {}),
        "opponent_submitted": bool(room.get(f"{other}_submitted")),
        "winner": room.get("winner", ""),
        "winner_name": "",
        "is_winner": None,
        "host_result": None,
        "guest_result": None,
        "results": [],
        "stats": None,
    }
    if room.get("status") == "finished":
        winner = room.get("winner", "")
        names = {"host": room.get("host_name", ""), "guest": room.get("guest_name", "")}
        state["winner_name"] = names.get(winner, "")
        state["is_winner"] = (winner == side) if winner in ("host", "guest") else None
        if winner == "tie":
            state["winner_name"] = "Tie"
        state["host_result"] = {
            "name": room.get("host_name", ""),
            "correct": int(room.get("host_correct", 0)),
            "wrong": int(room.get("host_wrong", 0)),
            "answered": len(room.get("host_answers") or {}),
            "elapsed_sec": round(float(room.get("host_elapsed", 0.0)), 1),
            "xp_earned": int(room.get("host_xp", 0)),
        }
        state["guest_result"] = {
            "name": room.get("guest_name", ""),
            "correct": int(room.get("guest_correct", 0)),
            "wrong": int(room.get("guest_wrong", 0)),
            "answered": len(room.get("guest_answers") or {}),
            "elapsed_sec": round(float(room.get("guest_elapsed", 0.0)), 1),
            "xp_earned": int(room.get("guest_xp", 0)),
        }
        _, _, state["results"] = contests.grade_sprint(questions, room.get(f"{side}_answers") or {})
        stats_collection = get_user_stats_collection()
        if stats_collection is not None:
            doc = stats_collection.find_one({"user_id": uid})
            if doc is not None:
                state["stats"] = _stats_response(doc, _my_rank(stats_collection, int(doc.get("total_xp", 0))))
    return state


@app.post("/api/duels/create", response_model=DuelCreateResponse)
def duel_create(request: Request):
    user = current_user(request)
    rooms = get_duel_rooms_collection()
    if rooms is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    code = _new_duel_code(rooms)
    questions = contests.pick_questions(n=contests.DUEL_QUESTIONS, seed=f"duel:{code}")
    rooms.insert_one(
        {
            "code": code,
            "status": "waiting",
            "host_id": user["sub"],
            "host_name": user.get("name", "Quantum Learner"),
            "guest_id": None,
            "guest_name": "",
            "question_ids": [q["id"] for q in questions],
            "duration_sec": contests.DUEL_DURATION_SEC,
            "started_at": None,
            "host_answers": {},
            "guest_answers": {},
            "host_submitted": False,
            "guest_submitted": False,
            "host_submitted_at": None,
            "guest_submitted_at": None,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"code": code}


@app.post("/api/duels/join", response_model=DuelState)
def duel_join(payload: DuelJoinRequest, request: Request):
    user = current_user(request)
    rooms = get_duel_rooms_collection()
    if rooms is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    code = payload.code.strip().upper()
    room = rooms.find_one({"code": code})
    if room is None or room.get("status") == "finished":
        raise HTTPException(404, "Duel room not found. Check the code and try again.")
    if room.get("host_id") == user["sub"]:
        return _duel_state(room, user)
    if room.get("status") != "waiting":
        raise HTTPException(400, "This duel already has two players.")
    rooms.update_one(
        {"code": code},
        {"$set": {
            "guest_id": user["sub"],
            "guest_name": user.get("name", "Quantum Learner"),
            "status": "live",
            "started_at": datetime.now(timezone.utc),
        }},
    )
    return _duel_state(rooms.find_one({"code": code}), user)


@app.get("/api/duels/{code}", response_model=DuelState)
def duel_state(code: str, request: Request):
    user = current_user(request)
    rooms = get_duel_rooms_collection()
    if rooms is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    room = rooms.find_one({"code": code.strip().upper()})
    if room is None:
        raise HTTPException(404, "Duel room not found.")
    room = _maybe_finish_duel(room)
    return _duel_state(room, user)


@app.post("/api/duels/{code}/answer", response_model=DuelState)
def duel_answer(code: str, payload: DuelAnswerRequest, request: Request):
    user = current_user(request)
    rooms = get_duel_rooms_collection()
    if rooms is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    room = rooms.find_one({"code": code.strip().upper()})
    if room is None:
        raise HTTPException(404, "Duel room not found.")
    room = _maybe_finish_duel(room)
    if room.get("status") != "live":
        raise HTTPException(400, "This duel is not live.")
    side = "host" if room.get("host_id") == user["sub"] else "guest" if room.get("guest_id") == user["sub"] else None
    if side is None:
        raise HTTPException(403, "You are not a player in this duel")
    if room.get(f"{side}_submitted"):
        raise HTTPException(400, "You already submitted — answers are locked.")
    if payload.question_id not in (room.get("question_ids") or []):
        raise HTTPException(400, "Unknown question for this duel.")
    rooms.update_one({"code": room["code"]}, {"$set": {f"{side}_answers.{payload.question_id}": payload.option}})
    room = _maybe_finish_duel(rooms.find_one({"code": room["code"]}))
    return _duel_state(room, user)


@app.post("/api/duels/{code}/submit", response_model=DuelState)
def duel_submit(code: str, request: Request):
    user = current_user(request)
    rooms = get_duel_rooms_collection()
    if rooms is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    room = rooms.find_one({"code": code.strip().upper()})
    if room is None:
        raise HTTPException(404, "Duel room not found.")
    side = "host" if room.get("host_id") == user["sub"] else "guest" if room.get("guest_id") == user["sub"] else None
    if side is None:
        raise HTTPException(403, "You are not a player in this duel")
    if room.get("status") == "live" and not room.get(f"{side}_submitted"):
        rooms.update_one(
            {"code": room["code"]},
            {"$set": {f"{side}_submitted": True, f"{side}_submitted_at": datetime.now(timezone.utc)}},
        )
    room = _maybe_finish_duel(rooms.find_one({"code": room["code"]}))
    return _duel_state(room, user)


@app.delete("/api/duels/{code}")
def duel_cancel(code: str, request: Request):
    user = current_user(request)
    rooms = get_duel_rooms_collection()
    if rooms is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    room = rooms.find_one({"code": code.strip().upper()})
    if room is None:
        raise HTTPException(404, "Duel room not found.")
    if room.get("host_id") != user["sub"]:
        raise HTTPException(403, "Only the host can cancel this duel.")
    if room.get("status") != "waiting":
        raise HTTPException(400, "Live duels cannot be cancelled — finish or let the timer expire.")
    rooms.delete_one({"code": room["code"]})
    return {"ok": True}


@app.get("/api/backends", response_model=list[BackendInfo])
def backend_list():
    return backends.backend_catalog()


@app.post("/api/circuits/validate", response_model=Circuit)
def validate(circuit: Circuit):
    try:
        return validate_circuit(circuit)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/circuits/diagnose", response_model=CircuitDiagnosis)
def diagnose(circuit: Circuit):
    """Non-throwing companion to /validate: returns every problem found in
    the circuit plus a suggested (and auto-applicable) fix for each."""
    return diagnose_circuit(circuit)


@app.post("/api/circuits/from-code", response_model=Circuit)
def circuit_from_code(request: CodeRequest):
    try:
        return circuit_from_qiskit(request.code)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/circuits/to-code")
def circuit_to_code(circuit: Circuit):
    try:
        return {"code": circuit_to_qiskit(circuit)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/circuits/to-qasm")
def circuit_to_qasm_endpoint(circuit: Circuit):
    try:
        return {"qasm": circuit_to_qasm(circuit)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/works", response_model=list[SavedWork])
def list_saved_works(request: Request):
    user = current_user(request)
    collection = get_saved_works_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    works = collection.find({"user_id": user["sub"]}).sort("updated_at", -1)
    return [
        {
            "id": str(work["_id"]),
            "title": work["title"],
            "description": work.get("description", ""),
            "code": work["code"],
            "created_at": work["created_at"].isoformat(),
            "updated_at": work["updated_at"].isoformat(),
        }
        for work in works
    ]


@app.post("/api/works", response_model=SavedWork)
def save_work(payload: SavedWorkRequest, request: Request):
    user = current_user(request)
    collection = get_saved_works_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        code = circuit_to_qiskit(circuit_from_qiskit(payload.code))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    now = datetime.now(timezone.utc)
    document = {"user_id": user["sub"], "title": payload.title.strip(), "description": payload.description.strip(), "code": code, "created_at": now, "updated_at": now}
    result = collection.insert_one(document)
    return {"id": str(result.inserted_id), "title": document["title"], "description": document["description"], "code": code, "created_at": now.isoformat(), "updated_at": now.isoformat()}


@app.patch("/api/works/{work_id}", response_model=SavedWork)
def rename_work(work_id: str, payload: dict, request: Request):
    from bson import ObjectId

    user = current_user(request)
    collection = get_saved_works_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        oid = ObjectId(work_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid work id") from exc
    update: dict = {"updated_at": datetime.now(timezone.utc)}
    if "title" in payload and isinstance(payload["title"], str) and payload["title"].strip():
        update["title"] = payload["title"].strip()[:120]
    if "description" in payload and isinstance(payload["description"], str):
        update["description"] = payload["description"].strip()[:500]
    if len(update) == 1:
        raise HTTPException(400, "Nothing to update")
    result = collection.find_one_and_update({"_id": oid, "user_id": user["sub"]}, {"$set": update}, return_document=True)
    if result is None:
        raise HTTPException(404, "Saved work not found")
    return {"id": str(result["_id"]), "title": result["title"], "description": result.get("description", ""), "code": result["code"], "created_at": result["created_at"].isoformat(), "updated_at": result["updated_at"].isoformat()}


@app.delete("/api/works/{work_id}")
def delete_work(work_id: str, request: Request):
    from bson import ObjectId

    user = current_user(request)
    collection = get_saved_works_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        oid = ObjectId(work_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid work id") from exc
    result = collection.delete_one({"_id": oid, "user_id": user["sub"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Saved work not found")
    return {"ok": True}


@app.post("/api/simulate", response_model=SimulationResult)
def simulate(request: SimulateRequest):
    circuit = Circuit(qubits=request.qubits, gates=request.gates)
    try:
        validate_circuit(circuit)
    except ValueError as exc:
        raise HTTPException(400, f"invalid circuit: {exc}") from exc
    try:
        return run_circuit(circuit, request.backend)
    except backends.BackendUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid circuit: {exc}") from exc


@app.get("/api/presets/bell", response_model=Circuit)
def preset_bell(variant: str = "phi_plus"):
    try:
        return create_bell_circuit(2, variant)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid bell preset: {exc}") from exc


@app.get("/api/presets/deutsch-jozsa", response_model=Circuit)
def preset_dj(n: int = 1, oracle: str = "balanced"):
    try:
        return create_dj_circuit(n, oracle)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid deutsch-jozsa preset: {exc}") from exc


@app.get("/api/presets/grover", response_model=Circuit)
def preset_grover(target: str = "11", iterations: int = 1):
    try:
        return create_grovers_circuit(2, target, iterations)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid grover preset: {exc}") from exc


@app.get("/api/presets/teleportation", response_model=Circuit)
def preset_teleportation(payload: str = "plus"):
    try:
        return create_teleportation_circuit(payload)
    except (KeyError, ValueError, IndexError) as exc:
        raise HTTPException(400, f"invalid teleportation preset: {exc}") from exc


@app.post("/api/assessment/submit", response_model=AssessmentResult)
def submit_assessment(payload: AssessmentSubmitRequest, request: Request):
    """Persist a learner's assessment attempt so instructors can see cumulative
    scores. Requires login; anonymous attempts are graded client-side only and
    are not tracked here."""
    user = current_user(request)
    collection = get_assessment_results_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    if payload.score > payload.total:
        raise HTTPException(400, "score cannot exceed total")
    now = datetime.now(timezone.utc)
    percentage = round((payload.score / payload.total) * 100, 2)
    document = {
        "user_id": user["sub"],
        "user_name": user.get("name", "Quantum Learner"),
        "user_email": user.get("email"),
        "score": payload.score,
        "total": payload.total,
        "percentage": percentage,
        "created_at": now,
    }
    result = collection.insert_one(document)
    return {
        "id": str(result.inserted_id),
        "score": payload.score,
        "total": payload.total,
        "percentage": percentage,
        "created_at": now.isoformat(),
    }


@app.get("/api/assessment/current", response_model=AdaptiveAssessment | None)
def adaptive_assessment_current(request: Request):
    user = current_user(request)
    collection = get_assessment_results_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    doc = collection.find_one({"user_id": user["sub"], "submitted": {"$ne": True}, "assessment_id": {"$exists": True}}, sort=[("created_at", -1)])
    if doc is None:
        return None
    return assessment_service.assessment_response(doc)


@app.post("/api/assessment/start", response_model=AdaptiveAssessment)
def adaptive_assessment_start(request: Request):
    user = current_user(request)
    collection = get_assessment_results_collection()
    mastery = get_learner_mastery_collection()
    if collection is None or mastery is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        return assessment_service.start_assessment(collection, mastery, user)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/assessment/{assessment_id}/submit", response_model=AdaptiveAssessment)
def adaptive_assessment_submit(assessment_id: str, payload: AssessmentSubmitAnswersRequest, request: Request):
    user = current_user(request)
    collection = get_assessment_results_collection()
    mastery = get_learner_mastery_collection()
    item_stats = get_item_stats_collection()
    if collection is None or mastery is None or item_stats is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        return assessment_service.submit_assessment(collection, mastery, item_stats, user, assessment_id, payload.answers)
    except KeyError as exc:
        raise HTTPException(404, "Assessment not found") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/assessment/history", response_model=AssessmentHistoryResponse)
def adaptive_assessment_history(request: Request):
    user = current_user(request)
    collection = get_assessment_results_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    docs = list(collection.find({"user_id": user["sub"], "assessment_id": {"$exists": True}, "submitted": True}).sort("created_at", -1).limit(25))
    return {"assessments": [assessment_service.assessment_response(doc, include_answers=True) for doc in docs]}


@app.get("/api/assessment/{assessment_id}", response_model=AdaptiveAssessment)
def adaptive_assessment_detail(assessment_id: str, request: Request):
    user = current_user(request)
    collection = get_assessment_results_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    doc = collection.find_one({"assessment_id": assessment_id, "user_id": user["sub"]})
    if doc is None:
        raise HTTPException(404, "Assessment not found")
    return assessment_service.assessment_response(doc, include_answers=True)


@app.get("/api/recommendations/current")
def current_recommendation(request: Request):
    user = current_user(request)
    collection = get_assessment_results_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    doc = collection.find_one({"user_id": user["sub"], "recommendation": {"$ne": None}}, sort=[("completed_at", -1)])
    return doc.get("recommendation") if doc else None


@app.post("/api/learning/quiz/submit", response_model=LearningQuizSubmitResponse)
def learning_quiz_submit(payload: LearningQuizSubmitRequest, request: Request):
    user = current_user(request)
    mastery = get_learner_mastery_collection()
    item_stats = get_item_stats_collection()
    if mastery is None or item_stats is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    before, after, results = assessment_service.apply_responses(mastery, item_stats, user, payload.answers)
    return {
        "updated": len(results),
        "bkt_before": before,
        "bkt_after": after.get("concepts", {}),
        "irt_ability_after": float(after.get("ability", 0.0)),
    }


def _assessment_doc_to_summary(doc: dict, attempts: int, average_percentage: float) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc["title"],
        "description": doc.get("description", ""),
        "question_count": len(doc.get("questions", [])),
        "published": bool(doc.get("published", False)),
        "created_at": doc["created_at"].isoformat(),
        "updated_at": doc["updated_at"].isoformat(),
        "attempts": attempts,
        "average_percentage": average_percentage,
    }


def _submission_stats_by_assessment(submissions_collection) -> dict[str, dict]:
    """{assessment_id: {"attempts": n, "average_percentage": x}} from every submission."""
    pipeline = [
        {"$group": {"_id": "$assessment_id", "attempts": {"$sum": 1}, "avg": {"$avg": "$percentage"}}},
    ]
    out: dict[str, dict] = {}
    for row in submissions_collection.aggregate(pipeline):
        out[row["_id"]] = {"attempts": row["attempts"], "average_percentage": round(row["avg"], 2)}
    return out


@app.post("/api/instructor/assessments", response_model=AssessmentSummary)
def create_assessment(payload: AssessmentCreateRequest, request: Request):
    user = require_instructor(request)
    collection = get_assessments_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    now = datetime.now(timezone.utc)
    questions = [
        {
            "id": assessments_logic.new_question_id(),
            "question": q.question.strip(),
            "options": [o.strip() for o in q.options],
            "answer": q.answer,
            "tag": q.tag.strip() or "General",
            "explanation": q.explanation.strip(),
        }
        for q in payload.questions
    ]
    for q in questions:
        if q["answer"] >= len(q["options"]):
            raise HTTPException(400, f'"{q["question"][:50]}" has an answer index out of range for its options')
    document = {
        "title": payload.title.strip(),
        "description": payload.description.strip(),
        "questions": questions,
        "published": payload.published,
        "created_by": user["sub"],
        "created_by_name": user.get("name", "Instructor"),
        "created_at": now,
        "updated_at": now,
    }
    result = collection.insert_one(document)
    document["_id"] = result.inserted_id
    return _assessment_doc_to_summary(document, 0, 0.0)


@app.get("/api/instructor/assessments", response_model=list[AssessmentSummary])
def list_instructor_assessments(request: Request):
    require_instructor(request)
    collection = get_assessments_collection()
    submissions = get_assessment_submissions_collection()
    if collection is None or submissions is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    stats_by_id = _submission_stats_by_assessment(submissions)
    docs = list(collection.find({}).sort("created_at", -1))
    return [
        _assessment_doc_to_summary(
            doc,
            stats_by_id.get(str(doc["_id"]), {}).get("attempts", 0),
            stats_by_id.get(str(doc["_id"]), {}).get("average_percentage", 0.0),
        )
        for doc in docs
    ]


@app.get("/api/instructor/assessments/{assessment_id}", response_model=AssessmentInstructorDetail)
def get_instructor_assessment(assessment_id: str, request: Request):
    from bson import ObjectId

    require_instructor(request)
    collection = get_assessments_collection()
    submissions = get_assessment_submissions_collection()
    if collection is None or submissions is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        doc = collection.find_one({"_id": ObjectId(assessment_id)})
    except Exception as exc:
        raise HTTPException(400, "Invalid assessment id") from exc
    if doc is None:
        raise HTTPException(404, "Assessment not found")
    stats = _submission_stats_by_assessment(submissions).get(assessment_id, {"attempts": 0, "average_percentage": 0.0})
    summary = _assessment_doc_to_summary(doc, stats["attempts"], stats["average_percentage"])
    return {**summary, "questions": doc.get("questions", [])}


@app.patch("/api/instructor/assessments/{assessment_id}", response_model=AssessmentSummary)
def update_assessment(assessment_id: str, payload: AssessmentUpdateRequest, request: Request):
    from bson import ObjectId

    require_instructor(request)
    collection = get_assessments_collection()
    submissions = get_assessment_submissions_collection()
    if collection is None or submissions is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        oid = ObjectId(assessment_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid assessment id") from exc

    update: dict = {"updated_at": datetime.now(timezone.utc)}
    if payload.title is not None:
        update["title"] = payload.title.strip()
    if payload.description is not None:
        update["description"] = payload.description.strip()
    if payload.published is not None:
        update["published"] = payload.published
    if payload.questions is not None:
        update["questions"] = [
            {
                "id": assessments_logic.new_question_id(),
                "question": q.question.strip(),
                "options": [o.strip() for o in q.options],
                "answer": q.answer,
                "tag": q.tag.strip() or "General",
                "explanation": q.explanation.strip(),
            }
            for q in payload.questions
        ]
        for q in update["questions"]:
            if q["answer"] >= len(q["options"]):
                raise HTTPException(400, f'"{q["question"][:50]}" has an answer index out of range for its options')

    doc = collection.find_one_and_update({"_id": oid}, {"$set": update}, return_document=True)
    if doc is None:
        raise HTTPException(404, "Assessment not found")
    stats = _submission_stats_by_assessment(submissions).get(assessment_id, {"attempts": 0, "average_percentage": 0.0})
    return _assessment_doc_to_summary(doc, stats["attempts"], stats["average_percentage"])


@app.delete("/api/instructor/assessments/{assessment_id}")
def delete_assessment(assessment_id: str, request: Request):
    from bson import ObjectId

    require_instructor(request)
    collection = get_assessments_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        oid = ObjectId(assessment_id)
    except Exception as exc:
        raise HTTPException(400, "Invalid assessment id") from exc
    result = collection.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Assessment not found")
    return {"ok": True}


@app.post("/api/instructor/assessments/parse-pdf", response_model=ParsedQuestions)
async def parse_assessment_pdf(request: Request):
    require_instructor(request)
    if not PDF_SUPPORT:
        raise HTTPException(501, "PDF parsing is unavailable — install pypdf on the backend")
    form = await request.form()
    upload = form.get("file")
    if upload is None or not isinstance(upload, UploadFile):
        raise HTTPException(400, "Upload a PDF file as multipart form field 'file'")
    raw = await upload.read()
    try:
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise HTTPException(400, f"Could not read PDF: {exc}") from exc
    questions, warnings = assessments_logic.parse_questions_from_text(text)
    return {"questions": questions, "warnings": warnings}


@app.get("/api/assessments", response_model=list[AssessmentSummary])
def list_student_assessments():
    """Published assessments any learner can see and take. No answer keys."""
    collection = get_assessments_collection()
    submissions = get_assessment_submissions_collection()
    if collection is None or submissions is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    stats_by_id = _submission_stats_by_assessment(submissions)
    docs = list(collection.find({"published": True}).sort("created_at", -1))
    return [
        _assessment_doc_to_summary(
            doc,
            stats_by_id.get(str(doc["_id"]), {}).get("attempts", 0),
            stats_by_id.get(str(doc["_id"]), {}).get("average_percentage", 0.0),
        )
        for doc in docs
    ]


@app.get("/api/assessments/{assessment_id}", response_model=AssessmentStudentDetail)
def get_student_assessment(assessment_id: str):
    from bson import ObjectId

    collection = get_assessments_collection()
    if collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        doc = collection.find_one({"_id": ObjectId(assessment_id), "published": True})
    except Exception as exc:
        raise HTTPException(400, "Invalid assessment id") from exc
    if doc is None:
        raise HTTPException(404, "Assessment not found")
    return {
        "id": str(doc["_id"]),
        "title": doc["title"],
        "description": doc.get("description", ""),
        "questions": [
            {"id": q["id"], "question": q["question"], "options": q["options"], "tag": q.get("tag", "General")}
            for q in doc.get("questions", [])
        ],
    }


@app.post("/api/assessments/{assessment_id}/submit", response_model=AssessmentAttemptResult)
def submit_student_assessment(assessment_id: str, payload: AssessmentAnswerSubmit, request: Request):
    from bson import ObjectId

    collection = get_assessments_collection()
    submissions = get_assessment_submissions_collection()
    if collection is None or submissions is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")
    try:
        doc = collection.find_one({"_id": ObjectId(assessment_id), "published": True})
    except Exception as exc:
        raise HTTPException(400, "Invalid assessment id") from exc
    if doc is None:
        raise HTTPException(404, "Assessment not found")

    correct, total, results = assessments_logic.grade_assessment(doc.get("questions", []), payload.answers)
    percentage = round((correct / total) * 100, 2) if total else 0.0

    # Anonymous visitors can still take and get graded; only logged-in
    # learners have the attempt persisted for the instructor dashboard.
    user = optional_user(request)
    now = datetime.now(timezone.utc)
    saved = False
    submission_id = ""
    if user is not None:
        submission = {
            "assessment_id": assessment_id,
            "assessment_title": doc["title"],
            "user_id": user["sub"],
            "user_name": user.get("name", "Quantum Learner"),
            "user_email": user.get("email"),
            "score": correct,
            "total": total,
            "percentage": percentage,
            "created_at": now,
        }
        submission_id = str(submissions.insert_one(submission).inserted_id)
        saved = True

    return {
        "id": submission_id,
        "assessment_id": assessment_id,
        "assessment_title": doc["title"],
        "score": correct,
        "total": total,
        "percentage": percentage,
        "saved": saved,
        "created_at": now.isoformat(),
        "results": results,
    }


@app.get("/api/instructor/dashboard", response_model=InstructorDashboard)
def instructor_dashboard(request: Request, active_window_days: int = 7):
    """Live instructor overview. Every figure is computed on read — nothing
    here is cached or hardcoded, so it reflects real signups, assessment
    attempts and contest/XP activity as they happen."""
    require_instructor(request)

    users = get_users_collection()
    legacy_results = get_assessment_results_collection()
    submissions = get_assessment_submissions_collection()
    assessments_collection = get_assessments_collection()
    stats_collection = get_user_stats_collection()
    if users is None or legacy_results is None or submissions is None or assessments_collection is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")

    total_signups = users.count_documents({})
    cutoff = datetime.now(timezone.utc) - timedelta(days=active_window_days)
    active_learners = users.count_documents({"last_active": {"$gte": cutoff}})

    # Combine the legacy fixed-quiz results with the new per-assessment
    # submissions so historical data isn't lost while new instructor-authored
    # content flows straight into the same overall figures.
    attempts: list[dict] = list(legacy_results.find({})) + list(submissions.find({}))
    total_attempts = len(attempts)
    average_score = round(sum(a["percentage"] for a in attempts) / total_attempts, 2) if total_attempts else 0.0

    by_user: dict[str, dict] = {}
    for attempt in attempts:
        bucket = by_user.setdefault(
            attempt["user_id"],
            {"name": attempt.get("user_name", "Quantum Learner"), "email": attempt.get("user_email"), "scores": []},
        )
        bucket["scores"].append(attempt["percentage"])

    top_performers = [
        TopPerformer(
            name=bucket["name"],
            email=bucket["email"],
            attempts=len(bucket["scores"]),
            average_percentage=round(sum(bucket["scores"]) / len(bucket["scores"]), 2),
            best_percentage=round(max(bucket["scores"]), 2),
        )
        for bucket in by_user.values()
    ]
    top_performers.sort(key=lambda p: (p.average_percentage, p.attempts), reverse=True)

    # Score distribution across 20-point buckets, for a histogram.
    buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for attempt in attempts:
        pct = attempt["percentage"]
        if pct <= 20:
            buckets["0-20"] += 1
        elif pct <= 40:
            buckets["21-40"] += 1
        elif pct <= 60:
            buckets["41-60"] += 1
        elif pct <= 80:
            buckets["61-80"] += 1
        else:
            buckets["81-100"] += 1

    # Per-assessment breakdown, real instructor content only.
    stats_by_id = _submission_stats_by_assessment(submissions)
    assessment_breakdown = [
        AssessmentBreakdown(
            id=str(doc["_id"]),
            title=doc["title"],
            published=bool(doc.get("published", False)),
            attempts=stats_by_id.get(str(doc["_id"]), {}).get("attempts", 0),
            average_percentage=stats_by_id.get(str(doc["_id"]), {}).get("average_percentage", 0.0),
        )
        for doc in assessments_collection.find({}).sort("created_at", -1)
    ]

    # Sign-up trend, last 14 days.
    trend_days = 14
    counts: dict[str, int] = {}
    today = datetime.now(timezone.utc).date()
    for offset in range(trend_days - 1, -1, -1):
        day = today - timedelta(days=offset)
        counts[day.isoformat()] = 0
    trend_cutoff = datetime.now(timezone.utc) - timedelta(days=trend_days)
    for doc in users.find({"created_at": {"$gte": trend_cutoff}}, {"created_at": 1}):
        day = _as_aware(doc["created_at"]).date().isoformat()
        if day in counts:
            counts[day] += 1
    signup_trend = [DailyCount(date=day, count=count) for day, count in counts.items()]

    # Real contest/XP leaderboard, when the gamification system has data.
    xp_leaderboard: list[LeaderboardEntry] = []
    if stats_collection is not None:
        docs = list(stats_collection.find().sort("total_xp", -1).limit(5))
        xp_leaderboard = [
            LeaderboardEntry(
                rank=index,
                user_id=doc.get("user_id", ""),
                name=doc.get("name", "Quantum Learner"),
                total_xp=int(doc.get("total_xp", 0)),
                level=gamification.level_for_xp(int(doc.get("total_xp", 0))),
                streak_count=int(doc.get("streak_count", 0)),
            )
            for index, doc in enumerate(docs, start=1)
        ]

    return InstructorDashboard(
        generated_at=datetime.now(timezone.utc).isoformat(),
        total_signups=total_signups,
        active_learners=active_learners,
        active_window_days=active_window_days,
        total_assessment_attempts=total_attempts,
        average_assessment_score=average_score,
        top_performers=top_performers[:10],
        assessment_breakdown=assessment_breakdown,
        signup_trend=signup_trend,
        score_distribution=buckets,
        xp_leaderboard=xp_leaderboard,
        note=None if assessment_breakdown else "No instructor-authored assessments yet — create one to see per-assessment stats.",
    )


@app.post("/api/tutor/chat", response_model=ChatResponse)
def tutor_chat(request: ChatRequest):
    """Circuit-specific answers are grounded in Qiskit before an LLM sees them."""
    # Lightweight per-process protection. Replace with Redis for multi-instance production.
    client = request.conversation_id or "anonymous"
    now = time.monotonic()
    recent = [stamp for stamp in _chat_limits.get(client, []) if now - stamp < 60]
    if len(recent) >= 20:
        raise HTTPException(429, "Tutor request limit reached. Please retry in a minute.")
    recent.append(now)
    _chat_limits[client] = recent
    try:
        return tutor_answer(request)
    except (KeyError, ValueError, IndexError) as exc:
        logger.warning("Invalid tutor request: %s", exc)
        raise HTTPException(400, f"invalid tutor request: {exc}") from exc
    except Exception as exc:
        logger.exception("Tutor request failed")
        raise HTTPException(502, "Tutor is temporarily unavailable") from exc
