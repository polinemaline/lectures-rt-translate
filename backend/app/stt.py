from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
import time
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator, Dict, List, Literal

from faster_whisper import WhisperModel

SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2  # s16le

BUFFER_SECONDS = float(os.getenv("LIVE_STT_BUFFER_SECONDS", "12"))
MIN_UPDATE_SECONDS = float(os.getenv("LIVE_STT_MIN_UPDATE_SECONDS", "0.8"))
MODEL_SIZE = os.getenv("LIVE_STT_MODEL_SIZE", "small")
DEVICE = os.getenv("LIVE_STT_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("LIVE_STT_COMPUTE_TYPE", "int8")
TEMP_DIR = Path(os.getenv("LIVE_STT_TMP_DIR", "/tmp/live-stt"))
TEMP_DIR.mkdir(parents=True, exist_ok=True)

MAX_BUFFER_BYTES = int(BUFFER_SECONDS * SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH)
MIN_UPDATE_BYTES = int(MIN_UPDATE_SECONDS * SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH)

WHISPER_LANGUAGE = {
    "rus_Cyrl": "ru",
    "eng_Latn": "en",
    "deu_Latn": "de",
    "fra_Latn": "fr",
    "spa_Latn": "es",
    "ita_Latn": "it",
    "por_Latn": "pt",
    "tur_Latn": "tr",
    "ru": "ru",
    "en": "en",
    "de": "de",
    "fr": "fr",
    "es": "es",
    "it": "it",
    "pt": "pt",
    "tr": "tr",
}

_model: WhisperModel | None = None


@dataclass
class LiveCaptionEvent:
    kind: Literal["partial", "final"]
    text: str


@dataclass
class LiveTranscriberSession:
    pcm_buffer: bytearray = field(default_factory=bytearray)
    bytes_since_update: int = 0
    partial_text: str = ""
    partial_stable_hits: int = 0
    final_lines: List[str] = field(default_factory=list)
    updated_at: float = field(default_factory=time.monotonic)

    def append_pcm(self, pcm_bytes: bytes) -> None:
        if not pcm_bytes:
            return
        self.pcm_buffer.extend(pcm_bytes)
        if len(self.pcm_buffer) > MAX_BUFFER_BYTES:
            overflow = len(self.pcm_buffer) - MAX_BUFFER_BYTES
            del self.pcm_buffer[:overflow]
        self.bytes_since_update += len(pcm_bytes)
        self.updated_at = time.monotonic()

    def should_transcribe(self) -> bool:
        return self.bytes_since_update >= MIN_UPDATE_BYTES

    def mark_transcribed(self) -> bytes:
        self.bytes_since_update = 0
        return bytes(self.pcm_buffer)


_SESSIONS: Dict[str, LiveTranscriberSession] = {}


def _normalize(text: str) -> str:
    return " ".join((text or "").strip().lower().split())


def _same_text(a: str, b: str) -> bool:
    return _normalize(a) == _normalize(b)


def _looks_final(text: str) -> bool:
    text = (text or "").strip()
    return bool(text) and text[-1] in ".!?"


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            cpu_threads=max(os.cpu_count() or 1, 1),
        )
    return _model


def _language_for_whisper(language: str | None) -> str:
    if not language:
        return "en"
    return WHISPER_LANGUAGE.get(language, language)


def _decode_chunk_to_pcm(chunk: bytes) -> bytes:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-ac",
            str(CHANNELS),
            "-ar",
            str(SAMPLE_RATE),
            "-f",
            "s16le",
            "pipe:1",
        ],
        input=chunk,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            proc.stderr.decode("utf-8", errors="ignore") or "ffmpeg decode failed"
        )
    return proc.stdout


def _write_temp_wav(pcm_bytes: bytes) -> str:
    fd, path = tempfile.mkstemp(
        prefix="live-caption-", suffix=".wav", dir=str(TEMP_DIR)
    )
    os.close(fd)
    with wave.open(path, "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(SAMPLE_WIDTH)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm_bytes)
    return path


def _transcribe_audio_file(filepath: str, language: str | None) -> List[Dict]:
    model = _get_model()
    whisper_lang = _language_for_whisper(language)

    segments, _ = model.transcribe(
        filepath,
        language=whisper_lang,
        beam_size=1,
        best_of=1,
        temperature=0.0,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 250},
        condition_on_previous_text=False,
        without_timestamps=False,
        word_timestamps=False,
    )

    out: List[Dict] = []
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        out.append(
            {
                "start_ms": int(float(seg.start) * 1000),
                "end_ms": int(float(seg.end) * 1000),
                "text": text,
                "translated_text": None,
                "is_final": True,
                "language": whisper_lang,
            }
        )

    return out


