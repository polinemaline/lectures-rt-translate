# app/api_auth.py

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from passlib.exc import UnknownHashError  # у тебя уже должен быть этот импорт
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User

router = APIRouter(tags=["auth"])


pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto",
)


# ---------- Pydantic-схемы ----------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    password_confirm: str
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------- Вспомогательные функции ----------


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except UnknownHashError:
        # если хэш неизвестного формата — считаем, что пароль неверный
        return False


# ---------- Эндпоинты ----------


@router.post("/register", status_code=201)
async def register_user(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    if payload.password != payload.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароли не совпадают",
        )

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


@router.post("/login")
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

    # Возвращаем простой словарь, без Pydantic-модели
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
        },
        "token": token,
    }
