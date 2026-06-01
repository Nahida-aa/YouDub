# Model device assignment

| Model | Runtime | Device | Reason |
|-------|---------|--------|--------|
| Demucs | Python (PyTorch) | CPU | GPU hang (CrossTransformer + Wiener filter) |
| VoxCPM (TTS) | Python (PyTorch) | CPU | GPU: model loads but any forward pass → segfault |
| VoxCPM (TTS) | TypeScript (ONNX) | CPU / webgpu | ONNX 实现中，webgpu EP 可用于 RDNA 3 |
| Whisper (ASR) | Python (PyTorch) | GPU (cuda) | Works fine |
| Translation | Python (OpenAI) | N/A | Remote API |

## Python backend (`backend/app/`)

所有模型推理仅在 pipeline runner 内部按顺序执行，没有单独的 HTTP 端点暴露。

## TypeScript 端 (`packages/api/src/ml/`)

当前只有 VoxCPM 有 TS 实现（`voxcpm/` 目录）：
- `voxcpm.ts` — 类定义 + ONNX 推理管线
- `load.ts` — 模型文件状态检查
- `download.ts` — 从 HuggingFace 下载 ONNX 模型
- `device-info.ts` + `device-route.ts` — 设备信息 API