def _transcribe_pcm_snapshot(pcm_bytes: bytes, source_lang: str) -> List[str]:
    if not pcm_bytes:
        return []

    wav_path = _write_temp_wav(pcm_bytes)
    try:
        segments = _transcribe_audio_file(wav_path, source_lang)
        return [seg["text"] for seg in segments if seg.get("text")]
    finally:
        try:
            os.remove(wav_path)
        except OSError:
            pass


def _merge_transcript(
    session: LiveTranscriberSession,
    lines: List[str],
    flush: bool = False,
) -> List[LiveCaptionEvent]:
    events: List[LiveCaptionEvent] = []

    if not lines:
        if flush and session.partial_text:
            if not session.final_lines or not _same_text(
                session.final_lines[-1], session.partial_text
            ):
                session.final_lines.append(session.partial_text)
                events.append(LiveCaptionEvent(kind="final", text=session.partial_text))
        session.partial_text = ""
        session.partial_stable_hits = 0
        return events

    final_candidates = lines[:-1] if len(lines) > 1 else []
    partial_candidate = lines[-1] if lines else ""

    for line in final_candidates:
        if not line:
            continue
        if session.final_lines and _same_text(session.final_lines[-1], line):
            continue
        session.final_lines.append(line)
        events.append(LiveCaptionEvent(kind="final", text=line))
        if session.partial_text and _same_text(session.partial_text, line):
            session.partial_text = ""
            session.partial_stable_hits = 0

    if not partial_candidate:
        return events

    if session.final_lines and _same_text(session.final_lines[-1], partial_candidate):
        session.partial_text = ""
        session.partial_stable_hits = 0
        return events

    if session.partial_text and _same_text(session.partial_text, partial_candidate):
        session.partial_stable_hits += 1
    else:
        session.partial_text = partial_candidate
        session.partial_stable_hits = 0
        if not flush:
            events.append(LiveCaptionEvent(kind="partial", text=partial_candidate))

    should_finalize = flush or (
        _looks_final(partial_candidate) and session.partial_stable_hits >= 1
    )
    if should_finalize:
        if not session.final_lines or not _same_text(
            session.final_lines[-1], partial_candidate
        ):
            session.final_lines.append(partial_candidate)
            events.append(LiveCaptionEvent(kind="final", text=partial_candidate))
        session.partial_text = ""
        session.partial_stable_hits = 0

    return events


async def process_live_audio_chunk(
    code: str, chunk: bytes, source_lang: str
) -> List[LiveCaptionEvent]:
    code = (code or "").strip().upper()
    session = _SESSIONS.setdefault(code, LiveTranscriberSession())

    pcm_bytes = await asyncio.to_thread(_decode_chunk_to_pcm, chunk)
    session.append_pcm(pcm_bytes)

    if not session.should_transcribe():
        return []

    snapshot = session.mark_transcribed()
    lines = await asyncio.to_thread(_transcribe_pcm_snapshot, snapshot, source_lang)
    return _merge_transcript(session, lines, flush=False)


async def flush_live_session(code: str, source_lang: str) -> List[LiveCaptionEvent]:
    code = (code or "").strip().upper()
    session = _SESSIONS.get(code)
    if session is None:
        return []

    if session.pcm_buffer:
        lines = await asyncio.to_thread(
            _transcribe_pcm_snapshot, bytes(session.pcm_buffer), source_lang
        )
        return _merge_transcript(session, lines, flush=True)

    return _merge_transcript(session, [], flush=True)


def reset_live_session(code: str) -> None:
    code = (code or "").strip().upper()
    _SESSIONS.pop(code, None)


# ---------------------------------------------------------
# Compatibility layer for old app/api.py
# ---------------------------------------------------------


async def mock_stt_from_file(filepath: str, language: str = "en") -> List[Dict]:
    if not filepath or not os.path.exists(filepath):
        return [
            {
                "start_ms": 0,
                "end_ms": 0,
                "text": f"File not found: {filepath}",
                "translated_text": None,
                "is_final": True,
                "language": _language_for_whisper(language),
            }
        ]

    try:
        segments = await asyncio.to_thread(_transcribe_audio_file, filepath, language)
        if segments:
            return segments
    except Exception:
        pass

    return [
        {
            "start_ms": 0,
            "end_ms": 3000,
            "text": f"Mock transcription of file: {filepath}",
            "translated_text": None,
            "is_final": True,
            "language": _language_for_whisper(language),
        }
    ]


async def transcribe_generator(
    lecture_id: int,
    language: str = "en",
) -> AsyncIterator[Dict]:
    texts = [
        "This is the first mock segment.",
        "Here goes the second segment.",
        "And this is the final segment.",
    ]
    start = 0
    step = 3000

    for idx, txt in enumerate(texts):
        segment = {
            "lecture_id": lecture_id,
            "start_ms": start,
            "end_ms": start + step,
            "text": txt,
            "translated_text": None,
            "is_final": idx == len(texts) - 1,
            "language": _language_for_whisper(language),
        }
        yield segment
        start += step
        await asyncio.sleep(0.5)
