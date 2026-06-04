import { tryRocmSmi } from '#/feat/device/gpu/RocmSmi.ts';
import type { GpuInfo } from '#/feat/device/gpu/types.ts';
import { tryVulkanInfo } from '#/feat/device/gpu/VulkanInfo.ts';

export const getGpuInfo = (): GpuInfo[] => {
	const gpus: GpuInfo[] = [];
	// 收集所有来源，不去重（同一卡可能被多个工具报告）
	const sources: GpuInfo[][] = [];
	if (process.platform === 'linux') {
		// sources.push(tryNvidiaSmi() ?? []);
		const rocm = tryRocmSmi();
		if (rocm.length > 0) sources.push(rocm);
		// sources.push(tryIntelGpuTop() ?? []);
	}
	// 通用 fallback
	const vulkan = tryVulkanInfo();
	if (vulkan && vulkan.length > 0) sources.push(vulkan);

	console.log('GPU info sources:', JSON.stringify(sources, null, 2));
	// 合并 + 去重
	const seen = new Set<string>();
	for (const source of sources) {
		for (const gpu of source) {
			// 去重 key：名称 + 显存总量
			const key = `${gpu.vendor}|${gpu.name}|${gpu.vram?.total ?? 'unknown'}`;
			if (!seen.has(key)) {
				seen.add(key);
				gpus.push(gpu);
			}
		}
	}
	return gpus;
};
