# YouDub-webui

## Hardware
AMD Radeon 780M (RDNA 3), ROCm 7.2.3 → `.agents/hardware.md`

## Model device assignment
| 模型 | 设备 | 原因 |
|------|------|------|
| Demucs (PyTorch) | CPU | GPU hang, RTF ~2.0 (htdemucs, shifts=3, 5min 实测) |
| Demucs (ONNX, onnxruntime-node) | CPU | **✅ 实际路径**，RTF ~1.0 单 CPU 即可实时 |
| VoxCPM (PyTorch) | CPU | GPU segfault |
| VoxCPM (onnxruntime-node WebGPU) | GPU (Vulkan/Dawn) | **✅ 主要路径**，VAE → CPU fallback（Dawn 多 session 资源泄漏 workaround），Prefill+Decode → WebGPU |
| VoxCPM (ORT+MIGraphX) | GPU (ROCm) | ❌ 废弃，10x slower than CPU |
| CosyVoice3 | CPU | 无 CUDA EP, 编译 ORT + MIGraphX 中（但 gfx1103 MIOpen conv solver hang 可能会堵） |
| Whisper | GPU (cuda) | 正常 |
| 翻译 | GPU (cuda) | 正常 |

详情 → `.agents/model-strategy.md`

## Key directories
- `backend/app/adapters/` — Python 模型适配器
- `packages/api/src/ml/` — TypeScript 模型实现
- `packages/benchmark/` — 性能测试
- `data/modelscope/CosyVoice3-0.5B/onnx/scripts/` — CosyVoice3 ONNX 推理脚本（零 PyTorch 依赖）
- `submodule/CosyVoice/` — FunAudioLLM CosyVoice 官方源码
- `submodule/VoxCPM/` — OpenBMB VoxCPM 官方源码

## Temp directory
- `packages/tmp/` — 项目级临时文件/构建产物（已 gitignored via `*/tmp/*` in `.gitignore`）
- 大型第三方编译（如 ORT 源码）放此目录而非系统 `/tmp/`

## Navigation
- `.agents/hardware.md` — GPU 兼容性 & 环境变量
- `.agents/model-strategy.md` — 各模型设备分配策略
- `.agents/conv-patch.md` — GEMM conv 替代实现
- `.agents/demucs.md` — Demucs CPU fallback 说明
- `.agents/cosyvoice2.md` — CosyVoice2/3 ONNX 导出状态
- `.agents/future-optimization.md` — 长期优化计划
- `docs/webgpu-oom.md` — WebGPU `VK_ERROR_DEVICE_LOST` 根因分析

## VoxCPM2 Benchmark (onnxruntime-node 1.26.0, Radeon 780M)

```
ts-onnx-webgpu-vulkan  RTF ~4.2  (VAE CPU + Prefill/Decode WebGPU)  ✅ 全文本
ts-onnx-cpu            RTF ~7.4  (所有模型 CPU)                       ✅ 全文本
py-pth-cpu             RTF ~9.9  (PyTorch CPU)                       ✅ 全文本
rs-onnx-cpu            RTF ~10.2 (Rust ORT 1.24, short only)         ⏳ timeout
```

## 已知问题
- **Dawn WebGPU 多 session 资源泄漏**：≥3 个 WebGPU InferenceSession 共存会导致 `VK_ERROR_DEVICE_LOST`。Workaround: VAE Encoder/Decoder 用 CPU EP，限制 WebGPU sessions ≤ 2 个。用完调用 `session.release()` 释放资源。
  - 详情 → `docs/webgpu-oom.md`
- MIGraphX 路径废弃（10x slower than CPU, MIOpen conv solver hang）
- Rust `ort` crate v2.0.0-rc.12 bundles ORT 1.24（落后 2 个大版本），暂不适用于生产
