# app/database.py

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Base  # важно: импортируем Base с моделями

DATABASE_URL = settings.DATABASE_URL
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # можно True, если хочешь видеть SQL в логах
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


# 👉 вот ЭТО главное: функция, которая создаёт таблицы по моделям
async def init_db() -> None:
    async with engine.begin() as conn:
        # эта команда создаст ВСЕ таблицы, описанные в Base.metadata,
        # если их ещё нет. Если есть — просто пропустит.
        await conn.run_sync(Base.metadata.create_all)
