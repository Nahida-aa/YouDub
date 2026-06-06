import json, os, sys, time, math, struct
from pathlib import Path
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

MODEL_DIR = os.environ.get("VOXCPM_MODEL_DIR",
    str(Path(__file__).parent.parent.parent.parent.parent / "data/modelscope/OpenBMB__VoxCPM2"))

os.environ.setdefault("HSA_OVERRIDE_GFX_VERSION", "11.0.0")

CFG = {
    "patchSize": 4,
    "featDim": 64,
    "chunkSize": 640,
    "sampleRate": 16000,
    "outSampleRate": 48000,
    "maxLen": 2000,
    "minLen": 2,
    "defaultCfgValue": 2.0,
    "audioStartToken": 101,
    "audioEndToken": 102,
    "refAudioStartToken": 103,
    "refAudioEndToken": 104,
}

SESS_OPTS = {"providers": ["CPUExecutionProvider"]}

def _is_cjk(c):
    code = ord(c)
    return (0x4E00 <= code <= 0x9FFF or 0x3400 <= code <= 0x4DBF or 0xF900 <= code <= 0xFAFF)

def load_tokenizer_vocab(tok_path):
    with open(tok_path) as f:
        return json.load(f)["model"]["vocab"]

def tokenize_text(text, tokenizer, vocab, bos_id=1):
    result = tokenizer.encode(text)
    ids = result.ids
    if ids and ids[0] == bos_id:
        ids = ids[1:]
    expanded = []
    special_ids = {101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112}
    for tid in ids:
        if tid in special_ids:
            expanded.append(tid)
            continue
        token = result.tokens[result.ids.index(tid)]
        clean = token.replace("\u2581", "")
        if len(clean) >= 2 and all(_is_cjk(c) for c in clean):
            char_ids = [vocab.get(c) for c in clean]
            char_ids = [c for c in char_ids if c is not None]
            if len(char_ids) == len(clean):
                expanded.extend(char_ids)
                continue
        expanded.append(tid)
    return expanded

def read_wav(path):
    with open(path, "rb") as f:
        data = f.read()
    sr = struct.unpack_from("<I", data, 24)[0]
    nch = struct.unpack_from("<H", data, 22)[0]
    bps = struct.unpack_from("<H", data, 34)[0]
    data_start = struct.unpack_from("<I", data, 40)[0] + 8
    if data_start > len(data):
        data_start = 44
    raw = data[data_start:]
    if bps == 16:
        samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif bps == 32:
        samples = np.frombuffer(raw, dtype="<f4")
    else:
        raise ValueError(f"Unsupported bit depth: {bps}")
    if nch > 1:
        samples = samples[::nch]
    return samples, sr

def resample(audio, from_rate, to_rate):
    ratio = to_rate / from_rate
    out_len = int(round(len(audio) * ratio))
    output = np.zeros(out_len, dtype=np.float32)
    for i in range(out_len):
        pos = i / ratio
        idx = int(math.floor(pos))
        frac = pos - idx
        a = audio[min(idx, len(audio) - 1)]
        b = audio[min(idx + 1, len(audio) - 1)]
        output[i] = a + (b - a) * frac
    return output

