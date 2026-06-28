from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas.auth import CurrentUserRead, LoginRequest, LoginResponse, LogoutResponse
from app.services.auth import AuthError, AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> LoginResponse:
    try:
        token = AuthService(session).authenticate(
            email=payload.email,
            password=payload.password,
        )
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return LoginResponse(
        access_token=token.access_token,
        token_type=token.token_type,
        expires_at=token.expires_at,
        user=_current_user_to_read(token.user),
    )


@router.get("/me", response_model=CurrentUserRead)
def read_current_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> CurrentUserRead:
    return _current_user_to_read(current_user)


@router.post("/logout", response_model=LogoutResponse)
def logout(
    current_user: Annotated[User, Depends(get_current_user)],
) -> LogoutResponse:
    _ = current_user
    return LogoutResponse(status="ok")


def _current_user_to_read(user: User) -> CurrentUserRead:
    return CurrentUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        is_superuser=user.is_superuser,
    )
