import base64
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models import User

PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 260_000


class AuthError(ValueError):
    """Raised when authentication or token validation fails."""


@dataclass(frozen=True)
class AuthToken:
    access_token: str
    token_type: str
    expires_at: datetime
    user: User


def hash_password(password: str, *, salt: str | None = None) -> str:
    if not password:
        raise ValueError("Password is required.")
    resolved_salt = salt or secrets.token_urlsafe(24)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        resolved_salt.encode("utf-8"),
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"{PASSWORD_HASH_ALGORITHM}${PASSWORD_HASH_ITERATIONS}$"
        f"{resolved_salt}${base64.urlsafe_b64encode(digest).decode('ascii')}"
    )


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password or not password_hash:
        return False
    try:
        algorithm, iterations_text, salt, expected_digest = password_hash.split("$", maxsplit=3)
        iterations = int(iterations_text)
    except ValueError:
        return False
    if algorithm != PASSWORD_HASH_ALGORITHM:
        return False

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    actual_digest = base64.urlsafe_b64encode(digest).decode("ascii")
    return hmac.compare_digest(actual_digest, expected_digest)


class AuthService:
    def __init__(self, session: Session, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()

    def authenticate(self, *, email: str, password: str) -> AuthToken:
        user = self._active_user_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise AuthError("Invalid email or password.")

        user.last_login_at = datetime.now(UTC)
        self.session.flush()
        return self.create_access_token(user)

    def create_access_token(self, user: User) -> AuthToken:
        expires_at = datetime.now(UTC) + timedelta(minutes=self.settings.auth_access_token_minutes)
        payload = {
            "sub": str(user.id),
            "exp": int(expires_at.timestamp()),
        }
        encoded_payload = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode())
        signature = _sign(encoded_payload, self.settings.auth_token_secret)
        return AuthToken(
            access_token=f"{encoded_payload}.{signature}",
            token_type="bearer",
            expires_at=expires_at,
            user=user,
        )

    def get_user_from_token(self, token: str) -> User:
        try:
            encoded_payload, signature = token.split(".", maxsplit=1)
        except ValueError as exc:
            raise AuthError("Invalid bearer token.") from exc

        expected_signature = _sign(encoded_payload, self.settings.auth_token_secret)
        if not hmac.compare_digest(signature, expected_signature):
            raise AuthError("Invalid bearer token.")

        try:
            payload = json.loads(_base64url_decode(encoded_payload))
            user_id = UUID(str(payload["sub"]))
            expires_at = int(payload["exp"])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise AuthError("Invalid bearer token.") from exc

        if expires_at <= int(datetime.now(UTC).timestamp()):
            raise AuthError("Bearer token has expired.")

        user = self.session.get(User, user_id)
        if user is None or not _user_is_active(user):
            raise AuthError("Bearer token user is not active.")
        return user

    def _active_user_by_email(self, email: str) -> User | None:
        normalized_email = email.strip().lower()
        if not normalized_email:
            return None
        user = self.session.scalars(
            select(User).where(func.lower(User.email) == normalized_email)
        ).one_or_none()
        if not _user_is_active(user):
            return None
        return user


def _user_is_active(user: User | None) -> bool:
    return user is not None and user.archived_at is None and user.status == "active"


def _sign(encoded_payload: str, secret: str) -> str:
    digest = hmac.new(
        secret.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _base64url_encode(digest)


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
