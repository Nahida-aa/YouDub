export interface GpuInfo {
	name: string; // AMD Radeon 780M Graphics
	vendor: 'amd' | 'nvidia' | 'intel' | 'unknown';
	architecture?: string; // RDNA 3
	driverVersion: string; // 7.0.10-zen1-1-zen
	temperature: number; // 53
	gpuPercent: number; // GPU 利用率 = 当前 GPU 计算单元忙碌时间的百分比, rocm-smi 输出的利用率列
	gfxVersion?: string; // AMD GPU 的硬件架构标识符，用于底层驱动和编译器识别 GPU 代际. 仅 linux + amd. gfx1103. ROCm 是否支持某 GPU，看 gfx 版本是否在支持列表; 编译时针对具体 gfx 优化，比通用代码快; HSA_OVERRIDE_GFX_VERSION 可以强制伪装成其他版本

	vram: {
		percent: number; // 显存占用百分比 = 当前已用显存 / 总显存 × 100 rocm-smi 输出的百分比列
		total?: number; // VRAM 总量，单位 GB
		used?: number; // 已用 VRAM，单位 GB
		type?: 'dedicated' | 'shared' | 'unknown'; // VRAM 类型
		reserved?: number; // BIOS  预先划分的专用区域
	};
	capabilities: {
		// 能力, 硬件能力
		webgpu: boolean;
		vulkan: boolean;
		cuda: boolean;
		rocm: boolean;
		directml: boolean;
		mps: boolean;
		openvino: boolean;
	};
	hsaOverrideGfx?: string;
}
