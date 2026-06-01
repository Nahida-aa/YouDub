"""Python VoxCPM benchmark — times from_pretrained() and generate() for various input lengths."""

import os
import sys
import time
import json
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'backend'))

REF_WAV = Path(__file__).parent / "ref.wav"
RESULTS_DIR = Path(__file__).parent / "results"

TEXTS = {
    "short": "你好。",
    "medium": "今天天气真不错，我们一起去公园散步吧。",
    "long": "请播放一段关于人工智能发展的新闻。近年来，人工智能技术在各个领域都取得了显著的进展，从自然语言处理到计算机视觉，再到自动驾驶，AI正在改变我们的生活方式。",
}


def run(text_key: str = "medium", device: str = "cpu", timesteps: int = 10) -> dict:
    from voxcpm import VoxCPM
    from app.adapters.voxcpm import _model_path

    md = _model_path()
    text = TEXTS[text_key]

    t0 = time.perf_counter()
    model = VoxCPM.from_pretrained(str(md), load_denoiser=False, device=device)
    load_time = time.perf_counter() - t0

    t0 = time.perf_counter()
    wav = model.generate(
        text=text,
        reference_wav_path=str(REF_WAV),
        cfg_value=2.0,
        inference_timesteps=timesteps,
    )
    gen_time = time.perf_counter() - t0

    return {
        "engine": "python",
        "device": device,
        "text_key": text_key,
        "text_len": len(text),
        "timesteps": timesteps,
        "load_time_s": round(load_time, 3),
        "generate_time_s": round(gen_time, 3),
        "total_time_s": round(load_time + gen_time, 3),
        "output_samples": len(wav),
        "output_duration_s": round(len(wav) / 48000, 3),
    }


def main():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    for key in TEXTS:
        print(f"\nBenchmarking text=\"{key}\"...")
        r = run(text_key=key, device="cpu", timesteps=10)
        results.append(r)
        print(json.dumps(r, indent=2, ensure_ascii=False))

    summary_path = RESULTS_DIR / "py-cpu.json"
    summary_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSummary saved to {summary_path}")


if __name__ == "__main__":
    main()
