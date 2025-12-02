import uuid
from pathlib import Path
from typing import Dict

from fastapi import APIRouter, BackgroundTasks, File, UploadFile, WebSocket

from .stt import mock_stt_from_file
from .translate import mock_translate_text
from .ws import manager

router = APIRouter()
UPLOAD_DIR = "/app/uploads"

WS_CONNECTIONS: Dict[str, set] = {}


@router.post("/upload/{lecture_id}")
async def upload_audio(lecture_id: int, file: UploadFile = File(...)):
    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        dest = os.path.join(UPLOAD_DIR, f"{lecture_id}_{file.filename}")
        with open(dest, "wb") as f:
            f.write(await file.read())

        segments = await mock_stt_from_file(dest, language="en")
        # TODO: здесь можно сохранить segments в БД (segments table), если нужно
        return {"status": "ok", "lecture_id": lecture_id, "segments": segments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def process_and_broadcast(lecture_id: str, file_path: str):
    transcript = await mock_stt_from_file(file_path)
    await broadcast(
        lecture_id, {"type": "transcript", "text": transcript, "lang": "en"}
    )
    translation = await mock_translate_text(transcript, target_lang="ru")
    await broadcast(
        lecture_id, {"type": "translation", "text": translation, "lang": "ru"}
    )


async def broadcast(lecture_id: str, message: dict):
    conns = list(WS_CONNECTIONS.get(lecture_id, []))
    for ws in conns:
        try:
            await ws.send_json(message)
        except Exception:
            WS_CONNECTIONS[lecture_id].discard(ws)


@router.websocket("/ws/lecture/{lecture_id}")
async def lecture_ws(websocket: WebSocket, lecture_id: str):
    await manager.connect(lecture_id, websocket)
    try:
        while True:
            # можно читать входящие, если нужно
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(lecture_id, websocket)
