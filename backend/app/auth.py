import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

import dns.resolver
import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pymongo import MongoClient

from . import dns_fix  # noqa: F401


load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "corkscrew")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET = os.getenv("JWT_SECRET")

VALID_ROLES = ("student", "instructor")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Instructor accounts are never self-signed-up — there is exactly one,
# seeded on startup so it always works out of the box.
INSTRUCTOR_EMAIL = "quantumlab@gmail.com"
INSTRUCTOR_DEFAULT_PASSWORD = "Quantumlab"

_client = None
_db = None
_users = None
_saved_works = None
_user_stats = None
_xp_events = None
_assessment_results = None
_learner_mastery = None
_item_stats = None
_assessments = None
_assessment_submissions = None


# --- Password hashing (dependency-free PBKDF2-HMAC-SHA256) -----------------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000)
    return f"pbkdf2_sha256$200000${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, AttributeError):
        return False


def get_db():
    global _client, _db
    if _db is not None:
        return _db
    if not MONGODB_URI:
        return None
    try:
        _client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        _db = _client[MONGODB_DATABASE]
        return _db
    except Exception as exc:
        print(f"[auth] MongoDB connection warning: {exc}")
        return None


def get_users_collection():
    global _users
    if _users is not None:
        return _users
    db = get_db()
    if db is not None:
        _users = db["users"]
        return _users
    return None


def get_saved_works_collection():
    global _saved_works
    if _saved_works is not None:
        return _saved_works
    db = get_db()
    if db is not None:
        _saved_works = db["saved_works"]
        return _saved_works
    return None


def get_user_stats_collection():
    global _user_stats
    if _user_stats is not None:
        return _user_stats
    db = get_db()
    if db is not None:
        _user_stats = db["user_stats"]
        return _user_stats
    return None


def get_xp_events_collection():
    global _xp_events
    if _xp_events is not None:
        return _xp_events
    db = get_db()
    if db is not None:
        _xp_events = db["xp_events"]
        return _xp_events
    return None


def get_contest_attempts_collection():
    db = get_db()
    if db is not None:
        return db["contest_attempts"]
    return None


_sprint_solves = None


def get_sprint_solves_collection():
    """First-solve records: one doc per {user_id, question_id} ever answered correctly."""
    global _sprint_solves
    if _sprint_solves is not None:
        return _sprint_solves
    db = get_db()
    if db is not None:
        _sprint_solves = db["sprint_solves"]
        return _sprint_solves
    return None


_challenge_solves = None


def get_challenge_solves_collection():
    """First-pass records: one doc per {user_id, task_id} ever solved."""
    global _challenge_solves
    if _challenge_solves is not None:
        return _challenge_solves
    db = get_db()
    if db is not None:
        _challenge_solves = db["challenge_solves"]
        return _challenge_solves
    return None


def get_duel_rooms_collection():
    db = get_db()
    if db is not None:
        return db["duel_rooms"]
    return None


def get_assessment_results_collection():
    global _assessment_results
    if _assessment_results is not None:
        return _assessment_results
    db = get_db()
    if db is not None:
        _assessment_results = db["assessment_results"]
        return _assessment_results
    return None


def get_learner_mastery_collection():
    global _learner_mastery
    if _learner_mastery is not None:
        return _learner_mastery
    db = get_db()
    if db is not None:
        _learner_mastery = db["learner_mastery"]
        return _learner_mastery
    return None


def get_item_stats_collection():
    global _item_stats
    if _item_stats is not None:
        return _item_stats
    db = get_db()
    if db is not None:
        _item_stats = db["assessment_item_stats"]
        return _item_stats
def get_assessments_collection():
    global _assessments
    if _assessments is not None:
        return _assessments
    db = get_db()
    if db is not None:
        _assessments = db["assessments"]
        return _assessments
    return None


def get_assessment_submissions_collection():
    global _assessment_submissions
    if _assessment_submissions is not None:
        return _assessment_submissions
    db = get_db()
    if db is not None:
        _assessment_submissions = db["assessment_submissions"]
        return _assessment_submissions
    return None


def _public_user(user: dict) -> dict:
    """Strip internal/secret fields before sending a user doc to the client."""
    return {
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role", "student"),
        "picture": user.get("picture"),
    }


