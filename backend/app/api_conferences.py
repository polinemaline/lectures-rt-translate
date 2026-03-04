# backend/app/api_conferences.py
from __future__ import annotations

import random
import string
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.conference_export import export_docx, export_pdf
from app.conferences_state import RUNTIME
from app.translate_service import nllb_to_iso, translate_text

router = APIRouter(prefix="/api/conferences", tags=["conferences"])

EXPORT_ROOT = Path("/data/uploads/conference_exports")


# -------------------------
# API models
# -------------------------
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


# -------------------------
# In-memory list of conferences
# -------------------------
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


# -------------------------
# Runtime for WS translation
# -------------------------
@dataclass
class ClientConn:
    ws: WebSocket
    role: str  # organizer | participant
    tgt_lang: str = "eng_Latn"


@dataclass
class ConferenceWsRuntime:
    code: str
    src_lang: str = "rus_Cyrl"
    is_active: bool = True
    segments: List[str] = field(default_factory=list)
    clients: List[ClientConn] = field(default_factory=list)


_WS: Dict[str, ConferenceWsRuntime] = {}


def _ws_rt(code: str) -> ConferenceWsRuntime:
    rt = _WS.get(code)
    if rt:
        return rt
    rt = ConferenceWsRuntime(code=code)
    _WS[code] = rt
    return rt


