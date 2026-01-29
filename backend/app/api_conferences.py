# backend/app/api_conferences.py
from __future__ import annotations

import random
import string
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.conferences_state import RUNTIME
from app.conference_export import export_docx, export_pdf
from app.translate_service import nllb_to_iso, translate_text

router = APIRouter(prefix="/api/conferences", tags=["conferences"])

EXPORT_ROOT = Path("/data/uploads/conference_exports")


class Conference(BaseModel):
    id: int
    code: str
    title: str


class CreateConferencePayload(BaseModel):
    title: str


class JoinConferencePayload(BaseModel):
    code: str


class TranslateRequest(BaseModel):
    text: str
    src_lang: str  # rus_Cyrl
    tgt_lang: str  # eng_Latn


class TranslateResponse(BaseModel):
    translated: str


_conferences: List[Conference] = []
_next_id = 1


def _generate_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(length))


def _get_conf_by_code(code: str) -> Optional[Conference]:
    for conf in _conferences:
        if conf.code == code:
            return conf
    return None


@router.post("/create", response_model=Conference)
def create_conference(payload: CreateConferencePayload) -> Conference:
    global _next_id

    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Название конференции не может быть пустым")

    existing_codes = {c.code for c in _conferences}
    code = _generate_code()
    while code in existing_codes:
        code = _generate_code()

    conf = Conference(id=_next_id, code=code, title=title)
    _next_id += 1
    _conferences.append(conf)

    RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    return conf


@router.post("/join", response_model=Conference)
def join_conference(payload: JoinConferencePayload) -> Conference:
    code = payload.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Код конференции не может быть пустым")

    conf = _get_conf_by_code(code)
    if not conf:
        raise HTTPException(status_code=404, detail="Конференция с таким кодом не найдена")

    RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    return conf


@router.get("/{code}/status")
def conference_status(code: str):
    code = code.strip().upper()
    conf = _get_conf_by_code(code)
    if not conf:
        raise HTTPException(404, "Конференция не найдена")

    rt = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    return {
        "code": code,
        "title": conf.title,
        "is_active": rt.is_active,
        "segments_count": len(rt.segments),
    }


@router.post("/{code}/end")
def end_conference(code: str):
    code = code.strip().upper()
    conf = _get_conf_by_code(code)
    if not conf:
        raise HTTPException(404, "Конференция не найдена")

    RUNTIME.end(code)
    return {"ok": True}


@router.post("/translate", response_model=TranslateResponse)
def translate_api(payload: TranslateRequest) -> TranslateResponse:
    src_iso = nllb_to_iso(payload.src_lang)
    tgt_iso = nllb_to_iso(payload.tgt_lang)
    translated = translate_text(payload.text, src_iso, tgt_iso)
    return TranslateResponse(translated=translated)


@router.get("/{code}/export")
def export_notes(
    code: str,
    format: Literal["pdf", "docx"] = Query(...),
    src_lang: str = Query(..., description="rus_Cyrl"),
    tgt_lang: str = Query(..., description="eng_Latn"),
    translated_text: str = Query("", description="participant translated notes"),
):
    """
    translated_text приходит с клиента, потому что у каждого участника свой язык.
    Возвращаем FileResponse, чтобы браузер скачивал файл.
    """
    code = code.strip().upper()
    conf = _get_conf_by_code(code)
    if not conf:
        raise HTTPException(404, "Конференция не найдена")

    rt = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    original = "\n".join(RUNTIME.history(code, limit=5000)).strip()

    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    out_dir = EXPORT_ROOT / code
    out_dir.mkdir(parents=True, exist_ok=True)

    if format == "docx":
        out_path = out_dir / "notes.docx"
        export_docx(out_path, original, translated_text, src_label=src_lang, tgt_label=tgt_lang)
        return FileResponse(
            str(out_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"{code}-notes.docx",
        )

    out_path = out_dir / "notes.pdf"
    export_pdf(out_path, original, translated_text, src_label=src_lang, tgt_label=tgt_lang)
    return FileResponse(
        str(out_path),
        media_type="application/pdf",
        filename=f"{code}-notes.pdf",
    )


@router.websocket("/{code}/ws")
async def conference_ws(ws: WebSocket, code: str):
    code = code.strip().upper()

    conf = _get_conf_by_code(code)
    if not conf:
        await ws.close(code=1008)
        return

    rt = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    await ws.accept()
    rt.sockets.add(ws)

    try:
        join_msg = await ws.receive_json()
        if join_msg.get("type") != "join":
            await ws.close(code=1008)
            return

        role = join_msg.get("role")
        if role not in ("organizer", "participant"):
            await ws.close(code=1008)
            return

        await ws.send_json({"type": "history", "items": RUNTIME.history(code), "is_active": rt.is_active})

        while True:
            data = await ws.receive_json()

            if data.get("type") == "segment":
                if not rt.is_active:
                    await ws.send_json({"type": "ended"})
                    continue

                text = (data.get("text") or "").strip()
                if not text:
                    continue

                RUNTIME.add_segment(code, text)

                dead = []
                for s in list(rt.sockets):
                    try:
                        await s.send_json({"type": "segment", "text": text})
                    except Exception:
                        dead.append(s)
                for s in dead:
                    rt.sockets.discard(s)

            elif data.get("type") == "end":
                rt.is_active = False
                dead = []
                for s in list(rt.sockets):
                    try:
                        await s.send_json({"type": "ended"})
                    except Exception:
                        dead.append(s)
                for s in dead:
                    rt.sockets.discard(s)

    except WebSocketDisconnect:
        pass
    finally:
        rt.sockets.discard(ws)
