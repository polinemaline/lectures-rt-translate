# backend/app/translate_service.py
from __future__ import annotations

import re
from functools import lru_cache
from typing import Tuple

from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

NLLB_TO_ISO = {
    "rus_Cyrl": "ru",
    "eng_Latn": "en",
    "deu_Latn": "de",
    "fra_Latn": "fr",
    "spa_Latn": "es",
    "ita_Latn": "it",
    "por_Latn": "pt",
    "tur_Latn": "tr",
}

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def nllb_to_iso(code: str) -> str:
    if code not in NLLB_TO_ISO:
        raise ValueError(f"Unsupported language code: {code}")
    return NLLB_TO_ISO[code]


@lru_cache(maxsize=32)
def _load_pair(src_iso: str, tgt_iso: str) -> Tuple[AutoTokenizer, AutoModelForSeq2SeqLM]:
    model_name = f"Helsinki-NLP/opus-mt-{src_iso}-{tgt_iso}"
    tok = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    return tok, model


def _translate_one(tok: AutoTokenizer, model: AutoModelForSeq2SeqLM, text: str) -> str:
    inputs = tok(text, return_tensors="pt", truncation=True, max_length=512)
    out = model.generate(
        **inputs,
        num_beams=4,
        max_new_tokens=256,
    )
    return tok.decode(out[0], skip_special_tokens=True).strip()


def _translate_long(tok: AutoTokenizer, model: AutoModelForSeq2SeqLM, text: str) -> str:
    parts = [p.strip() for p in _SENT_SPLIT.split(text) if p.strip()]
    out = []
    for p in parts:
        out.append(_translate_one(tok, model, p))
    return " ".join([x for x in out if x]).strip()


def translate_text(text: str, src_iso: str, tgt_iso: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    if src_iso == tgt_iso:
        return text

    # direct
    try:
        tok, model = _load_pair(src_iso, tgt_iso)
        return _translate_long(tok, model, text)
    except Exception:
        # pivot via English
        if src_iso != "en" and tgt_iso != "en":
            tok1, m1 = _load_pair(src_iso, "en")
            mid = _translate_long(tok1, m1, text)
            tok2, m2 = _load_pair("en", tgt_iso)
            return _translate_long(tok2, m2, mid)
        raise
