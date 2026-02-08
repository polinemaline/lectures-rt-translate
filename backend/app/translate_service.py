# backend/app/translate_service.py
from __future__ import annotations

import os
import re
from functools import lru_cache
from typing import Tuple

import torch
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

# настройки, чтобы не упираться в лимиты и не душить CPU
MAX_INPUT_TOKENS = int(os.getenv("TRANSLATE_MAX_INPUT_TOKENS", "420"))  # вход
MAX_NEW_TOKENS = int(os.getenv("TRANSLATE_MAX_NEW_TOKENS", "256"))      # выход
NUM_BEAMS = int(os.getenv("TRANSLATE_NUM_BEAMS", "2"))                 # 2 быстрее, чем 4
DEVICE = "cpu"


def nllb_to_iso(code: str) -> str:
    if code not in NLLB_TO_ISO:
        raise ValueError(f"Unsupported language code: {code}")
    return NLLB_TO_ISO[code]


@lru_cache(maxsize=32)
def _load_pair(src_iso: str, tgt_iso: str) -> Tuple[AutoTokenizer, AutoModelForSeq2SeqLM]:
    model_name = f"Helsinki-NLP/opus-mt-{src_iso}-{tgt_iso}"
    tok = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    model.to(DEVICE)
    model.eval()
    return tok, model


def _translate_one(tok: AutoTokenizer, model: AutoModelForSeq2SeqLM, text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""

    # truncate по токенам (а не по символам)
    inputs = tok(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=MAX_INPUT_TOKENS,
    )
    inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

    with torch.no_grad():
        out = model.generate(
            **inputs,
            num_beams=NUM_BEAMS,
            max_new_tokens=MAX_NEW_TOKENS,
            do_sample=False,
        )

    return tok.decode(out[0], skip_special_tokens=True).strip()


def _split_sentences(text: str) -> list[str]:
    # бережно режем, чтобы не отправлять огромный кусок
    parts = [p.strip() for p in _SENT_SPLIT.split(text or "") if p.strip()]
    return parts if parts else [text.strip()] if text.strip() else []


def _translate_long(tok: AutoTokenizer, model: AutoModelForSeq2SeqLM, text: str) -> str:
    parts = _split_sentences(text)
    out = []
    for p in parts:
        try:
            out.append(_translate_one(tok, model, p))
        except Exception:
            # если один кусок упал — не убиваем весь перевод
            out.append(p)
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
        tr = _translate_long(tok, model, text)
        return tr if tr.strip() else text
    except Exception:
        # pivot via English
        try:
            if src_iso != "en" and tgt_iso != "en":
                tok1, m1 = _load_pair(src_iso, "en")
                mid = _translate_long(tok1, m1, text) or text
                tok2, m2 = _load_pair("en", tgt_iso)
                tr = _translate_long(tok2, m2, mid)
                return tr if tr.strip() else text
        except Exception:
            pass

    # абсолютный fallback — не пустота
    return text
