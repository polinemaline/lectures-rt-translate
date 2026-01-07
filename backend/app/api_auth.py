# app/api_auth.py

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User

router = APIRouter(tags=["auth"])  # <--- БЕЗ prefix="/auth"!


# ---------- Pydantic-схемы ----------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    password_confirm: str
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    user: UserOut
    token: str  # пока фейковый


# ---------- "Хеширование" пароля (наш простой вариант) ----------


def hash_password(password: str) -> str:
    # простой вариант, без bcrypt
    import hashlib

    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    import hmac

    calc = hash_password(password)
    return hmac.compare_digest(calc, password_hash)


# ---------- Эндпоинты ----------


@router.post("/register", status_code=201)
async def register_user(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    # 1. пароли совпадают?
    if payload.password != payload.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароли не совпадают",
        )

    # 2. проверяем уникальность email
    result = await session.execute(select(User).where(User.email == payload.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким e-mail уже зарегистрирован",
        )

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return {"message": "registered"}


@router.post("/login", response_model=LoginResponse)
async def login_user(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(User).where(User.email == payload.email))
    user: User | None = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный e-mail или пароль",
        )

    token = f"mock-token-{user.id}"

    return LoginResponse(user=user, token=token)


# app/api_auth.py
from fastapi import Header
from sqlalchemy import select


async def get_current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    """
    Ждём заголовок:
      Authorization: Bearer mock-token-<user_id>
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    token = parts[1]
    prefix = "mock-token-"
    if not token.startswith(prefix):
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user_id = int(token[len(prefix) :])
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token user id")

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user
