# backend/app/api_conferences.py

import random
import string
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/conferences", tags=["conferences"])


class Conference(BaseModel):
    id: int
    code: str
    title: str


class CreateConferencePayload(BaseModel):
    title: str


class JoinConferencePayload(BaseModel):
    code: str


# Пространство хранения конференций в памяти процесса
_conferences: List[Conference] = []
_next_id = 1


def _generate_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(length))


@router.post("/create", response_model=Conference)
def create_conference(payload: CreateConferencePayload) -> Conference:
    global _next_id

    title = payload.title.strip()
    if not title:
        raise HTTPException(
            status_code=400, detail="Название конференции не может быть пустым"
        )

    # генерируем уникальный код
    existing_codes = {c.code for c in _conferences}
    code = _generate_code()
    while code in existing_codes:
        code = _generate_code()

    conf = Conference(id=_next_id, code=code, title=title)
    _next_id += 1
    _conferences.append(conf)
    return conf


@router.post("/join", response_model=Conference)
def join_conference(payload: JoinConferencePayload) -> Conference:
    code = payload.code.strip().upper()
    if not code:
        raise HTTPException(
            status_code=400, detail="Код конференции не может быть пустым"
        )

    for conf in _conferences:
        if conf.code == code:
            return conf

    raise HTTPException(status_code=404, detail="Конференция с таким кодом не найдена")