def _segment_to_text(value: Any) -> str:
    """Конвертирует Segment/словарь/строку в текст, чтобы не падать на .strip()."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value

    # объект с текстовым полем (например Segment)
    for attr in ("text", "original_text", "original", "content", "message"):
        try:
            v = getattr(value, attr)
            if isinstance(v, str):
                return v
        except Exception:
            pass

    # словарь
    if isinstance(value, dict):
        for key in ("text", "original_text", "original", "content", "message"):
            v = value.get(key)
            if isinstance(v, str):
                return v

    # fallback
    try:
        return str(value)
    except Exception:
        return ""


def _translate_nllb_codes(text: Any, src_lang: str, tgt_lang: str) -> str:
    """
    Перевод для WS. Всегда возвращает не-пустое, если text не пустой:
    - если перевод упал -> вернёт оригинал
    """
    text = (_segment_to_text(text) or "").strip()
    if not text:
        return ""

    if src_lang == tgt_lang:
        return text

    try:
        src_iso = nllb_to_iso(src_lang)
        tgt_iso = nllb_to_iso(tgt_lang)
        out = translate_text(text, src_iso, tgt_iso)
        out = (out or "").strip()
        return out if out else text
    except Exception:
        return text


# -------------------------
# REST endpoints
# -------------------------
@router.post("/create", response_model=Conference)
async def create_conference(payload: CreateConferencePayload) -> Conference:
    global _next_id
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")

    code = _generate_code()
    conf = Conference(id=_next_id, code=code, title=title)
    _next_id += 1
    _conferences.append(conf)

    # attach runtime storage
    RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    _ws_rt(conf.code)  # init ws runtime

    return conf


@router.post("/join", response_model=Conference)
async def join_conference(payload: JoinConferencePayload) -> Conference:
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(400, "Code is required")

    conf = _get_conf_by_code(code)
    if not conf:
        raise HTTPException(404, "Conference not found")

    # ensure runtime exists
    RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    _ws_rt(conf.code)

    return conf


@router.post("/translate", response_model=TranslateResponse)
async def translate_segment(payload: TranslateRequest) -> TranslateResponse:
    text = (payload.text or "").strip()
    if not text:
        return TranslateResponse(translated="")

    if payload.src_lang == payload.tgt_lang:
        return TranslateResponse(translated=text)

    try:
        src_iso = nllb_to_iso(payload.src_lang)
        tgt_iso = nllb_to_iso(payload.tgt_lang)
        out = translate_text(text, src_iso, tgt_iso)
        return TranslateResponse(translated=(out or "").strip() or text)
    except Exception:
        return TranslateResponse(translated=text)


@router.get("/{code}/export")
async def export_conference(
    code: str,
    format: Literal["pdf", "docx"] = Query(..., pattern="^(pdf|docx)$"),
    src_lang: str = Query("rus_Cyrl"),
    tgt_lang: str = Query("eng_Latn"),
    original_text: str = Query(""),
    translated_text: str = Query(""),
):
    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    out_dir = EXPORT_ROOT / code
    out_dir.mkdir(parents=True, exist_ok=True)

    src_label = src_lang or "original"
    tgt_label = tgt_lang or "translated"

    if format == "docx":
        out_path = out_dir / "conference.docx"
        export_docx(
            out_path, original_text or "", translated_text or "", src_label, tgt_label
        )
        return FileResponse(
            str(out_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"conference_{code}.docx",
        )

    out_path = out_dir / "conference.pdf"
    export_pdf(
        out_path, original_text or "", translated_text or "", src_label, tgt_label
    )
    return FileResponse(
        str(out_path),
        media_type="application/pdf",
        filename=f"conference_{code}.pdf",
    )


# -------------------------
# WebSocket endpoint
# -------------------------
@router.websocket("/{code}/ws")
async def conference_ws(ws: WebSocket, code: str):
    await ws.accept()

    code = (code or "").strip().upper()
    conf = _get_conf_by_code(code)
    if not conf:
        await ws.close(code=1008)
        return

    # runtime storage
    base_rt = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    ws_rt = _ws_rt(code)

    tgt_lang = "eng_Latn"

    try:
        join_msg = await ws.receive_json()
        if join_msg.get("type") != "join":
            await ws.close(code=1008)
            return

        role = join_msg.get("role") or "participant"
        if role not in ("organizer", "participant"):
            await ws.close(code=1008)
            return

        # organizer может прислать src_lang
        if role == "organizer":
            ws_rt.src_lang = join_msg.get("src_lang") or ws_rt.src_lang

        # participant присылает tgt_lang
        if role == "participant":
            tgt_lang = join_msg.get("tgt_lang") or tgt_lang

        client = ClientConn(ws=ws, role=role, tgt_lang=tgt_lang)
        ws_rt.clients.append(client)

        # История оригинала (приводим к строкам на случай Segment)
        items = [_segment_to_text(s) for s in list(base_rt.segments)]

        # История перевода (только для участника; организатору всё равно — фронт скрывает)
        translated_items: List[str] = []
        if role == "participant":
            for s in items:
                translated_items.append(
                    _translate_nllb_codes(s, ws_rt.src_lang, tgt_lang)
                )

        await ws.send_json(
            {
                "type": "history",
                "items": items,
                "translated_items": translated_items,
                "is_active": ws_rt.is_active,
                "src_lang": ws_rt.src_lang,
            }
        )

        while True:
            data = await ws.receive_json()

            if data.get("type") == "segment":
                if not ws_rt.is_active:
                    # конференция уже закончена
                    try:
                        await ws.send_json({"type": "ended"})
                    except Exception:
                        pass
                    continue

                # сегменты принимаем только от организатора
                if role != "organizer":
                    continue

                text = (data.get("text") or "").strip()
                if not text:
                    continue

                # сохраняем в основной истории (оригинал)
                RUNTIME.add_segment(code, text)
                ws_rt.src_lang = ws_rt.src_lang or "rus_Cyrl"

                # broadcast всем:
                dead: List[ClientConn] = []
                for c in list(ws_rt.clients):
                    try:
                        if c.role == "participant":
                            tr = _translate_nllb_codes(text, ws_rt.src_lang, c.tgt_lang)
                            await c.ws.send_json(
                                {"type": "segment", "text": text, "translated": tr}
                            )
                        else:
                            # организатору перевод не нужен; но можно слать только оригинал,
                            # фронт всё равно скрывает субтитры у организатора
                            await c.ws.send_json({"type": "segment", "text": text})
                    except Exception:
                        dead.append(c)

                for c in dead:
                    try:
                        ws_rt.clients.remove(c)
                    except ValueError:
                        pass

            elif data.get("type") == "end":
                if role != "organizer":
                    continue

                ws_rt.is_active = False

                dead: List[ClientConn] = []
                for c in list(ws_rt.clients):
                    try:
                        await c.ws.send_json({"type": "ended"})
                    except Exception:
                        dead.append(c)

                for c in dead:
                    try:
                        ws_rt.clients.remove(c)
                    except ValueError:
                        pass

    except WebSocketDisconnect:
        pass
    finally:
        # remove client
        try:
            ws_rt.clients = [c for c in ws_rt.clients if c.ws is not ws]
        except Exception:
            pass
