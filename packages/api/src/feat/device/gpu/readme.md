完整的跨平台 GPU 探测体系。

## 名词解释

EP = Execution Provider，ONNX Runtime 的执行后端

## 最终架构

```
探测链（按优先级）：

Linux:
  1. nvidia-smi      → NVIDIA 独显
  2. rocm-smi        → AMD 独显/iGPU (ROCm 环境)
  3. intel_gpu_top   → Intel 独显/核显 (oneAPI)
  4. vulkaninfo      → 通用 fallback，发现所有 Vulkan 设备
  5. /sys/class/drm  → 无工具时的保底

Windows:
  1. nvidia-smi      → NVIDIA
  2. wmic / dxdiag   → 通用 GPU 信息
  3. vulkaninfo      → fallback

macOS:
  1. system_profiler  → 所有 GPU
  2. ioreg           → 详细信息
```

---

## 核心问题：显存探测

| 平台 | 独显显存 | iGPU 显存 |
|------|---------|----------|
| **Linux NVIDIA** | `nvidia-smi` 准确 | N/A |
| **Linux AMD dGPU** | `rocm-smi --showmeminfo vram` 准确 | N/A |
| **Linux AMD iGPU** | N/A | `rocm-smi --showmeminfo vram` 是 BIOS 预留值，`gtt` 是上限，需要启发式 |
| **Linux Intel** | `intel_gpu_top` / sysfs | 类似 AMD，共享内存 |
| **Windows** | `wmic` / DXGI `DedicatedVideoMemory` 准确 | DXGI `SharedSystemMemory` 是上限 |
| **macOS** | N/A | 统一内存，`system_profiler` 报告总内存 |

---

## 关键接口设计

```typescript
export interface GpuInfo {
    // 身份
    name: string;
    vendor: 'amd' | 'nvidia' | 'intel' | 'apple' | 'unknown';
    
    // 架构（推理优化用）
    architecture?: string;      // RDNA 3, Ampere, Apple Silicon...
    gfxVersion?: string;       // AMD gfx1103 等
    
    // 显存（最关键，决定能跑什么模型）
    vram: {
        type: 'dedicated' | 'shared' | 'unified';
        totalMB: number;       // 实际可用上限
        usedMB?: number;       // 当前占用（运行时）
        percent?: number;      // 当前占用百分比（运行时）
        
        // 原始值（调试/iGPU 特殊处理）
        raw?: {
            deviceLocalMB?: number;   // Vulkan/ROCm 报告的 DEVICE_LOCAL（iGPU 可能是 BAR）
            sharedMB?: number;        // Windows DXGI SharedSystemMemory
            gttMB?: number;           // Linux AMD GTT
        };
    };
    
    // 驱动（兼容性判断）
    driver: {
        version?: string;           // 显示驱动版本
        apiVersion?: string;        // CUDA/ROCm/HIP 版本
        kernelVersion?: string;     // Linux 内核（排查用）
    };
    
    // 运行时状态（可选）
    status?: {
        temperature: number;
        gpuPercent: number;         // 计算单元利用率
    };
    
    // 后端支持（决定用什么推理路径）
    backends: {
        cuda: boolean;              // NVIDIA 独显
        rocm: boolean;              // AMD 独显 + Linux
        directml: boolean;          // Windows 任何 GPU
        webgpu: boolean;            // 现代浏览器/Node，所有平台
        mps: boolean;               // Apple Silicon
        openvino: boolean;          // Intel 独显/核显
        vulkan: boolean;            // 原生 Vulkan，通用 fallback
    };
    
    // 平台特有
    pciBusId?: string;              // 多卡去重用
    hsaOverrideGfx?: string;         // AMD Linux 特有
}
```

---

## 显存探测的跨平台实现

```typescript
function detectVram(gpuName: string, vendor: string, platform: string): { totalMB: number; type: 'dedicated' | 'shared' | 'unified' } {
    // NVIDIA: 专用显存，nvidia-smi 准确
    if (vendor === 'nvidia') {
        const smi = run('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits');
        const mb = parseInt(smi) * 1024; // nvidia-smi 输出是 MiB
        return { totalMB: mb, type: 'dedicated' };
    }
    
    // AMD Linux
    if (vendor === 'amd' && platform === 'linux') {
        // 尝试 rocm-smi
        const vramInfo = run('rocm-smi --showmeminfo vram');
        const gttInfo = run('rocm-smi --showmeminfo gtt');
        
        const vramTotal = extractMB(vramInfo, 'Total Memory');
        const gttTotal = extractMB(gttInfo, 'Total Memory');
        
        // 启发式：VRAM < 1GB 且 GTT > 4GB → iGPU，用 GTT
        if (vramTotal > 0 && vramTotal < 1024 && gttTotal > 4096) {
            return { 
                totalMB: Math.round(gttTotal), 
                type: 'shared',
                raw: { deviceLocalMB: Math.round(vramTotal), gttMB: Math.round(gttTotal) }
            };
        }
        
        // dGPU 或 BIOS 预留较大的 iGPU
        return { 
            totalMB: Math.round(vramTotal || gttTotal), 
            type: vramTotal >= 4096 ? 'dedicated' : 'shared'
        };
    }
    
    // AMD Windows
    if (vendor === 'amd' && platform === 'win32') {
        // WMI 或 DXGI
        const wmi = run('wmic path win32_VideoController get AdapterRAM,AdapterCompatibility /format:csv');
        // AdapterRAM 是字节，但对 iGPU 可能不准
        // 需要 DXGI 获取 DedicatedVideoMemory + SharedSystemMemory
        // 这里简化，实际用 C++ addon 或 PowerShell
        return { totalMB: 0, type: 'unknown' }; // TODO: Windows 实现
    }
    
    // Intel
    if (vendor === 'intel') {
        // Linux: intel_gpu_top 或 sysfs
        // Windows: WMI
        return { totalMB: 0, type: 'shared' }; // TODO
    }
    
    // Apple Silicon
    if (vendor === 'apple') {
        const totalMem = os.totalmem();
        return { totalMB: Math.round(totalMem / 1024 / 1024), type: 'unified' };
    }
    
    // Fallback: 从系统内存推断
    const sysMemMB = Math.round(os.totalmem() / 1024 / 1024);
    return { 
        totalMB: Math.round(sysMemMB * 0.5), // 保守估计最多一半
        type: 'shared' 
    };
}
```

