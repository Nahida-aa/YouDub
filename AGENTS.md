# YouDub-webui

## Hardware
AMD Radeon 780M (RDNA 3), ROCm 7.2.3 → `.agents/hardware.md`

## Model device assignment
| 模型 | 设备 | 原因 |
|------|------|------|
| Demucs | CPU | GPU hang |
| VoxCPM (PyTorch) | CPU | GPU segfault |
| VoxCPM (vLLM-Omni) | GPU (ROCm) | 实验性，HIP ABI 不兼容 + GPU Hang |
| VoxCPM (ORT+MIGraphX) | GPU (ROCm) | ✅ 可用，VAE Encoder/Decoder CPU fallback + MIGRAPHX_DISABLE_MIOPEN_FUSION=1 |
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
