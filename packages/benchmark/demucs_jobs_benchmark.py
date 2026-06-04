import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "submodule" / "demucs"))
from demucs.api import Separator

def run_one(audio_path: str, model: str, jobs: int, shifts: int):
    separator = Separator(model=model, device="cpu", progress=False, shifts=shifts, jobs=jobs)
    t0 = time.perf_counter()
    _, separated = separator.separate_audio_file(audio_path)
    elapsed = time.perf_counter() - t0
    sr = separator.samplerate
    dur = separated["vocals"].shape[-1] / sr
    rtf = elapsed / dur
    return dur, elapsed, rtf

if __name__ == "__main__":
    audio = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "htdemucs"
    jobs_list = [int(v) for v in sys.argv[3].split(",")] if len(sys.argv) > 3 else [0, 2, 4]

    print(f"Audio: {audio}")
    print(f"Model: {model}")
    print(f"Warmup...", end=" ", flush=True)
    Separator(model=model, device="cpu", progress=False, shifts=1, jobs=0)
    print("done\n")

    for j in jobs_list:
        dur, elapsed, rtf = run_one(audio, model, jobs=j, shifts=3)
        print(f"  jobs={j:2d}: {elapsed:7.1f}s wall, {dur:6.1f}s audio, RTF={rtf:.3f}")

    # baseline: shifts=1, jobs=0
    dur, elapsed, rtf = run_one(audio, model, jobs=0, shifts=1)
    print(f"  shifts=1 jobs=0: {elapsed:7.1f}s wall, {dur:6.1f}s audio, RTF={rtf:.3f}")
