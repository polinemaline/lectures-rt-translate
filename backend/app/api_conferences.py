from __future__ import annotations

import random
import string
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    Header,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
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
    creator_user_id: Optional[int] = None
    can_join_as_organizer: bool = False


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
    screen_share_owner_id: Optional[str] = None
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


def _normalize_display_name(value: Any, role: str) -> str:
    raw = str(value or "").strip()
    if raw:
        return raw[:120]
    return "Организатор" if role == "organizer" else "Участник"


def _normalize_role(value: Any) -> str:
    role = str(value or "participant").strip().lower()
    if role not in {"organizer", "participant"}:
        return "participant"
    return role


def _normalize_token(raw: Any) -> Optional[str]:
    value = str(raw or "").strip()
    if not value:
        return None
    parts = value.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return value


def _user_id_from_token(raw: Any) -> Optional[int]:
    token = _normalize_token(raw)
    if not token:
        return None

    prefix = "mock-token-"
    if not token.startswith(prefix):
        return None

    try:
        return int(token[len(prefix) :])
    except (TypeError, ValueError):
        return None


def _resolve_join_role(
    conf: Conference, requested_role: str, auth_user_id: Optional[int]
) -> str:
    if conf.creator_user_id is not None:
        return "organizer" if auth_user_id == conf.creator_user_id else "participant"
    return requested_role


def _participant_ids(rt: ConferenceWsRuntime) -> List[str]:
    return [
        client_id
        for client_id, client in rt.clients.items()
        if client.role == "participant"
    ]


def _peer_payloads(
    rt: ConferenceWsRuntime, exclude_client_id: Optional[str] = None
) -> List[dict]:
    items: List[dict] = []
    for client_id, client in rt.clients.items():
        if exclude_client_id and client_id == exclude_client_id:
            continue
        items.append(
            {
                "client_id": client_id,
                "display_name": client.display_name,
                "role": client.role,
            }
        )
    return items


def _screen_share_owner_name(rt: ConferenceWsRuntime) -> Optional[str]:
    owner_id = rt.screen_share_owner_id
    if not owner_id:
        return None
    owner = rt.clients.get(owner_id)
    if owner is None:
        return None
    return owner.display_name


async def _safe_send(client: ClientConn, payload: dict) -> bool:
    try:
        await client.ws.send_json(payload)
        return True
    except Exception:
        return False


async def _broadcast(
    rt: ConferenceWsRuntime,
    payload: dict,
    *,
    exclude_client_id: Optional[str] = None,
) -> None:
    dead: List[str] = []
    for client_id, client in list(rt.clients.items()):
        if exclude_client_id and client_id == exclude_client_id:
            continue
        if not await _safe_send(client, payload):
            dead.append(client_id)
    if dead:
        await _drop_clients(rt, dead)


def _translate_nllb_codes(text: str, src_lang: str, tgt_lang: str) -> str:
    clean = (text or "").strip()
    if not clean:
        return ""
    if not tgt_lang or src_lang == tgt_lang:
        return clean
    try:
        src_iso = nllb_to_iso(src_lang)
        tgt_iso = nllb_to_iso(tgt_lang)
        translated = (translate_text(clean, src_iso, tgt_iso) or "").strip()
        return translated or clean
    except Exception:
        return clean


def _format_caption_line(speaker_name: str, text: str) -> str:
    clean_speaker = str(speaker_name or "").strip() or "Участник"
    clean_text = str(text or "").strip()
    return f"{clean_speaker}: {clean_text}".strip()


def _translate_caption_line(line: str, src_lang: str, tgt_lang: str) -> str:
    clean = (line or "").strip()
    if not clean:
        return ""
    if not tgt_lang or src_lang == tgt_lang:
        return clean

    speaker, sep, speech = clean.partition(":")
    if not sep:
        return _translate_nllb_codes(clean, src_lang, tgt_lang)

    translated_speech = _translate_nllb_codes(speech.strip(), src_lang, tgt_lang)
    return f"{speaker.strip()}: {translated_speech}".strip()


