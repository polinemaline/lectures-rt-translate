import asyncio


async def mock_translate_text(text: str, target_lang: str = "ru") -> str:
    await asyncio.sleep(0.3)
    return f"Перевод: {text}"
