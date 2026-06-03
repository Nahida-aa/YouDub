# WebGPU OOM (VK_ERROR_DEVICE_LOST) 分析

## 现象

在 `onnxruntime-node` WebGPU EP 上运行 VoxCPM2 全流程时，**短文本**（< 10 tokens）可以正常生成，但**中/长文本**（> 20 tokens）的 reference audio 编码阶段抛出：

```
VK_ERROR_DEVICE_LOST
```

进程崩溃，无法恢复。

## 根因

### 架构回顾

VoxCPM2 由 4 个 ONNX 子模型组成：

| 子模型 | 算子特征 | 显存压力 |
|--------|---------|---------|
| VAE Encoder | Conv 密集 | 高 |
| VAE Decoder | Conv 密集 | 高 |
| Prefill (2B) | Attention 密集 | 中 |
| Decode Step | Attention 密集 | 中 |

> VAE Encoder (End of Active Video) 与 

### 问题

`voxcpm.ts:59` 中所有 4 个模型共享同一个 `executionProviders`：

```typescript
const opts = { executionProviders: ['webgpu'] };
this.prefill = await InferenceSession.create(prefill.onnx, opts);
this.decode = await InferenceSession.create(decode.onnx, opts);
this.vaeEnc = await InferenceSession.create(vae_enc.onnx, opts);  // ❌ OOM
this.vaeDec = await InferenceSession.create(vae_dec.onnx, opts);  // ❌ OOM
```

**VAE 模型使用 Conv 算子**，这些算子在 WebGPU（Dawn/Vulkan）后端上会将 intermediate tensors 分配到 GPU 显存。当 reference audio 较长时（中/长文本的参考音频 > 6s），VAE Encoder 的中间激活值体积膨胀，超出 Radeon 780M iGPU 可用的 Vulkan 显存上限，触发 `VK_ERROR_DEVICE_LOST`。

**短文本可以工作的原因**：短文本使用相同的 short reference audio（~3s），VAE 输入较小，显存压力未触及阈值。

### 为什么 CPU 没这个问题

ONNX CPU EP 使用系统内存，不受 iGPU 显存限制。VAE Encoder/Decoder 在 CPU 上的显存占用为零，但推理速度较慢（Conv 在 CPU 上缺乏优化）。

### 为什么 MIGraphX 也遇到类似问题

MIGraphX EP 的 VAE Encoder 曾因 MIOpen `GemmFwdRest` solver 在 gfx1103 上 hang，根本原因是 **AMD 的 MIOpen 对 RDNA 3 iGPU 的 conv solver 支持有 bug**，不是显存不足。这是不同的根因。

## 解决方案：Per-Model EP Split

借鉴 MIGraphX 实验中验证的混合 EP 策略：

| 模型 | EP | 原因 |
|------|----|------|
| VAE Encoder | `['cpu']` | 避免 Conv 在 Vulkan 上分配显存 |
| VAE Decoder | `['cpu']` | 同上 |
| Prefill | `['webgpu']` | Attention 密集型，GPU 加速收益大 |
| Decode Step | `['webgpu']` | 循环主体，GPU 加速收益大 |

### 优点

- 不改动模型本身
- 不破坏现有 CPU 路径（`cpu` 时所有模型用 CPU EP，无变化）
- 外部 API 签名不变，benchmark 代码无需修改
- VAE 走 CPU 的代价可接受（VAE 仅运行 1 次，非循环主体）

### 代价

- VAE Encoder + Decoder 从 GPU 回退到 CPU，增加 ~5-15s 总耗时（取决于音频长度）
- 相对全 GPU 路径的潜在性能损失，但相比目前 OOM 崩溃，这是可工作的折衷

## 实现

修改 `voxcpm.ts` 构造器和 `load()` 方法，将 VAE 模型的 EP 分离：

```typescript
constructor(
  private modelDir: string = VOXCPM_MODEL_PATH,
  options?: { executionProvider?: 'cpu' | 'webgpu' },
) {
  const ep = options?.executionProvider ?? 'cpu';
  this.transformerEp = [ep];
  this.vaeEp = ep === 'webgpu' ? ['cpu'] : [ep];
}

async load() {
  const transformerOpts = { executionProviders: this.transformerEp };
  const vaeOpts = { executionProviders: this.vaeEp };
  this.prefill = await InferenceSession.create(`${this.modelDir}/voxcpm2_prefill.onnx`, transformerOpts);
  this.decode = await InferenceSession.create(`${this.modelDir}/voxcpm2_decode_step.onnx`, transformerOpts);
  this.vaeEnc = await InferenceSession.create(`${this.modelDir}/audio_vae_encoder.onnx`, vaeOpts);
  this.vaeDec = await InferenceSession.create(`${this.modelDir}/audio_vae_decoder.onnx`, vaeOpts);
}
```

## 验证

修改后 benchmark:

1. 短文本：正常（VAE CPU + transformer WebGPU，RTF 稍有变化）
2. 中文本：**不再 OOM**（VAE CPU 路径无显存压力）
3. 长文本：**不再 OOM**

预期 `ts-onnx-webgpu-vulkan.json` 新增中/长文本数据。
