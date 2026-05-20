# Hardware
- AMD Radeon 780M (RDNA 3 / gfx1103) on Garuda Linux (Arch-based), no NVIDIA
- ROCm 7.2.3, PyTorch 2.12.0+rocm7.2
- HSA_OVERRIDE_GFX_VERSION=11.0.0 required for rocBLAS matmul on gfx1103

# Device strategy
- Demucs: always CPU. GPU hangs (CrossTransformer + Wiener filter) on RDNA 3; full ROCm stack (MIOpen) also incompatible with gfx1103.
- VoxCPM (TTS): CPU. GPU inference also hangs on RDNA 3.
- All other stages (Whisper, translation): GPU (cuda) — works fine for individual ops.

# AMD GPU quirks
- MIOpen RDNA 3 precompiled kernels absent; runtime solver causes GPU Hang / `miopenStatusUnknownError`. Only gfx900–gfx1030 databases bundled with PyTorch.
- rocBLAS works after HSA_OVERRIDE_GFX_VERSION=11.0.0 (uses gfx1100 TensileLibrary).
- `torch.cuda.is_available()` → True. Basic ops (matmul, conv1d without MIOpen, SDPA, stft/istft, view_as_complex) all pass on GPU.
- Full Demucs forward on GPU → GPU Hang + driver crash (black screen); reproducible regardless of conv backend.

# conv_patch.py (`backend/app/adapters/conv_patch.py`)
Bypasses MIOpen by replacing `F.conv1d` / `F.conv2d` / `F.conv_transpose1d` / `F.conv_transpose2d` with GEMM-based implementations via `F.unfold` + `torch.matmul`. Verified correct on CPU against native PyTorch for all stride/padding/dilation/groups combos.

Currently **not applied anywhere** — Demucs runs on CPU with native PyTorch conv. The patch is preserved as a reference for future optimization:
- Replace `F.unfold` + `matmul` with a custom kernel (CUDA, ROCm, or pure Rust GEMM via PyO3 FFI).
- Same API surface: just swap `_conv1d_gemm` → Rust conv1d, call `apply_patch()` before Demucs import.
- Could also rewrite CrossTransformer attention (self-attn + cross-attn + FFN) in Rust to eliminate the GPU hang source entirely.

# Demucs fallback
- `shifts=3`, `device="cpu"` — ~1:1 real-time for short audio, scales roughly linearly with duration.
- CrossTransformer + Wiener filter are the primary GPU hang source. Individual CNN layers work fine on GPU with GEMM patch.

# Future optimization (long videos)
- Lower-hanging fruit: reduce `segment` (currently 7.8s) to reduce padding overhead.
- Rust reimplementation of Demucs' LSTM-free path (conv + transformer): all ops are GEMM-amenable (conv1d/conv2d → im2col + matmul; transformer → matmul+bmm+softmax+layernorm).
- Candle (Rust ML framework) could be a starting point if HSA_OVERRIDE_GFX_VERSION continues to work for basic matmul.
