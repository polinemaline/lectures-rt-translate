# backend/app/api_conferences.py
from __future__ import annotations

import random
import string
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.conferences_state import RUNTIME
from app.conference_export import export_docx, export_pdf
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


def _translate_nllb_codes(text: str, src_lang: str, tgt_lang: str) -> str:
    """
    Перевод для WS. Всегда возвращает не-пустое, если text не пустой:
    - если перевод упал -> вернёт оригинал
    """
    text = (text or "").strip()
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
# REST: create/join/translate/export
# -------------------------
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

    # attach base runtime (история оригинала)
    RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)

    # attach WS runtime
    _ws_rt(conf.code)

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
    _ws_rt(conf.code)

    return conf


@router.post("/translate", response_model=TranslateResponse)
def translate_api(payload: TranslateRequest) -> TranslateResponse:
    text = (payload.text or "").strip()
    if not text:
        return TranslateResponse(translated="")

    translated = _translate_nllb_codes(text, payload.src_lang, payload.tgt_lang)
    return TranslateResponse(translated=translated)


@router.get("/{code}/export")
def export_notes(
    code: str,
    format: Literal["pdf", "docx"] = Query(...),
    src_lang: str = Query(..., description="rus_Cyrl"),
    tgt_lang: str = Query(..., description="eng_Latn"),
    original_text: str = Query("", description="participant original notes"),
    translated_text: str = Query("", description="participant translated notes"),
):
    code = code.strip().upper()
    conf = _get_conf_by_code(code)
    if not conf:
        raise HTTPException(404, "Конференция не найдена")

    _ = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)

    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    out_dir = EXPORT_ROOT / code
    out_dir.mkdir(parents=True, exist_ok=True)

    original = (original_text or "").strip()
    translated = (translated_text or "").strip()

    if format == "docx":
        out_path = out_dir / "notes.docx"
        export_docx(out_path, original, translated, src_label=src_lang, tgt_label=tgt_lang)
        return FileResponse(
            str(out_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"{code}-notes.docx",
        )

    out_path = out_dir / "notes.pdf"
    export_pdf(out_path, original, translated, src_label=src_lang, tgt_label=tgt_lang)
    return FileResponse(
        str(out_path),
        media_type="application/pdf",
        filename=f"{code}-notes.pdf",
    )


# -------------------------
# WebSocket: fan-out original + per-client translation
# -------------------------
@router.websocket("/{code}/ws")
async def conference_ws(ws: WebSocket, code: str):
    code = code.strip().upper()

    conf = _get_conf_by_code(code)
    if not conf:
        await ws.close(code=1008)
        return

    base_rt = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    ws_rt = _ws_rt(code)

    await ws.accept()

    role = "participant"
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

        # История оригинала
        items = list(base_rt.segments)

        # История перевода (только для участника; организатору всё равно — фронт скрывает)
        translated_items: List[str] = []
        if role == "participant":
            for s in items:
                translated_items.append(_translate_nllb_codes(s, ws_rt.src_lang, tgt_lang))

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
                            await c.ws.send_json({"type": "segment", "text": text, "translated": tr})
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
        # удалить подключение
        ws_rt.clients = [c for c in ws_rt.clients if c.ws is not ws]
        try:
            await ws.close()
        except Exception:
            pass
