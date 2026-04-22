from __future__ import annotations

import json
import threading
import time

from backend.app.adapters import openai_translate


def _write_asr(path, n: int) -> None:
    path.write_text(
        json.dumps(
            {
                "result": {
                    "utterances": [
                        {"text": f"S{i}.", "start_time": i * 1000, "end_time": (i + 1) * 1000}
                        for i in range(n)
                    ]
                }
            }
        ),
        encoding="utf-8",
    )


def test_translate_asr_calls_once_per_utterance(monkeypatch, tmp_path):
    metadata = tmp_path / "metadata"
    metadata.mkdir()
    asr_file = metadata / "asr.json"
    _write_asr(asr_file, 2)

    calls: list[str] = []
    lock = threading.Lock()

    def fake_translate(text, **settings):
        with lock:
            calls.append(text)
        return f"zh:{text}"

    monkeypatch.setattr(openai_translate, "translate_sentence", fake_translate)

    output = openai_translate.translate_asr(
        asr_file,
        tmp_path,
        {"base_url": "https://example.com/v1", "api_key": "sk-test", "model": "model"},
    )

    assert sorted(calls) == ["S0.", "S1."]
    data = json.loads(output.read_text(encoding="utf-8"))
    assert [item["zh"] for item in data["translation"]] == ["zh:S0.", "zh:S1."]


def test_translate_asr_runs_in_parallel(monkeypatch, tmp_path):
    metadata = tmp_path / "metadata"
    metadata.mkdir()
    asr_file = metadata / "asr.json"
    _write_asr(asr_file, 8)

    def slow_translate(text, **settings):
        time.sleep(0.2)
        return f"zh:{text}"

    monkeypatch.setattr(openai_translate, "translate_sentence", slow_translate)

    start = time.perf_counter()
    openai_translate.translate_asr(
        asr_file,
        tmp_path,
        {
            "base_url": "https://example.com/v1",
            "api_key": "sk-test",
            "model": "model",
            "translate_concurrency": "8",
        },
    )
    elapsed = time.perf_counter() - start

    assert elapsed < 0.8, f"expected concurrent execution, took {elapsed:.2f}s"


def test_translate_asr_filters_non_api_settings(monkeypatch, tmp_path):
    metadata = tmp_path / "metadata"
    metadata.mkdir()
    asr_file = metadata / "asr.json"
    _write_asr(asr_file, 1)

    received: list[dict] = []

    def fake_translate(text, **settings):
        received.append(settings)
        return f"zh:{text}"

    monkeypatch.setattr(openai_translate, "translate_sentence", fake_translate)

    openai_translate.translate_asr(
        asr_file,
        tmp_path,
        {
            "base_url": "https://example.com/v1",
            "api_key": "sk-test",
            "model": "model",
            "translate_concurrency": "4",
        },
    )

    assert received == [{"base_url": "https://example.com/v1", "api_key": "sk-test", "model": "model"}]
