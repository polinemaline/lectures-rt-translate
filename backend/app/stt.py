# app/stt.py

import asyncio
from typing import AsyncIterator, Dict, List

# ---------------------------------------------------------
# MOCK STT FUNCTION (ЗАГЛУШКА ДЛЯ ЗАГРУЖЕННОГО ФАЙЛА)
# ---------------------------------------------------------


async def mock_stt_from_file(filepath: str, language: str = "en") -> List[Dict]:
    """
    Простая заглушка, возвращающая один фиксированный сегмент.
    Потом здесь можно подключить реальную STT-модель.

    Args:
        filepath: путь к загруженному аудиофайлу
        language: язык лекции (например: "en", "ru")

    Returns:
        Список сегментов (словарей), совместимых с твоей таблицей segments.
    """

    return [
        {
            "start_ms": 0,
            "end_ms": 3000,
            "text": f"Mock transcription of file: {filepath}",
            "translated_text": None,
            "is_final": True,
            "language": language,
        }
    ]


# ---------------------------------------------------------
# MOCK STREAMING STT (ЗАГЛУШКА ДЛЯ WebSocket / REALTIME)
# ---------------------------------------------------------


async def transcribe_generator(
    lecture_id: int, language: str = "en"
) -> AsyncIterator[Dict]:
    """
    Асинхронный генератор, имитирующий потоковую расшифровку.
    Его можно вызывать из WebSocket-обработчика или фоновой задачи.

    Args:
        lecture_id: ID лекции
        language: язык лекции

    Yields:
        Словари с сегментами (как будто пришли от модели STT).
    """

    # Для примера — 3 "сегмента" с задержкой.
    texts = [
        "This is the first mock segment.",
        "Here goes the second segment.",
        "And this is the final segment.",
    ]

    start = 0
    step = 3000  # длительность сегмента в мс

    for idx, txt in enumerate(texts):
        segment = {
            "lecture_id": lecture_id,
            "start_ms": start,
            "end_ms": start + step,
            "text": txt,
            "translated_text": None,
            "is_final": idx == len(texts) - 1,
            "language": language,
        }

        yield segment

        start += step
        # имитация того, что сегменты приходят со временем
        await asyncio.sleep(0.5)
