import os
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

_client = None
_db = None
_users = None


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

    user = {
        "google_id": info["sub"],
        "email": info.get("email"),
        "name": info.get("name", "Quantum Learner"),
        "picture": info.get("picture"),
        "updated_at": datetime.now(timezone.utc),
    }
    users.update_one(
        {"google_id": user["google_id"]},
        {"$set": user, "$setOnInsert": {"created_at": user["updated_at"]}},
        upsert=True,
    )

    token = jwt.encode(
        {
            "sub": user["google_id"],
            "email": user["email"],
            "name": user["name"],
            "exp": datetime.now(timezone.utc) + timedelta(days=7),
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"token": token, "user": user}


def current_user(request: Request) -> dict:
    if not JWT_SECRET:
        raise HTTPException(500, "JWT_SECRET is not configured")
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    try:
        return jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Invalid or expired session") from exc
