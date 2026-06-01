# CosyVoice2 ONNX Export Status

## ONNX 模型（来自 Lourdle/CosyVoice2-0.5B_ONNX）

`pretrained_models/CosyVoice2-0.5B/`

| 文件 | 大小 | 说明 | 状态 |
|------|------|------|------|
| `hift_lourdle.onnx` (symlink `hift.onnx`) | 80 MB | HiFT 声码器 | ✅ 完全可用 |
| `flow_fp32.onnx` | 475 MB | Flow 扩散模块 (FP32) | ✅ 加载通过 |
| `flow_fp16.onnx` | 240 MB | Flow 扩散模块 (FP16) | ✅ 加载通过 |
| `flow_hift_combined_fp32.onnx` | 554 MB | Flow + HiFT 联合 (FP32) | ✅ 加载通过 |
| `flow_hift_combined_fp16.onnx` | 320 MB | Flow + HiFT 联合 (FP16) | ✅ 加载通过 |

### HiFT 推理性能（CPU, `hift_lourdle.onnx`）

| T (mel frames) | 输出采样数 | 耗时 |
|:---:|:---:|:---:|
| 50 | 24000 (1s) | 140 ms |
| 100 | 48000 (2s) | 327 ms |
| 200 | 96000 (4s) | 1431 ms |

### 输入/输出

| 模型 | 输入 | 输出 |
|------|------|------|
| `hift.onnx` | `speech_feat [1,80,L]` float32 | `generated_speech [1,N]` float32 |
| `flow_fp32.onnx` | `token [B,L]` int64, `prompt_token [B,PL]` int32, `prompt_feat [B,ML,80]` float32, `embedding [B,E]` float32 | `tts_mel` float32 |
| `flow_hift_combined_fp32.onnx` | `token`, `prompt_token`, `prompt_feat`, `embedding`, `speed` scalar | `generated_speech` float32 |

## LLM (Qwen2)

`llm.pt` (2 GB) — 尚未导出 ONNX。社区有适用于 CosyVoice3 的完整 ONNX 导出（`ayousanz/cosy-voice3-onnx`），包含 LLM backbone 的 prefill/decode 分图。

## 导出参考

- `packages/benchmark/VC/CosyVoice2/lourdle_ref/` — Lourdle 的导出脚本副本
  - `convert_hift_to_onnx.py`（用自定义 ISTFT 代替 torch.istft）
  - `convert_flow_to_onnx.py`
  - `compose_flow_hift.py`
- `packages/benchmark/VC/CosyVoice2/export-hift-onnx.py` — 我们的旧导出脚本（不再使用）

## 模型权重

| 文件 | 大小 | 说明 |
|------|------|------|
| `llm.pt` | 2 GB | float32, Qwen2-based |
| `flow.pt` | 451 MB | 扩散模块 |
| `hift.pt` | 83 MB | HiFi-GAN 变体 |
| `CosyVoice-BlankEN/model.safetensors` | 943 MB | bfloat16 |

## 相关文件

- `packages/benchmark/VC/CosyVoice2/PyTorch-cpu.py` — Python CPU benchmark（已完成）
- `packages/benchmark/VC/CosyVoice2/lourdle_ref/` — Lourdle 社区导出脚本参考
- `third_party/CosyVoice/` — 官方源码（含已修改的 `cosyvoice/cli/model.py` BF16→F32 fix）
- `pretrained_models/CosyVoice2-0.5B/` — 模型权重 + ONNX 文件