async def _broadcast_peer_lists(rt: ConferenceWsRuntime) -> None:
    dead: List[str] = []
    for client_id, client in list(rt.clients.items()):
        payload = {
            "type": "peer_list",
            "participants": _peer_payloads(rt, exclude_client_id=client_id),
            "participant_ids": _participant_ids(rt),
            "screen_share_active": rt.screen_share_active,
            "screen_share_owner_id": rt.screen_share_owner_id,
            "screen_share_owner_name": _screen_share_owner_name(rt),
            "organizer_client_id": rt.organizer_id,
        }
        if not await _safe_send(client, payload):
            dead.append(client_id)
    if dead:
        await _drop_clients(rt, dead)


async def _broadcast_partial(
    rt: ConferenceWsRuntime,
    speaker_id: str,
    speaker_name: str,
    text: str,
) -> None:
    dead: List[str] = []
    display_text = _format_caption_line(speaker_name, text) if text else ""

    for client_id, client in list(rt.clients.items()):
        payload = {
            "type": "caption_partial",
            "speaker_client_id": speaker_id,
            "speaker_name": speaker_name,
            "text": text,
            "display_text": display_text,
            "translated_display_text": (
                _translate_caption_line(display_text, rt.src_lang, client.tgt_lang)
                if display_text
                else ""
            ),
        }
        if not await _safe_send(client, payload):
            dead.append(client_id)

    if dead:
        await _drop_clients(rt, dead)


async def _broadcast_final(
    rt: ConferenceWsRuntime,
    speaker_id: str,
    speaker_name: str,
    text: str,
) -> None:
    dead: List[str] = []
    display_text = _format_caption_line(speaker_name, text)

    for client_id, client in list(rt.clients.items()):
        payload = {
            "type": "caption_final",
            "speaker_client_id": speaker_id,
            "speaker_name": speaker_name,
            "text": text,
            "display_text": display_text,
            "translated_display_text": _translate_caption_line(
                display_text, rt.src_lang, client.tgt_lang
            ),
        }
        if not await _safe_send(client, payload):
            dead.append(client_id)

    if dead:
        await _drop_clients(rt, dead)


async def _send_history(client: ClientConn, rt: ConferenceWsRuntime, code: str) -> None:
    items = list(RUNTIME.history(code))
    translated_items = [
        _translate_caption_line(item, rt.src_lang, client.tgt_lang) for item in items
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
            "screen_share_owner_id": rt.screen_share_owner_id,
            "screen_share_owner_name": _screen_share_owner_name(rt),
            "client_id": client.client_id,
            "joined_role": client.role,
            "organizer_client_id": rt.organizer_id,
            "participant_ids": _participant_ids(rt),
            "participants": _peer_payloads(rt, exclude_client_id=client.client_id),
        },
    )


async def _drop_clients(rt: ConferenceWsRuntime, client_ids: List[str]) -> None:
    changed = False
    owner_dropped = False
    organizer_dropped = False

    for client_id in client_ids:
        if client_id in rt.clients:
            changed = True
        if rt.screen_share_owner_id == client_id:
            owner_dropped = True
        if rt.organizer_id == client_id:
            organizer_dropped = True
        rt.clients.pop(client_id, None)

    if organizer_dropped:
        rt.organizer_id = None

    if owner_dropped:
        rt.screen_share_owner_id = None
        rt.screen_share_active = False

    if changed:
        if owner_dropped:
            await _broadcast(
                rt,
                {
                    "type": "screen_share_stopped",
                    "owner_client_id": None,
                    "owner_display_name": None,
                },
            )
        await _broadcast_peer_lists(rt)


@router.post("/create", response_model=Conference)
async def create_conference(
    payload: CreateConferencePayload,
    authorization: str | None = Header(default=None),
) -> Conference:
    global _next_id

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    creator_user_id = _user_id_from_token(authorization)
    code = _generate_code()

    conf = Conference(
        id=_next_id,
        code=code,
        title=title,
        creator_user_id=creator_user_id,
        can_join_as_organizer=creator_user_id is not None,
    )
    _next_id += 1
    _conferences.append(conf)

    runtime = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    runtime.organizer_user_id = creator_user_id

    _ws_rt(conf.code)
    return conf


