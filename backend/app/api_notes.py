from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api_auth import get_current_user
from app.conference_export import export_docx, export_pdf
from app.db import get_session
from app.models import Note

router = APIRouter(prefix="/api/notes", tags=["notes"])

EXPORT_ROOT = Path("/data/uploads/note_exports")


class NoteCreate(BaseModel):
    title: str | None = None
    original_language: str | None = None
    target_language: str | None = None
    original_text: str
    translated_text: str


class NoteUpdate(BaseModel):
    title: str | None = None
    original_text: str | None = None
    translated_text: str | None = None


class NoteOut(BaseModel):
    id: int
    title: str
    original_language: str | None = None
    target_language: str | None = None
    original_text: str
    translated_text: str
    created_at: dt.datetime | None = None

    class Config:
        orm_mode = True


@router.get("", response_model=list[NoteOut])
async def list_notes(
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    res = await session.execute(
        select(Note).where(Note.user_id == user.id).order_by(Note.id.desc())
    )
    notes = res.scalars().all()
    return [NoteOut.from_orm(note) for note in notes]


@router.get("/{note_id}", response_model=NoteOut)
async def get_note(
    note_id: int,
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    res = await session.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = res.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    return NoteOut.from_orm(note)


@router.post("", response_model=NoteOut)
async def create_note(
    payload: NoteCreate,
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    title = (payload.title or "").strip() or "Конспект"

    note = Note(
        user_id=user.id,
        title=title,
        original_language=payload.original_language,
        target_language=payload.target_language,
        original_text=payload.original_text or "",
        translated_text=payload.translated_text or "",
    )
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return NoteOut.from_orm(note)


@router.put("/{note_id}", response_model=NoteOut)
async def update_note(
    note_id: int,
    payload: NoteUpdate,
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    res = await session.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = res.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")

    if payload.title is not None:
        note.title = (payload.title or "").strip() or "Конспект"
    if payload.original_text is not None:
        note.original_text = payload.original_text or ""
    if payload.translated_text is not None:
        note.translated_text = payload.translated_text or ""

    await session.commit()
    await session.refresh(note)
    return NoteOut.from_orm(note)


@router.delete("/{note_id}")
async def delete_note(
    note_id: int,
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    res = await session.execute(
        select(Note.id).where(Note.id == note_id, Note.user_id == user.id)
    )
    exists = res.scalar_one_or_none()
    if not exists:
        raise HTTPException(404, "Note not found")

    await session.execute(
        delete(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    await session.commit()
    return {"ok": True}


@router.get("/{note_id}/export")
async def export_note(
    note_id: int,
    format: Literal["pdf", "docx"] = Query(...),
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    res = await session.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = res.scalar_one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")

    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    out_dir = EXPORT_ROOT / str(user.id) / str(note_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    src_label = note.original_language or "original"
    tgt_label = note.target_language or "translated"

    if format == "docx":
        out_path = out_dir / "note.docx"
        export_docx(
            out_path,
            note.original_text or "",
            note.translated_text or "",
            src_label,
            tgt_label,
        )
        return FileResponse(
            str(out_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"note_{note_id}.docx",
        )

    out_path = out_dir / "note.pdf"
    export_pdf(
        out_path,
        note.original_text or "",
        note.translated_text or "",
        src_label,
        tgt_label,
    )
    return FileResponse(
        str(out_path),
        media_type="application/pdf",
        filename=f"note_{note_id}.pdf",
    )
