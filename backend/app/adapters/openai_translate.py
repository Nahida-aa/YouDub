from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from openai import OpenAI

DEFAULT_CONCURRENCY = 50
API_SETTING_KEYS = ("base_url", "api_key", "model")


SYSTEM_PROMPT = (
    "You are a precise video subtitle translator. Translate each input sentence into natural "
    "Simplified Chinese. Return only the translated sentence. Do not add explanations, labels, "
    "quotes, markdown, or extra whitespace."
)


def list_models(*, base_url: str, api_key: str) -> list[str]:
    if not api_key:
        raise ValueError("OpenAI API key is not configured.")

    client = OpenAI(api_key=api_key, base_url=base_url)
    response = client.models.list()
    seen: set[str] = set()
    models: list[str] = []
    for item in response.data:
        model_id = getattr(item, "id", "")
        if model_id and model_id not in seen:
            seen.add(model_id)
            models.append(model_id)
    return models


def translate_sentence(text: str, *, base_url: str, api_key: str, model: str) -> str:
    if not api_key:
        raise ValueError("OpenAI API key is not configured.")
    client = OpenAI(api_key=api_key, base_url=base_url)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0.2,
    )
    translated = response.choices[0].message.content or ""
    return translated.strip()


def _concurrency_from(settings: dict[str, str]) -> int:
    raw = str(settings.get("translate_concurrency", DEFAULT_CONCURRENCY)).strip() or DEFAULT_CONCURRENCY
    return max(1, int(raw))


def translate_asr(asr_file: Path, session: Path, settings: dict[str, str]) -> Path:
    output_file = session / "metadata" / "translation.zh.json"
    if output_file.exists():
        return output_file

    data = json.loads(asr_file.read_text(encoding="utf-8"))
    utterances = data["result"]["utterances"]
    texts = [u["text"].strip() for u in utterances]

    api_settings = {key: settings[key] for key in API_SETTING_KEYS if key in settings}
    workers = _concurrency_from(settings)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        zhs = list(pool.map(lambda t: translate_sentence(t, **api_settings), texts))

    translation = [
        {"en": text, "zh": zh, "start_time": u["start_time"], "end_time": u["end_time"]}
        for text, zh, u in zip(texts, zhs, utterances)
    ]
    output_file.write_text(json.dumps({"translation": translation}, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_file
