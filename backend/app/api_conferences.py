from __future__ import annotations

import json
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
    src_lang: str
    tgt_lang: str


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


@dataclass
class ClientConn:
    ws: WebSocket
    role: str
    tgt_lang: str = "eng_Latn"


@dataclass
class ConferenceWsRuntime:
    code: str
    src_lang: str = "rus_Cyrl"
    is_active: bool = True
    clients: List[ClientConn] = field(default_factory=list)
    current_partial: str = ""


_WS: Dict[str, ConferenceWsRuntime] = {}


def _ws_rt(code: str) -> ConferenceWsRuntime:
    rt = _WS.get(code)
    if rt:
        return rt
    rt = ConferenceWsRuntime(code=code)
    _WS[code] = rt
    return rt


def _segment_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value

    for attr in ("text", "original_text", "original", "content", "message"):
        try:
            v = getattr(value, attr)
            if isinstance(v, str):
                return v
        except Exception:
            pass

    if isinstance(value, dict):
        for key in ("text", "original_text", "original", "content", "message"):
            v = value.get(key)
            if isinstance(v, str):
                return v

    try:
        return str(value)
    except Exception:
        return ""


def _translate_nllb_codes(text: Any, src_lang: str, tgt_lang: str) -> str:
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


async def _remove_dead_clients(
    ws_rt: ConferenceWsRuntime, dead: List[ClientConn]
) -> None:
    for client in dead:
        try:
            ws_rt.clients.remove(client)
        except ValueError:
            pass


async def _broadcast_partial(code: str, ws_rt: ConferenceWsRuntime, text: str) -> None:
    ws_rt.current_partial = text or ""

    dead: List[ClientConn] = []
    for client in list(ws_rt.clients):
        try:
            payload: Dict[str, Any] = {
                "type": "caption_partial",
                "text": text or "",
            }
            if client.role == "participant":
                payload["translated"] = _translate_nllb_codes(
                    text, ws_rt.src_lang, client.tgt_lang
                )
            await client.ws.send_json(payload)
        except Exception:
            dead.append(client)

    await _remove_dead_clients(ws_rt, dead)


async def _broadcast_final(code: str, ws_rt: ConferenceWsRuntime, text: str) -> None:
    text = (text or "").strip()
    if not text:
        return

    ws_rt.current_partial = ""
    RUNTIME.add_segment(code, text)

    dead: List[ClientConn] = []
    for client in list(ws_rt.clients):
        try:
            payload: Dict[str, Any] = {
                "type": "caption_final",
                "text": text,
            }
            if client.role == "participant":
                payload["translated"] = _translate_nllb_codes(
                    text, ws_rt.src_lang, client.tgt_lang
                )
            await client.ws.send_json(payload)
        except Exception:
            dead.append(client)

    await _remove_dead_clients(ws_rt, dead)


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

    RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    _ws_rt(conf.code)
    return conf


@router.post("/join", response_model=Conference)
async def join_conference(payload: JoinConferencePayload) -> Conference:
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(400, "Code is required")

    conf = _get_conf_by_code(code)
    if not conf:
        raise HTTPException(404, "Conference not found")

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
    format: Literal["pdf", "docx"] = Query(...),
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


@router.websocket("/{code}/ws")
async def conference_ws(ws: WebSocket, code: str):
    await ws.accept()

    code = (code or "").strip().upper()
    conf = _get_conf_by_code(code)
    if not conf:
        await ws.close(code=1008)
        return

    base_rt = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    ws_rt = _ws_rt(code)
    tgt_lang = "eng_Latn"
    role = "participant"

    try:
        join_msg = await ws.receive_json()
        if join_msg.get("type") != "join":
            await ws.close(code=1008)
            return

        role = join_msg.get("role") or "participant"
        if role not in ("organizer", "participant"):
            await ws.close(code=1008)
            return

        if role == "organizer":
            ws_rt.src_lang = join_msg.get("src_lang") or ws_rt.src_lang
        else:
            tgt_lang = join_msg.get("tgt_lang") or tgt_lang

        client = ClientConn(ws=ws, role=role, tgt_lang=tgt_lang)
        ws_rt.clients.append(client)

        items = [_segment_to_text(s) for s in list(base_rt.segments)]
        translated_items: List[str] = []
        if role == "participant":
            translated_items = [
                _translate_nllb_codes(s, ws_rt.src_lang, tgt_lang) for s in items
            ]

        await ws.send_json(
            {
                "type": "history",
                "items": items,
                "translated_items": translated_items,
                "is_active": ws_rt.is_active,
                "src_lang": ws_rt.src_lang,
            }
        )

        if ws_rt.current_partial:
            payload: Dict[str, Any] = {
                "type": "caption_partial",
                "text": ws_rt.current_partial,
            }
            if role == "participant":
                payload["translated"] = _translate_nllb_codes(
                    ws_rt.current_partial,
                    ws_rt.src_lang,
                    tgt_lang,
                )
            await ws.send_json(payload)

        while True:
            message = await ws.receive()
            msg_type = message.get("type")

            if msg_type == "websocket.disconnect":
                raise WebSocketDisconnect(message.get("code", 1000))

            text_payload = message.get("text")
            if text_payload is None:
                continue

            try:
                data = json.loads(text_payload)
            except json.JSONDecodeError:
                continue

            event_type = data.get("type")

            if event_type == "segment_partial":
                if role != "organizer" or not ws_rt.is_active:
                    continue
                text = (data.get("text") or "").strip()
                await _broadcast_partial(code, ws_rt, text)
                continue

            if event_type == "segment_final" or event_type == "segment":
                if role != "organizer" or not ws_rt.is_active:
                    continue
                text = (data.get("text") or "").strip()
                if not text:
                    continue
                await _broadcast_partial(code, ws_rt, "")
                await _broadcast_final(code, ws_rt, text)
                continue

            if event_type == "end":
                if role != "organizer":
                    continue

                ws_rt.is_active = False
                RUNTIME.end(code)

                dead: List[ClientConn] = []
                for existing_client in list(ws_rt.clients):
                    try:
                        await existing_client.ws.send_json({"type": "ended"})
                    except Exception:
                        dead.append(existing_client)

                await _remove_dead_clients(ws_rt, dead)
                continue

    except WebSocketDisconnect:
        pass
    finally:
        try:
            ws_rt.clients = [client for client in ws_rt.clients if client.ws is not ws]
        except Exception:
            pass
