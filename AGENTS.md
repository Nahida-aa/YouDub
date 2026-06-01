# YouDub-webui

## Hardware
AMD Radeon 780M (RDNA 3), ROCm 7.2.3 → `.agents/hardware.md`

## Model device assignment
| 模型 | 设备 | 原因 |
|------|------|------|
| Demucs | CPU | GPU hang |
| VoxCPM | CPU | GPU hang |
| Whisper | GPU (cuda) | 正常 |
| 翻译 | GPU (cuda) | 正常 |

详情 → `.agents/model-strategy.md`

## Key directories
- `backend/app/adapters/` — Python 模型适配器
- `packages/api/src/ml/` — TypeScript 模型实现
- `packages/benchmark/` — 性能测试

## Navigation
- `.agents/hardware.md` — GPU 兼容性 & 环境变量
- `.agents/model-strategy.md` — 各模型设备分配策略
- `.agents/conv-patch.md` — GEMM conv 替代实现
- `.agents/demucs.md` — Demucs CPU fallback 说明
- `.agents/cosyvoice2.md` — CosyVoice2 ONNX 导出状态
- `.agents/future-optimization.md` — 长期优化计划
