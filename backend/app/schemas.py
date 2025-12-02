from typing import List, Optional

from pydantic import BaseModel


class SegmentCreate(BaseModel):
    start_ms: int
    end_ms: int
    text: str
    translated_text: Optional[str] = None
    is_final: bool = True


class SegmentOut(BaseModel):
    id: int
    start_ms: int
    end_ms: int
    text: str
    translated_text: Optional[str]
    is_final: bool

    class Config:
        from_attributes = True


class LectureCreate(BaseModel):
    title: str
    language: str = "en"


class LectureOut(BaseModel):
    id: int
    title: str
    language: str

    class Config:
        from_attributes = True


class LectureDetail(LectureOut):
    segments: List[SegmentOut] = []
