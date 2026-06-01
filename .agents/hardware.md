# Hardware

- **GPU**: AMD Radeon 780M (RDNA 3 / gfx1103) on Garuda Linux (Arch-based), no NVIDIA
- **ROCm**: 7.2.3
- **PyTorch**: 2.12.0+rocm7.2
- **HSA_OVERRIDE_GFX_VERSION=11.0.0** required for rocBLAS matmul on gfx1103

## AMD GPU quirks

- MIOpen RDNA 3 precompiled kernels absent; runtime solver causes GPU Hang / `miopenStatusUnknownError`. Only gfx900–gfx1030 databases bundled with PyTorch.
- rocBLAS works after `HSA_OVERRIDE_GFX_VERSION=11.0.0` (uses gfx1100 TensileLibrary).
- `torch.cuda.is_available()` → True. Basic ops (matmul, conv1d without MIOpen, SDPA, stft/istft, view_as_complex) all pass on GPU.
- Full Demucs forward on GPU → GPU Hang + driver crash (black screen); reproducible regardless of conv backend.
- Python VoxCPM: model loads on GPU (param placement OK), but **any forward pass** (even VAE encoder) → segfault. Must use CPU for runtime.

## ONNX Runtime (Node.js)

- Version: 1.26.0
- Bundled execution providers: `cpu`, `webgpu`
- Available (need install): `cuda`, `tensorrt`
- No ROCm EP in onnxruntime-node
