# app/api_conferences.py

from __future__ import annotations

import uuid
from typing import Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/conferences", tags=["conferences"])

# ---------- Pydantic-схемы ----------


class CreateConferenceRequest(BaseModel):
    title: str


class JoinConferenceRequest(BaseModel):
    code: str


class ConferenceInfo(BaseModel):
    id: str
    code: str
    title: str
    is_organizer: bool


# ---------- Простое in-memory "хранилище" ----------

# ключ — код конференции (верхний регистр),
# значение — словарь с базовой инфой.
_CONFERENCES: Dict[str, Dict[str, str]] = {}


def _generate_code() -> str:
    """Генерируем короткий код конференции."""
    return uuid.uuid4().hex[:8].upper()


# ---------- Эндпоинты ----------


@router.post("/create", response_model=ConferenceInfo)
async def create_conference(payload: CreateConferenceRequest) -> ConferenceInfo:
    if not payload.title.strip():
        raise HTTPException(
            status_code=400, detail="Название конференции не может быть пустым"
        )

    conf_id = str(uuid.uuid4())
    code = _generate_code()

    data = {
        "id": conf_id,
        "code": code,
        "title": payload.title.strip(),
    }
    _CONFERENCES[code] = data

    return ConferenceInfo(**data, is_organizer=True)


@router.post("/join", response_model=ConferenceInfo)
async def join_conference(payload: JoinConferenceRequest) -> ConferenceInfo:
    code = payload.code.strip().upper()
    if not code:
        raise HTTPException(
            status_code=400, detail="Код конференции не может быть пустым"
        )

    data = _CONFERENCES.get(code)
    if not data:
        raise HTTPException(
            status_code=404, detail="Конференция с таким кодом не найдена"
        )

    return ConferenceInfo(**data, is_organizer=False)
