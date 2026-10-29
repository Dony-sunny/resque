import hashlib
import secrets
import time
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .models import AuthSession, User

bearer = HTTPBearer(auto_error=False)
DEMO_NAMES = {"citizen": "Anu · Citizen", "volunteer": "Maya · Volunteer", "coordinator": "Arun · Coordinator", "responder": "Nila · Rescue Team Alpha", "relief": "Riya · Food & Relief"}


def public_user(user):
    return {"id": user.id, "name": user.name, "role": user.role}


def ensure_demo_users(db):
    for role, name in DEMO_NAMES.items():
        if db.get(User, f"demo-{role}") is None:
            db.add(User(id=f"demo-{role}", name=name, role=role, active=True))
    db.flush()


def issue_token(db, user):
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires_at=int(time.time()) + 86400))
    db.flush()
    return token


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "A bearer session is required", headers={"WWW-Authenticate": "Bearer"})
    token_hash = hashlib.sha256(credentials.credentials.encode()).hexdigest()
    with Session(request.app.state.engine) as db:
        session = db.get(AuthSession, token_hash)
        if session is None or session.expires_at <= int(time.time()):
            raise HTTPException(401, "Session expired or invalid", headers={"WWW-Authenticate": "Bearer"})
        user = db.get(User, session.user_id)
        if user is None or not user.active:
            raise HTTPException(401, "User is inactive")
        # Detached immutable identity used by event transactions; no client role is trusted.
        return public_user(user)
