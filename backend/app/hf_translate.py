import os

import requests

HF_TOKEN = os.getenv("HF_TOKEN", "")
HF_MODEL = os.getenv("HF_TRANSLATE_MODEL", "facebook/nllb-200-distilled-300M")

# HuggingFace Inference API
API_URL = f"https://api-inference.huggingface.co/models/{HF_MODEL}"


def translate(text: str, src_lang: str, tgt_lang: str) -> str:
    if not HF_TOKEN:
        raise RuntimeError("HF_TOKEN is not set")

    headers = {"Authorization": f"Bearer {HF_TOKEN}"}

    payload = {
        "inputs": text,
        "parameters": {
            # для NLLB удобно передавать src_lang / tgt_lang
            "src_lang": src_lang,
            "tgt_lang": tgt_lang,
        },
    }

    r = requests.post(API_URL, headers=headers, json=payload, timeout=300)
    if r.status_code != 200:
        raise RuntimeError(f"HF error {r.status_code}: {r.text[:1000]}")

    data = r.json()

    # Обычно формат: [{"translation_text": "..."}]
    if isinstance(data, list) and data and "translation_text" in data[0]:
        return data[0]["translation_text"]

    # Иногда HF отдаёт другое — подстрахуемся
    if isinstance(data, dict) and "error" in data:
        raise RuntimeError(f"HF error: {data['error']}")

    return str(data)
