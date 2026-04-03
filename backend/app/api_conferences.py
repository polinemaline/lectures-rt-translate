from __future__ import annotations

import random
import string
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

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


@dataclass
class ClientConn:
    client_id: str
    ws: WebSocket
    role: str
    display_name: str
    tgt_lang: str = "eng_Latn"


@dataclass
class ConferenceWsRuntime:
    code: str
    src_lang: str = "rus_Cyrl"
    is_active: bool = True
    screen_share_active: bool = False
    organizer_id: Optional[str] = None
    clients: Dict[str, ClientConn] = field(default_factory=dict)


_WS: Dict[str, ConferenceWsRuntime] = {}


def _generate_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(length))


def _get_conf_by_code(code: str) -> Optional[Conference]:
    for conf in _conferences:
        if conf.code == code:
            return conf
    return None


def _ws_rt(code: str) -> ConferenceWsRuntime:
    rt = _WS.get(code)
    if rt is None:
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
            candidate = getattr(value, attr)
        except Exception:
            candidate = None
        if isinstance(candidate, str):
            return candidate

    if isinstance(value, dict):
        for key in ("text", "original_text", "original", "content", "message"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                return candidate

    try:
        return str(value)
    except Exception:
        return ""


def _translate_nllb_codes(text: Any, src_lang: str, tgt_lang: str) -> str:
    normalized = (_segment_to_text(text) or "").strip()
    if not normalized:
        return ""
    if src_lang == tgt_lang:
        return normalized

    try:
        src_iso = nllb_to_iso(src_lang)
        tgt_iso = nllb_to_iso(tgt_lang)
        translated = (translate_text(normalized, src_iso, tgt_iso) or "").strip()
        return translated or normalized
    except Exception:
        return normalized


def _normalize_display_name(value: Any, role: str) -> str:
    raw = str(value or "").strip()
    if raw:
        return raw[:120]
    return "Организатор" if role == "organizer" else "Участник"


def _participant_ids(rt: ConferenceWsRuntime) -> List[str]:
    return [
        client_id
        for client_id, client in rt.clients.items()
        if client.role == "participant"
    ]


def _participant_payloads(rt: ConferenceWsRuntime) -> List[dict]:
    items: List[dict] = []
    for client_id, client in rt.clients.items():
        if client.role != "participant":
            continue
        items.append(
            {
                "client_id": client_id,
                "display_name": client.display_name,
            }
        )
    return items


async def _safe_send(client: ClientConn, payload: dict) -> bool:
    try:
        await client.ws.send_json(payload)
        return True
    except Exception:
        return False


async def _drop_clients(rt: ConferenceWsRuntime, client_ids: List[str]) -> None:
    for client_id in client_ids:
        rt.clients.pop(client_id, None)
        if rt.organizer_id == client_id:
            rt.organizer_id = None


async def _broadcast(
    rt: ConferenceWsRuntime,
    payload: dict,
    *,
    only_role: Optional[str] = None,
    exclude_client_id: Optional[str] = None,
) -> None:
    dead: List[str] = []
    for client_id, client in list(rt.clients.items()):
        if exclude_client_id and client_id == exclude_client_id:
            continue
        if only_role and client.role != only_role:
            continue
        if not await _safe_send(client, payload):
            dead.append(client_id)
    await _drop_clients(rt, dead)


async def _broadcast_partial(rt: ConferenceWsRuntime, text: str) -> None:
    dead: List[str] = []
    for client_id, client in list(rt.clients.items()):
        try:
            payload = {"type": "caption_partial", "text": text}
            if client.role == "participant":
                payload["translated"] = _translate_nllb_codes(
                    text, rt.src_lang, client.tgt_lang
                )
            await client.ws.send_json(payload)
        except Exception:
            dead.append(client_id)
    await _drop_clients(rt, dead)


async def _broadcast_final(rt: ConferenceWsRuntime, text: str) -> None:
    dead: List[str] = []
    for client_id, client in list(rt.clients.items()):
        try:
            payload = {"type": "caption_final", "text": text}
            if client.role == "participant":
                payload["translated"] = _translate_nllb_codes(
                    text, rt.src_lang, client.tgt_lang
                )
            await client.ws.send_json(payload)
        except Exception:
            dead.append(client_id)
    await _drop_clients(rt, dead)


async def _send_history(client: ClientConn, rt: ConferenceWsRuntime, code: str) -> None:
    items = list(RUNTIME.history(code))
    translated_items: List[str] = []
    if client.role == "participant":
        translated_items = [
            _translate_nllb_codes(item, rt.src_lang, client.tgt_lang) for item in items
        ]

    await _safe_send(
        client,
        {
            "type": "history",
            "items": items,
            "translated_items": translated_items,
            "is_active": rt.is_active,
            "src_lang": rt.src_lang,
            "screen_share_active": rt.screen_share_active,
            "client_id": client.client_id,
            "organizer_client_id": rt.organizer_id,
            "participant_ids": _participant_ids(rt),
            "participants": _participant_payloads(rt),
        },
    )


@router.post("/create", response_model=Conference)
async def create_conference(payload: CreateConferencePayload) -> Conference:
    global _next_id

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

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
        raise HTTPException(status_code=400, detail="Code is required")

    conf = _get_conf_by_code(code)
    if conf is None:
        raise HTTPException(status_code=404, detail="Conference not found")

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
        translated = (translate_text(text, src_iso, tgt_iso) or "").strip()
        return TranslateResponse(translated=translated or text)
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
async def conference_ws(ws: WebSocket, code: str) -> None:
    await ws.accept()

    normalized_code = (code or "").strip().upper()
    conf = _get_conf_by_code(normalized_code)
    if conf is None:
        await ws.close(code=1008)
        return

    RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    rt = _ws_rt(normalized_code)

    client_id = uuid4().hex
    client: Optional[ClientConn] = None

    try:
        join_msg = await ws.receive_json()
        if join_msg.get("type") != "join":
            await ws.close(code=1008)
            return

        role = (join_msg.get("role") or "participant").strip()
        if role not in {"organizer", "participant"}:
            await ws.close(code=1008)
            return

        display_name = _normalize_display_name(join_msg.get("display_name"), role)

        if role == "organizer":
            existing_organizer = rt.organizer_id and rt.clients.get(rt.organizer_id)
            if existing_organizer is not None:
                await ws.send_json(
                    {
                        "type": "error",
                        "message": "Организатор уже подключён к этой конференции.",
                    }
                )
                await ws.close(code=1008)
                return
            rt.organizer_id = client_id
            rt.src_lang = (
                join_msg.get("src_lang") or rt.src_lang or "rus_Cyrl"
            ).strip()

        client = ClientConn(
            client_id=client_id,
            ws=ws,
            role=role,
            display_name=display_name,
            tgt_lang=(join_msg.get("tgt_lang") or "eng_Latn").strip(),
        )
        rt.clients[client_id] = client

        await _send_history(client, rt, normalized_code)

        if role == "participant" and rt.organizer_id:
            organizer = rt.clients.get(rt.organizer_id)
            if organizer is not None:
                await _safe_send(
                    organizer,
                    {
                        "type": "participant_joined",
                        "participant_id": client_id,
                        "participant_name": client.display_name,
                    },
                )
        elif role == "organizer":
            await _safe_send(
                client,
                {
                    "type": "peer_list",
                    "participant_ids": _participant_ids(rt),
                    "participants": _participant_payloads(rt),
                },
            )

        while True:
            data = await ws.receive_json()
            msg_type = (data.get("type") or "").strip()

            if msg_type == "segment_partial":
                if role != "organizer":
                    continue
                text = (data.get("text") or "").strip()
                await _broadcast_partial(rt, text)
                continue

            if msg_type in {"segment_final", "segment"}:
                if role != "organizer":
                    continue
                text = (data.get("text") or "").strip()
                if not text:
                    continue
                RUNTIME.add_segment(normalized_code, text)
                await _broadcast_final(rt, text)
                continue

            if msg_type == "end":
                if role != "organizer":
                    continue
                rt.is_active = False
                rt.screen_share_active = False
                RUNTIME.end(normalized_code)
                await _broadcast(rt, {"type": "ended"})
                await _broadcast(
                    rt, {"type": "screen_share_stopped"}, only_role="participant"
                )
                continue

            if msg_type == "screen_share_started":
                if role != "organizer":
                    continue
                rt.screen_share_active = True
                await _broadcast(
                    rt, {"type": "screen_share_started"}, only_role="participant"
                )
                continue

            if msg_type == "screen_share_stopped":
                if role != "organizer":
                    continue
                rt.screen_share_active = False
                await _broadcast(
                    rt, {"type": "screen_share_stopped"}, only_role="participant"
                )
                continue

            if msg_type in {"webrtc_offer", "webrtc_answer", "webrtc_ice_candidate"}:
                target_client_id = (data.get("target_client_id") or "").strip()
                target = rt.clients.get(target_client_id)
                if target is None:
                    continue

                sender_is_organizer = client_id == rt.organizer_id
                receiver_is_organizer = target_client_id == rt.organizer_id
                if sender_is_organizer == receiver_is_organizer:
                    continue

                relay_payload = {
                    "type": msg_type,
                    "from_client_id": client_id,
                }
                if msg_type == "webrtc_offer":
                    relay_payload["sdp"] = data.get("sdp")
                elif msg_type == "webrtc_answer":
                    relay_payload["sdp"] = data.get("sdp")
                else:
                    relay_payload["candidate"] = data.get("candidate")

                if not await _safe_send(target, relay_payload):
                    await _drop_clients(rt, [target_client_id])
                continue

    except WebSocketDisconnect:
        pass
    finally:
        if client is None:
            return

        was_organizer = rt.organizer_id == client_id
        rt.clients.pop(client_id, None)

        if was_organizer:
            rt.organizer_id = None
            rt.screen_share_active = False
            await _broadcast(rt, {"type": "screen_share_stopped"})
            await _broadcast(rt, {"type": "organizer_left"})
        else:
            organizer = rt.clients.get(rt.organizer_id or "")
            if organizer is not None:
                await _safe_send(
                    organizer,
                    {
                        "type": "participant_left",
                        "participant_id": client_id,
                    },
                )
