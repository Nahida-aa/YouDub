from __future__ import annotations

import json
import os
import re
from pathlib import Path

_NLP_CACHE: dict[str, object] = {}

SPACY_MODELS = {"en": "en_core_web_sm", "zh": "zh_core_web_sm"}

ZH_SENT_END = "。！？!?；;…"
ZH_SENT_CLOSE = "\"'”’」』）】〕〗〙〛〉》」』"
ZH_SPLIT_RE = re.compile(rf".+?[{ZH_SENT_END}]+[{re.escape(ZH_SENT_CLOSE)}]*|.+$", re.DOTALL)


def _load_nlp(language: str):
    if language in _NLP_CACHE:
        return _NLP_CACHE[language]

    import spacy

    name = os.getenv(f"SPACY_MODEL_{language.upper()}") or SPACY_MODELS.get(language, "en_core_web_sm")
    try:
        nlp = spacy.load(name)
    except OSError:
        nlp = spacy.blank(language)
        if "sentencizer" not in nlp.pipe_names:
            nlp.add_pipe("sentencizer")
    _NLP_CACHE[language] = nlp
    return nlp


def _split_sentences_zh(text: str) -> list[str]:
    return [m.group(0).strip() for m in ZH_SPLIT_RE.finditer(text) if m.group(0).strip()]


def _normalize(text: str) -> str:
    return re.sub(r"[\s\W_]+", "", text.lower(), flags=re.UNICODE)


def _collect_words(utterances: list) -> list:
    words = []
    for utt in utterances:
        for word in utt.get("words", []):
            if word.get("start_time", -1) < 0 or word.get("end_time", -1) < 0:
                continue
            if not word.get("text", "").strip():
                continue
            words.append(word)
    return words


def _split_sentences(text: str, language: str) -> list:
    if language == "zh":
        return _split_sentences_zh(text)
    nlp = _load_nlp(language)
    return [sent.text.strip() for sent in nlp(text).sents if sent.text.strip()]


def _match_sentence(sentence: str, words: list, cursor: int) -> tuple:
    """Return (start_ms, end_ms, next_cursor) by greedy seq-match."""
    target = _normalize(sentence)
    if not target:
        return None, None, cursor

    start_idx = cursor
    while start_idx < len(words):
        head = _normalize(words[start_idx]["text"])
        if head and target.startswith(head):
            break
        start_idx += 1

    if start_idx >= len(words):
        return None, None, cursor

    buffer = ""
    end_idx = start_idx
    while end_idx < len(words):
        buffer += _normalize(words[end_idx]["text"])
        end_idx += 1
        if target in buffer:
            break
        if len(buffer) > len(target) * 2:
            break

    if target not in buffer:
        return None, None, cursor

    return words[start_idx]["start_time"], words[end_idx - 1]["end_time"], end_idx


def _start_pad(idx: int, utts: list, start_pad: int, end_pad: int, min_gap: int) -> int:
    orig_start = utts[idx]["start_time"]
    if idx == 0:
        return max(0, orig_start - start_pad)

    prev_end = utts[idx - 1]["end_time"]
    gap = orig_start - prev_end
    total = start_pad + end_pad

    if gap >= total + min_gap:
        return orig_start - start_pad
    if gap > min_gap:
        share = int((gap - min_gap) * start_pad / total)
        return orig_start - share
    return prev_end + gap // 2


def _end_pad(idx: int, utts: list, duration: int, start_pad: int, end_pad: int, min_gap: int) -> int:
    orig_end = utts[idx]["end_time"]
    if idx == len(utts) - 1:
        return min(duration, orig_end + end_pad) if duration else orig_end + end_pad

    next_start = utts[idx + 1]["start_time"]
    gap = next_start - orig_end
    total = start_pad + end_pad

    if gap >= total + min_gap:
        return orig_end + end_pad
    if gap > min_gap:
        share = int((gap - min_gap) * end_pad / total)
        return orig_end + share
    return orig_end + gap // 2


def _apply_padding(utts: list, duration: int, start_pad: int = 100, end_pad: int = 300) -> list:
    if not utts:
        return utts

    min_gap = 50
    result = []
    for idx in range(len(utts)):
        new_start = _start_pad(idx, utts, start_pad, end_pad, min_gap)
        new_end = _end_pad(idx, utts, duration, start_pad, end_pad, min_gap)
        clamped_end = min(duration, new_end) if duration else new_end
        result.append({
            **utts[idx],
            "start_time": max(0, new_start),
            "end_time": clamped_end,
        })
    return result


def _resegment(full_text: str, utterances: list, language: str) -> list:
    has_punct = any(p in full_text for p in ZH_SENT_END + ".!?")
    if not has_punct:
        return [
            {"text": u["text"].strip(), "start_time": u["start_time"], "end_time": u["end_time"]}
            for u in utterances if u.get("text", "").strip()
        ]

    words = _collect_words(utterances)
    if not words:
        raise RuntimeError("ASR result has no word-level timestamps; cannot re-segment.")

    new_utts = []
    cursor = 0
    for sent in _split_sentences(full_text, language):
        start, end, cursor = _match_sentence(sent, words, cursor)
        if start is None:
            continue
        new_utts.append({"text": sent, "start_time": start, "end_time": end})
    return new_utts


def fix_asr_sentences(asr_file: Path, session: Path,
                     start_pad: int = 100, end_pad: int = 300,
                     language: str = "en") -> Path:
    output_file = session / "metadata" / "asr_fixed.json"
    if output_file.exists():
        return output_file

    data = json.loads(Path(asr_file).read_text(encoding="utf-8"))
    full_text = data["result"]["text"]
    utterances = data["result"]["utterances"]
    duration = data.get("audio_info", {}).get("duration", 0)

    new_utts = _resegment(full_text, utterances, language)
    if not new_utts:
        raise RuntimeError("Sentence fixer produced zero sentences.")

    padded = _apply_padding(new_utts, duration, start_pad, end_pad)
    payload = {
        "audio_info": data.get("audio_info", {}),
        "result": {"text": full_text, "utterances": padded},
    }
    output_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_file
