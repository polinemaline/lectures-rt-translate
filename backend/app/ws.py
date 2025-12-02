# app/ws.py
from typing import Dict, Set

from fastapi import WebSocket


class WSManager:
    def __init__(self):
        # lecture_id -> set of websockets
        self.rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, lecture_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(lecture_id, set()).add(ws)

    def disconnect(self, lecture_id: str, ws: WebSocket):
        if lecture_id in self.rooms:
            self.rooms[lecture_id].discard(ws)
            if not self.rooms[lecture_id]:
                del self.rooms[lecture_id]

    async def broadcast(self, lecture_id: str, message: dict):
        for ws in list(self.rooms.get(lecture_id, set())):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(lecture_id, ws)


manager = WSManager()