@router.post("/join", response_model=Conference)
async def join_conference(
    payload: JoinConferencePayload,
    authorization: str | None = Header(default=None),
) -> Conference:
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")

    conf = _get_conf_by_code(code)
    if conf is None:
        raise HTTPException(status_code=404, detail="Conference not found")

    user_id = _user_id_from_token(authorization)

    runtime = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    if runtime.organizer_user_id is None and conf.creator_user_id is not None:
        runtime.organizer_user_id = conf.creator_user_id

    _ws_rt(conf.code)

    return Conference(
        id=conf.id,
        code=conf.code,
        title=conf.title,
        creator_user_id=conf.creator_user_id,
        can_join_as_organizer=(
            conf.creator_user_id is not None and user_id == conf.creator_user_id
        ),
    )


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
            out_path,
            original_text or "",
            translated_text or "",
            src_label,
            tgt_label,
        )
        return FileResponse(
            str(out_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"conference_{code}.docx",
        )

    out_path = out_dir / "conference.pdf"
    export_pdf(
        out_path,
        original_text or "",
        translated_text or "",
        src_label,
        tgt_label,
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

    runtime = RUNTIME.attach(conf_id=conf.id, code=conf.code, title=conf.title)
    if runtime.organizer_user_id is None and conf.creator_user_id is not None:
        runtime.organizer_user_id = conf.creator_user_id

    rt = _ws_rt(normalized_code)
    client_id = uuid4().hex
    client: Optional[ClientConn] = None

    try:
        join_msg = await ws.receive_json()
        if join_msg.get("type") != "join":
            await ws.close(code=1008)
            return

        requested_role = _normalize_role(join_msg.get("role"))
        auth_user_id = _user_id_from_token(join_msg.get("auth_token"))
        role = _resolve_join_role(conf, requested_role, auth_user_id)
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
        await _broadcast_peer_lists(rt)

        while True:
            data = await ws.receive_json()
            msg_type = (data.get("type") or "").strip()

            if msg_type == "segment_partial":
                text = (data.get("text") or "").strip()
                await _broadcast_partial(rt, client_id, client.display_name, text)
                continue

            if msg_type in {"segment_final", "segment"}:
                text = (data.get("text") or "").strip()
                if not text:
                    continue

                display_text = _format_caption_line(client.display_name, text)
                RUNTIME.add_segment(normalized_code, display_text)
                await _broadcast_final(rt, client_id, client.display_name, text)
                continue

            if msg_type == "end":
                if role != "organizer":
                    continue

                rt.is_active = False
                rt.screen_share_active = False
                rt.screen_share_owner_id = None
                RUNTIME.end(normalized_code)

                await _broadcast(rt, {"type": "ended"})
                await _broadcast(
                    rt,
                    {
                        "type": "screen_share_stopped",
                        "owner_client_id": None,
                        "owner_display_name": None,
                    },
                )
                continue

            if msg_type == "screen_share_started":
                if rt.screen_share_owner_id and rt.screen_share_owner_id != client_id:
                    await _safe_send(
                        client,
                        {
                            "type": "error",
                            "message": "Сейчас экран уже демонстрирует другой участник.",
                        },
                    )
                    continue

                rt.screen_share_active = True
                rt.screen_share_owner_id = client_id
                await _broadcast(
                    rt,
                    {
                        "type": "screen_share_started",
                        "owner_client_id": client_id,
                        "owner_display_name": client.display_name,
                    },
                )
                await _broadcast_peer_lists(rt)
                continue

            if msg_type == "screen_share_stopped":
                if rt.screen_share_owner_id != client_id:
                    continue

                rt.screen_share_active = False
                rt.screen_share_owner_id = None
                await _broadcast(
                    rt,
                    {
                        "type": "screen_share_stopped",
                        "owner_client_id": client_id,
                        "owner_display_name": client.display_name,
                    },
                )
                await _broadcast_peer_lists(rt)
                continue

            if msg_type in {"webrtc_offer", "webrtc_answer", "webrtc_ice_candidate"}:
                target_client_id = (data.get("target_client_id") or "").strip()
                if not target_client_id or target_client_id == client_id:
                    continue

                target = rt.clients.get(target_client_id)
                if target is None:
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

        owner_left = rt.screen_share_owner_id == client_id
        was_organizer = rt.organizer_id == client_id

        rt.clients.pop(client_id, None)

        if was_organizer:
            rt.organizer_id = None

        if owner_left:
            rt.screen_share_owner_id = None
            rt.screen_share_active = False

        if owner_left:
            await _broadcast(
                rt,
                {
                    "type": "screen_share_stopped",
                    "owner_client_id": client_id,
                    "owner_display_name": client.display_name,
                },
            )

        if was_organizer:
            await _broadcast(rt, {"type": "organizer_left"})

        await _broadcast_peer_lists(rt)
