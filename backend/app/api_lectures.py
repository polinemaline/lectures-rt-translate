# app/api_lectures.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Lecture

router = APIRouter(tags=["lectures"])


# --------- Pydantic-схемы ---------


class LectureCreate(BaseModel):
    title: str
    language: str


class LectureOut(BaseModel):
    id: int
    title: str
    language: str

    class Config:
        from_attributes = True  # Pydantic v2


# --------- Эндпоинты ---------


@router.post("/lectures", response_model=LectureOut)
async def create_lecture(
    payload: LectureCreate,
    session: AsyncSession = Depends(get_session),
):
    lecture = Lecture(title=payload.title, language=payload.language)
    session.add(lecture)
    await session.commit()
    await session.refresh(lecture)
    return lecture


@router.get("/lectures", response_model=list[LectureOut])
async def list_lectures(
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Lecture).order_by(Lecture.id.desc()))
    return result.scalars().all()
