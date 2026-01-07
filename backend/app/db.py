# app/db.py
import os

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

# --- ASYNC (для FastAPI эндпоинтов) ---
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


# --- SYNC (для uploads_worker, чтобы не ловить loop/asyncpg ошибки) ---
SYNC_DATABASE_URL = DATABASE_URL.replace("+asyncpg", "")
sync_engine = create_engine(SYNC_DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False)
