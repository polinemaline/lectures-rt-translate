# app/api_auth.py

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User

pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto",
)
router = APIRouter(tags=["auth"])


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


# ---------- Вспом. функции ----------


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


# ---------- Эндпоинты ----------


@router.post("/register", status_code=201)
async def register_user(
    payload: RegisterRequest, session: AsyncSession = Depends(get_session)
):
    # 1. пароли совпадают?
    if payload.password != payload.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароли не совпадают",
        )

    # 2. проверяем, нет ли уже такого email
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
    payload: LoginRequest, session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(User).where(User.email == payload.email))
    user: User | None = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        # специально одинаковое сообщение — чтобы нельзя было
        # угадать, зарегистрирован email или нет
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный e-mail или пароль",
        )

    # пока вернём фейковый токен
    token = f"mock-token-{user.id}"

    return LoginResponse(user=user, token=token)
