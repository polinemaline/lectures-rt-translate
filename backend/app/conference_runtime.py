from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Dict, List, Set

from starlette.websockets import WebSocket


@dataclass
class Room:
    code: str
    active: bool = True
    history: List[str] = field(default_factory=list)
    sockets: Set[WebSocket] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class ConferenceRuntime:
    def __init__(self) -> None:
        self._rooms: Dict[str, Room] = {}

    def get_room(self, code: str) -> Room:
        code = code.strip().upper()
        if code not in self._rooms:
            self._rooms[code] = Room(code=code)
        return self._rooms[code]

    def get_history(self, code: str, limit: int = 5000) -> List[str]:
        r = self.get_room(code)
        return r.history[-limit:]

    async def join(self, code: str, ws: WebSocket) -> Room:
        room = self.get_room(code)
        async with room.lock:
            room.sockets.add(ws)
        return room

    async def leave(self, code: str, ws: WebSocket) -> None:
        room = self.get_room(code)
        async with room.lock:
            room.sockets.discard(ws)

    async def add_segment(self, code: str, text: str) -> None:
        room = self.get_room(code)
        if not room.active:
            return
        text = (text or "").strip()
        if not text:
            return

        async with room.lock:
            room.history.append(text)
            sockets = list(room.sockets)

        # broadcast
        payload = {"type": "segment", "text": text}
        await self._broadcast(sockets, payload)

    async def end(self, code: str) -> None:
        room = self.get_room(code)
        async with room.lock:
            room.active = False
            sockets = list(room.sockets)

        await self._broadcast(sockets, {"type": "ended"})

    async def _broadcast(self, sockets: List[WebSocket], payload: dict) -> None:
        dead = []
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        # чистим упавшие
        for ws in dead:
            try:
                ws.close()
            except Exception:
                pass
