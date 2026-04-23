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
    monkeypatch.setattr(asr_sentence_fixer, "_NLP_CACHE", {})
    monkeypatch.setenv("SPACY_MODEL_EN", "__missing__")

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


def test_split_sentences_zh_uses_chinese_punctuation():
    out = asr_sentence_fixer._split_sentences("你好，世界。今天天气真好！是吗？嗯", "zh")
    assert out == ["你好，世界。", "今天天气真好！", "是吗？", "嗯"]


def test_split_sentences_zh_keeps_trailing_quotes():
    out = asr_sentence_fixer._split_sentences('他说：“你好！”她回答：“好。”最后补一句“走吧”？', "zh")
    assert out == ['他说：“你好！”', '她回答：“好。”', '最后补一句“走吧”？']


def test_split_sentences_zh_keeps_trailing_brackets():
    out = asr_sentence_fixer._split_sentences("第一句。（旁白）第二句！）第三句？》尾巴", "zh")
    assert out == ["第一句。", "（旁白）第二句！）", "第三句？》", "尾巴"]


def test_split_sentences_zh_skips_spacy(monkeypatch):
    def boom(_):
        raise AssertionError("should not load spacy for zh")

    monkeypatch.setattr(asr_sentence_fixer, "_load_nlp", boom)
    assert asr_sentence_fixer._split_sentences("一句。", "zh") == ["一句。"]


def test_fix_asr_sentences_handles_chinese_with_punctuation(tmp_path):
    chinese_words = [_word(c, i * 200, (i + 1) * 200) for i, c in enumerate("你好世界今天天气真好")]
    asr = {
        "audio_info": {"duration": 5000},
        "result": {
            "text": "你好世界。今天天气真好。",
            "utterances": [{
                "text": "你好世界。今天天气真好。",
                "start_time": 0,
                "end_time": 2000,
                "words": chinese_words,
            }],
        },
    }
    session = tmp_path / "session"
    (session / "metadata").mkdir(parents=True)
    asr_file = session / "metadata" / "asr.json"
    asr_file.write_text(json.dumps(asr, ensure_ascii=False), encoding="utf-8")

    fixed = asr_sentence_fixer.fix_asr_sentences(asr_file, session, language="zh")
    utts = json.loads(fixed.read_text(encoding="utf-8"))["result"]["utterances"]
    assert [u["text"] for u in utts] == ["你好世界。", "今天天气真好。"]


def test_fix_asr_sentences_falls_back_to_segments_when_no_punct(tmp_path):
    asr = {
        "audio_info": {"duration": 5000},
        "result": {
            "text": "你好世界今天天气真好",
            "utterances": [
                {"text": "你好世界", "start_time": 0, "end_time": 800, "words": []},
                {"text": "今天天气真好", "start_time": 1000, "end_time": 2000, "words": []},
            ],
        },
    }
    session = tmp_path / "session"
    (session / "metadata").mkdir(parents=True)
    asr_file = session / "metadata" / "asr.json"
    asr_file.write_text(json.dumps(asr, ensure_ascii=False), encoding="utf-8")

    fixed = asr_sentence_fixer.fix_asr_sentences(asr_file, session, language="zh")
    utts = json.loads(fixed.read_text(encoding="utf-8"))["result"]["utterances"]
    assert [u["text"] for u in utts] == ["你好世界", "今天天气真好"]


def test_fix_asr_sentences_raises_without_words(tmp_path, monkeypatch):
    monkeypatch.setattr(asr_sentence_fixer, "_NLP_CACHE", {})
    monkeypatch.setenv("SPACY_MODEL_EN", "__missing__")

    session = tmp_path / "session"
    (session / "metadata").mkdir(parents=True)
    asr_file = session / "metadata" / "asr.json"
    asr_file.write_text(
        json.dumps({
            "audio_info": {"duration": 1000},
            "result": {"text": "Hello.", "utterances": [{"text": "Hello.", "start_time": 0, "end_time": 100}]},
        }),
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError):
        asr_sentence_fixer.fix_asr_sentences(asr_file, session)