---

## 后端支持检测

```typescript
function detectBackends(gpu: GpuInfo, platform: string): GpuInfo['backends'] {
    const backends = {
        cuda: false,
        rocm: false,
        directml: false,
        webgpu: false,
        mps: false,
        openvino: false,
        vulkan: false,
    };
    
    // CUDA: NVIDIA 独显
    if (gpu.vendor === 'nvidia') {
        backends.cuda = run('nvidia-smi') !== '';
        backends.directml = platform === 'win32';
        backends.webgpu = true;
        backends.vulkan = true;
    }
    
    // ROCm: AMD 独显 + Linux
    if (gpu.vendor === 'amd' && platform === 'linux') {
        backends.rocm = run('rocm-smi') !== '';
        backends.webgpu = true;
        backends.vulkan = true;
    }
    
    // AMD Windows
    if (gpu.vendor === 'amd' && platform === 'win32') {
        backends.directml = true;
        backends.webgpu = true;
        backends.vulkan = true;
    }
    
    // Apple Silicon
    if (gpu.vendor === 'apple') {
        backends.mps = true;
        backends.webgpu = true; // Safari/Metal 支持
    }
    
    // Intel
    if (gpu.vendor === 'intel') {
        backends.openvino = true;
        backends.webgpu = true;
        backends.vulkan = true;
    }
    
    return backends;
}
```

---

## 多卡去重

```typescript
function deduplicateGpus(gpus: GpuInfo[]): GpuInfo[] {
    const seen = new Map<string, GpuInfo>();
    
    for (const gpu of gpus) {
        const key = gpu.pciBusId || `${gpu.vendor}|${gpu.name}|${gpu.vram.totalMB}`;
        
        if (seen.has(key)) {
            const existing = seen.get(key)!;
            // 合并信息：优先保留有显存数据的
            if (!existing.vram.totalMB && gpu.vram.totalMB) {
                seen.set(key, gpu);
            }
        } else {
            seen.set(key, gpu);
        }
    }
    
    return Array.from(seen.values());
}
```

---

## 推荐逻辑

```typescript
function recommendConfig(gpus: GpuInfo[], modelRequirements: { minVRAM_MB: number; preferredBackend: string }): {
    selectedGpu: GpuInfo | null;
    backend: string;
    quantization: 'fp16' | 'q8_0' | 'q4_k';
    maxBatchSize: number;
} {
    // 排序：专用显存 > 共享，后端支持 > 不支持
    const scored = gpus.map(gpu => {
        let score = 0;
        if (gpu.vram.type === 'dedicated') score += 1000;
        score += gpu.vram.totalMB / 100;
        
        // 后端偏好
        if (modelRequirements.preferredBackend === 'cuda' && gpu.backends.cuda) score += 500;
        if (modelRequirements.preferredBackend === 'rocm' && gpu.backends.rocm) score += 500;
        if (modelRequirements.preferredBackend === 'webgpu' && gpu.backends.webgpu) score += 300;
        
        return { gpu, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]?.gpu;
    
    if (!best || best.vram.totalMB < modelRequirements.minVRAM_MB) {
        return { selectedGpu: null, backend: 'cpu', quantization: 'q4_k', maxBatchSize: 1 };
    }
    
    // 根据显存大小推荐量化
    const quant = best.vram.totalMB > 12000 ? 'fp16' :
                  best.vram.totalMB > 6000 ? 'q8_0' : 'q4_k';
    
    return {
        selectedGpu: best,
        backend: modelRequirements.preferredBackend,
        quantization: quant,
        maxBatchSize: Math.max(1, Math.floor(best.vram.totalMB / modelRequirements.minVRAM_MB / 2)),
    };
}
```

---

## 你现在需要做的

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 1 | **Linux AMD 显存探测** | 你的 `tryRocmSmi` + `gtt` 修正，已完成 |
| 2 | **Linux NVIDIA 探测** | `tryNvidiaSmi()`，类似结构 |
| 3 | **Windows WMI/DXGI** | 需要 PowerShell 或 C++ addon |
| 4 | **macOS system_profiler** | 相对简单 |
| 5 | **跨平台 vulkaninfo fallback** | 通用保底 |

需要我先帮你写 `tryNvidiaSmi()` 吗？结构会和你的 `tryRocmSmi` 类似。