def write_wav(samples, path, sr=48000):
    samples = np.clip(samples, -1.0, 1.0)
    int_samples = (samples * 32767).astype("<i2")
    data_size = len(int_samples) * 2
    with open(path, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))
        f.write(struct.pack("<H", 1))
        f.write(struct.pack("<H", 1))
        f.write(struct.pack("<I", sr))
        f.write(struct.pack("<I", sr * 2))
        f.write(struct.pack("<H", 2))
        f.write(struct.pack("<H", 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(int_samples.tobytes())

def main():
    task = json.loads(sys.argv[1])
    vocals_dir = task["vocalsDir"]
    translation_file = task["translationFile"]
    tts_dir = task["ttsDir"]
    cfg_value = float(task.get("cfgValue", CFG["defaultCfgValue"]))

    import warnings
    warnings.filterwarnings("ignore", message="Init provider bridge failed")
    warnings.filterwarnings("ignore", category=UserWarning)

    print(f"[TTS] Loading tokenizer...", flush=True)
    tokenizer = Tokenizer.from_file(f"{MODEL_DIR}/tokenizer.json")
    vocab = load_tokenizer_vocab(f"{MODEL_DIR}/tokenizer.json")

    with open(translation_file) as f:
        items = json.load(f)["translation"]

    fallback_ref = None
    for i in range(len(items)):
        idx = f"{i+1:04d}"
        path = f"{vocals_dir}/{idx}.wav"
        if os.path.exists(path) and os.path.getsize(path) > 1200 * 16 * 2:
            fallback_ref = path
            break
    if fallback_ref is None:
        fallback_ref = f"{vocals_dir}/0001.wav"

    for i, item in enumerate(items):
        idx = f"{i+1:04d}"
        out_path = f"{tts_dir}/{idx}.wav"
        if os.path.exists(out_path):
            continue

        text = item.get("dst") or item.get("zh") or ""
        if not text.strip():
            write_wav(np.zeros(0, dtype=np.float32), out_path)
            continue

        ref_wav = f"{vocals_dir}/{idx}.wav"
        if not os.path.exists(ref_wav) or os.path.getsize(ref_wav) < 1200 * 16 * 2:
            ref_wav = fallback_ref
        if not ref_wav or not os.path.exists(ref_wav):
            print(f"[WARN] [TTS] No reference for segment {idx}, skipping", flush=True)
            write_wav(np.zeros(0, dtype=np.float32), out_path)
            continue

        print(f"[TTS] Generating {i+1}/{len(items)}...", flush=True)

        # Load VAE encoder → encode ref → release
        print(f"[TTS] Loading VAE encoder...", flush=True)
        vae_enc = ort.InferenceSession(f"{MODEL_DIR}/audio_vae_encoder.onnx", **SESS_OPTS)
        ref_feat = _encode_wav(vae_enc, ref_wav)
        del vae_enc

        # Tokenize
        text_ids = tokenize_text(text, tokenizer, vocab)
        text_len = len(text_ids)
        auto_max_patches = max(20, math.ceil(text_len * 6))
        max_patches = int(task.get("maxPatches", auto_max_patches))

        ref_patches = ref_feat.shape[0]
        total_len = 2 + ref_patches + text_len + 1
        zero_feat = np.zeros(CFG["featDim"], dtype=np.float32)

        text_tokens = []
        text_mask = []
        feat_mask = []
        flat_feat = np.zeros((total_len, CFG["patchSize"], CFG["featDim"]), dtype=np.float32)

        def push_token(tok, tmask, fmask, feat):
            pos = len(text_tokens)
            text_tokens.append(int(tok))
            text_mask.append(tmask)
            feat_mask.append(fmask)
            for p in range(CFG["patchSize"]):
                flat_feat[pos, p] = feat

        push_token(CFG["refAudioStartToken"], 1, 0, zero_feat)
        for pi in range(ref_patches):
            push_token(0, 0, 1, ref_feat[pi])
        push_token(CFG["refAudioEndToken"], 1, 0, zero_feat)
        for tid in text_ids:
            push_token(tid, 1, 0, zero_feat)
        push_token(CFG["audioStartToken"], 1, 0, zero_feat)

        # Load prefill → run → release
        print(f"[TTS] Loading prefill model...", flush=True)
        prefill = ort.InferenceSession(f"{MODEL_DIR}/voxcpm2_prefill.onnx", **SESS_OPTS)
        feeds = {
            "text": np.array([text_tokens], dtype=np.int64),
            "text_mask": np.array([text_mask], dtype=np.int32),
            "feat": flat_feat[np.newaxis, ...],
            "feat_mask": np.array([feat_mask], dtype=np.int32),
        }
        pf_out = prefill.run(None, feeds)
        dit_hidden, base_keys, base_vals, res_keys, res_vals, prefix_cond = pf_out
        del prefill

        # Load decode → loop → release
        print(f"[TTS] Loading decode model...", flush=True)
        decode = ort.InferenceSession(f"{MODEL_DIR}/voxcpm2_decode_step.onnx", **SESS_OPTS)

        pred_patches = []
        for step in range(max_patches):
            noise = np.random.randn(1, CFG["patchSize"], CFG["featDim"]).astype(np.float32)
            dec_feeds = {
                "dit_hidden": dit_hidden,
                "base_next_keys": base_keys,
                "base_next_values": base_vals,
                "residual_next_keys": res_keys,
                "residual_next_values": res_vals,
                "prefix_feat_cond": prefix_cond,
                "noise": noise,
                "cfg_value": np.array(cfg_value, dtype=np.float32),
            }
            ds_out = decode.run(None, dec_feeds)
            pred_feat = ds_out[0]
            dit_hidden = ds_out[1]
            base_keys = ds_out[2]
            base_vals = ds_out[3]
            res_keys = ds_out[4]
            res_vals = ds_out[5]
            pred_patches.append(pred_feat[0])
            prefix_cond = pred_feat

            if step >= CFG["minLen"]:
                stop_flag = ds_out[6]
                if stop_flag.flat[0] != 0:
                    print(f"[TTS] Stopped at step {step}", flush=True)
                    break

            if (step + 1) % 20 == 0 or step == max_patches - 1:
                print(f"[TTS] Step {step+1}/{max_patches}", flush=True)

        del decode

        # VAE decode
        print(f"[TTS] Loading VAE decoder...", flush=True)
        vae_dec = ort.InferenceSession(f"{MODEL_DIR}/audio_vae_decoder.onnx", **SESS_OPTS)
        num_patches = len(pred_patches)
        z_len = num_patches * CFG["patchSize"]
        z_data = np.zeros((CFG["featDim"], z_len), dtype=np.float32)
        for t_idx in range(num_patches):
            patch = pred_patches[t_idx].reshape(CFG["patchSize"], CFG["featDim"])
            for p in range(CFG["patchSize"]):
                for d in range(CFG["featDim"]):
                    z_data[d, t_idx * CFG["patchSize"] + p] = patch[p, d]
        z_data = z_data[np.newaxis, ...]
        ae_out = vae_dec.run(["audio"], {"z": z_data})[0]
        audio = ae_out[0, 0]
        del vae_dec

        write_wav(audio, out_path, CFG["outSampleRate"])
        print(f"[TTS] Segment {idx} done", flush=True)

    print("[TTS] All segments done", flush=True)

def _encode_wav(session, wav_path):
    audio, sr = read_wav(wav_path)
    if sr != CFG["sampleRate"]:
        audio = resample(audio, sr, CFG["sampleRate"])
    patch_len = CFG["patchSize"] * CFG["chunkSize"]
    if len(audio) % patch_len != 0:
        pad = patch_len - (len(audio) % patch_len)
        audio = np.pad(audio, (0, pad))
    audio_in = audio.reshape(1, 1, -1).astype(np.float32)
    z = session.run(["z"], {"audio_data": audio_in})[0]
    D, T = CFG["featDim"], z.shape[2]
    P = CFG["patchSize"]
    num_patches = T // P
    feat = np.zeros((num_patches, D), dtype=np.float32)
    for ti in range(num_patches):
        for d in range(D):
            feat[ti, d] = np.mean(z[0, d, ti*P:(ti+1)*P])
    return feat

if __name__ == "__main__":
    main()
