from __future__ import annotations

import json

import pytest

spacy = pytest.importorskip("spacy")

from backend.app.adapters import asr_sentence_fixer


def _word(text: str, start: int, end: int) -> dict:
    return {"text": text, "start_time": start, "end_time": end}


def _make_asr() -> dict:
    return {
        "audio_info": {"duration": 10000},
        "result": {
            "text": "Hello world. This is fine.",
            "utterances": [
                {
                    "text": "Hello world. This is fine.",
                    "start_time": 100,
                    "end_time": 4000,
                    "words": [
                        _word("Hello", 100, 500),
                        _word("world.", 600, 1200),
                        _word("This", 1500, 1800),
                        _word("is", 1900, 2100),
                        _word("fine.", 2200, 2900),
                    ],
                }
            ],
        },
    }


def test_fix_asr_sentences_splits_using_word_timestamps(tmp_path, monkeypatch):
    monkeypatch.setattr(asr_sentence_fixer, "_NLP", None)
    monkeypatch.setenv("SPACY_MODEL", "__missing__")

    session = tmp_path / "session"
    (session / "metadata").mkdir(parents=True)
    asr_file = session / "metadata" / "asr.json"
    asr_file.write_text(json.dumps(_make_asr()), encoding="utf-8")

    fixed = asr_sentence_fixer.fix_asr_sentences(asr_file, session, start_pad=50, end_pad=100)
    data = json.loads(fixed.read_text(encoding="utf-8"))
    utts = data["result"]["utterances"]

    assert len(utts) == 2
    assert utts[0]["text"].startswith("Hello")
    assert utts[1]["text"].startswith("This")
    assert utts[0]["start_time"] >= 0
    assert utts[0]["end_time"] >= utts[0]["start_time"]
    assert utts[1]["start_time"] > utts[0]["end_time"]


def test_fix_asr_sentences_raises_without_words(tmp_path, monkeypatch):
    monkeypatch.setattr(asr_sentence_fixer, "_NLP", None)
    monkeypatch.setenv("SPACY_MODEL", "__missing__")

    session = tmp_path / "session"
    (session / "metadata").mkdir(parents=True)
    asr_file = session / "metadata" / "asr.json"
    asr_file.write_text(
        json.dumps({
            "audio_info": {"duration": 1000},
            "result": {"text": "x", "utterances": [{"text": "x", "start_time": 0, "end_time": 100}]},
        }),
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError):
        asr_sentence_fixer.fix_asr_sentences(asr_file, session)