def _issue_token(user_id: str, email: str | None, name: str, role: str) -> str:
    if not JWT_SECRET:
        raise HTTPException(500, "JWT_SECRET is not configured")
    return jwt.encode(
        {
            "sub": user_id,
            "email": email,
            "name": name,
            "role": role,
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def touch_last_active(user_id: str) -> None:
    """Best-effort activity ping used to approximate 'active learners'."""
    users = get_users_collection()
    if users is None:
        return
    try:
        users.update_one({"google_id": user_id}, {"$set": {"last_active": datetime.now(timezone.utc)}})
    except Exception:
        pass


def ensure_instructor_account() -> None:
    """Idempotently seed the single instructor account so instructor login
    works out of the box, with no signup flow of its own. Safe to call on
    every startup — a no-op once the account exists."""
    users = get_users_collection()
    if users is None:
        return
    try:
        if users.find_one({"email": INSTRUCTOR_EMAIL}):
            return
        now = datetime.now(timezone.utc)
        users.insert_one(
            {
                "google_id": "local:instructor-seed",
                "email": INSTRUCTOR_EMAIL,
                "name": "QuantumLab Instructor",
                "role": "instructor",
                "auth_provider": "password",
                "password_hash": hash_password(INSTRUCTOR_DEFAULT_PASSWORD),
                "picture": None,
                "created_at": now,
                "updated_at": now,
                "last_active": now,
            }
        )
    except Exception as exc:
        print(f"[auth] Could not seed instructor account: {exc}")


def google_login(credential: str) -> dict:
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "GOOGLE_CLIENT_ID is not configured")
    if not JWT_SECRET:
        raise HTTPException(500, "JWT_SECRET is not configured")

    users = get_users_collection()
    if users is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")

    try:
        info = id_token.verify_oauth2_token(
            credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError as exc:
        raise HTTPException(401, "Invalid Google credential") from exc

    now = datetime.now(timezone.utc)
    user = {
        "google_id": info["sub"],
        "email": info.get("email"),
        "name": info.get("name", "Quantum Learner"),
        "picture": info.get("picture"),
        "auth_provider": "google",
        "updated_at": now,
        "last_active": now,
    }
    users.update_one(
        {"google_id": user["google_id"]},
        {
            # Google sign-up always creates a student account — instructor
            # accounts are never self-provisioned. $setOnInsert only applies
            # the first time, so an existing account's role is untouched.
            "$set": user,
            "$setOnInsert": {"created_at": now, "role": "student"},
        },
        upsert=True,
    )
    stored = users.find_one({"google_id": user["google_id"]}) or user

    token = _issue_token(stored["google_id"], stored.get("email"), stored.get("name", "Quantum Learner"), stored.get("role", "student"))
    return {"token": token, "user": _public_user(stored)}


def signup(name: str, email: str, password: str) -> dict:
    """Self-serve signup always creates a student account. There is no
    instructor signup — the one instructor account is seeded separately."""
    if not JWT_SECRET:
        raise HTTPException(500, "JWT_SECRET is not configured")
    users = get_users_collection()
    if users is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")

    name = (name or "").strip()
    email = (email or "").strip().lower()
    if not name:
        raise HTTPException(400, "Name is required")
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "A valid email is required")
    if not password or len(password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    if users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists")

    now = datetime.now(timezone.utc)
    user_id = f"local:{secrets.token_hex(12)}"
    document = {
        "google_id": user_id,
        "email": email,
        "name": name,
        "role": "student",
        "auth_provider": "password",
        "password_hash": hash_password(password),
        "picture": None,
        "created_at": now,
        "updated_at": now,
        "last_active": now,
    }
    users.insert_one(document)
    token = _issue_token(user_id, email, name, "student")
    return {"token": token, "user": _public_user(document)}


def login(email: str, password: str) -> dict:
    if not JWT_SECRET:
        raise HTTPException(500, "JWT_SECRET is not configured")
    users = get_users_collection()
    if users is None:
        raise HTTPException(500, "Database connection is unavailable or MONGODB_URI is not configured")

    email = (email or "").strip().lower()
    user = users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    users.update_one({"google_id": user["google_id"]}, {"$set": {"last_active": datetime.now(timezone.utc)}})
    token = _issue_token(user["google_id"], user.get("email"), user.get("name", "Quantum Learner"), user.get("role", "student"))
    return {"token": token, "user": _public_user(user)}


def current_user(request: Request) -> dict:
    if not JWT_SECRET:
        raise HTTPException(500, "JWT_SECRET is not configured")
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Invalid or expired session") from exc
    payload.setdefault("role", "student")
    touch_last_active(payload["sub"])
    return payload


def optional_user(request: Request) -> dict | None:
    """Same as current_user but returns None instead of raising when there is
    no (or an invalid) session — used by endpoints anonymous visitors may
    still use, e.g. taking a public assessment without saving a score."""
    authorization = request.headers.get("Authorization", "")
    if not JWT_SECRET or not authorization.startswith("Bearer "):
        return None
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    payload.setdefault("role", "student")
    touch_last_active(payload["sub"])
    return payload


def require_instructor(request: Request) -> dict:
    user = current_user(request)
    if user.get("role") != "instructor":
        raise HTTPException(403, "Instructor access required")
    return user
