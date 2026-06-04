import { tryRocmSmi } from '#/feat/device/gpu/RocmSmi.ts';
import type { GpuInfo } from '#/feat/device/gpu/types.ts';

export const getGpuInfo = (): GpuInfo[] => {
	const gpus: GpuInfo[] = [];
	// 收集所有来源，不去重（同一卡可能被多个工具报告）
	const sources: GpuInfo[][] = [];
	if (process.platform === 'linux') {
		// sources.push(tryNvidiaSmi() ?? []);
		sources.push(tryRocmSmi()); // 你的现有代码
		// sources.push(tryIntelGpuTop() ?? []);
	}
	// 通用 fallback
	// sources.push(tryVulkanInfo());
	console.log('GPU info sources:', sources);
	return gpus;
};
