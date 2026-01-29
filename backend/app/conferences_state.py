# backend/app/conferences_state.py
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from fastapi import WebSocket


@dataclass
class Segment:
    ts: float
    text: str


@dataclass
class ConferenceRuntime:
    id: int
    code: str
    title: str
    organizer_user_id: Optional[int] = None
    created_at: float = field(default_factory=lambda: time.time())
    is_active: bool = True
    segments: List[Segment] = field(default_factory=list)
    sockets: Set[WebSocket] = field(default_factory=set)


class ConferencesRuntimeStore:
    def __init__(self) -> None:
        self.by_code: Dict[str, ConferenceRuntime] = {}

    def attach(self, conf_id: int, code: str, title: str) -> ConferenceRuntime:
        if code not in self.by_code:
            self.by_code[code] = ConferenceRuntime(id=conf_id, code=code, title=title)
        return self.by_code[code]

    def get(self, code: str) -> Optional[ConferenceRuntime]:
        return self.by_code.get(code)

    def add_segment(self, code: str, text: str) -> Segment:
        conf = self.by_code[code]
        seg = Segment(ts=time.time(), text=text)
        conf.segments.append(seg)
        return seg

    def end(self, code: str) -> None:
        conf = self.by_code.get(code)
        if conf:
            conf.is_active = False

    def history(self, code: str, limit: int = 200) -> List[str]:
        conf = self.by_code[code]
        return [s.text for s in conf.segments[-limit:] if s.text.strip()]


RUNTIME = ConferencesRuntimeStore()
