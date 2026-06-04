import type { GpuInfo } from '#/feat/device/gpu/types.ts';
import { bytesToGB, fmtBytes, run } from '#/feat/device/utils.ts';

export function tryVulkanInfo(): GpuInfo[] {
	const gpus: GpuInfo[] = [];

	// 方案 1: vulkaninfo --json（信息最全，需要安装 Vulkan SDK）
	const jsonOutput = run('vulkaninfo --json 2>/dev/null', 5000);
	if (jsonOutput) {
		try {
			const data = JSON.parse(jsonOutput);
			const devices = data?.VkPhysicalDevices || [];

			for (const dev of devices) {
				const props = dev?.VkPhysicalDeviceProperties || {};
				const mem = dev?.VkPhysicalDeviceMemoryProperties || {};

				// 找最大的 heap（通常是 device-local）
				let vramTotalGB = 0;
				const heaps = mem?.memoryHeaps || [];
				for (const heap of heaps) {
					if (heap?.flags?.deviceLocal) {
						vramTotalGB = Math.max(vramTotalGB, bytesToGB(heap.size));
					}
				}

				// 厂商 ID 映射
				const vendorId = props?.vendorID;
				let vendor: 'amd' | 'nvidia' | 'intel' | 'unknown' = 'unknown';
				if (vendorId === 0x10de) vendor = 'nvidia';
				else if (vendorId === 0x1002 || vendorId === 0x1022) vendor = 'amd';
				else if (vendorId === 0x8086) vendor = 'intel';

				gpus.push({
					name: props?.deviceName || 'Unknown Vulkan GPU',
					architecture: undefined, // vulkaninfo 不直接暴露架构代际
					driverVersion: props?.driverVersion?.toString() || '',
					temperature: 0,
					gpuPercent: 0,
					// 扩展字段
					vram: {
						percent: 0,
						total: vramTotalGB,
						used: 0, // Vulkan API 本身不提供实时 VRAM 使用量，需要额外工具
						type: vramTotalGB > 0 ? 'dedicated' : 'shared',
					},
					// vramTotalGB: Math.round(vramTotalGB),
					vendor,
					capabilities: {
						webgpu: true, // 有 Vulkan 驱动通常支持 WebGPU
						vulkan: true,
						cuda: vendor === 'nvidia',
						rocm: vendor === 'amd' && process.platform === 'linux',
						directml: false,
						mps: false,
						openvino: vendor === 'intel',
					},
				});
			}

			if (gpus.length > 0) return gpus;
		} catch {
			// JSON 解析失败，fallback
		}
	}

	// 方案 2: vulkaninfo 纯文本解析（不需要 --json，但信息少）
	const textOutput = run('vulkaninfo 2>/dev/null | head -100', 3000);
	if (textOutput) {
		const deviceNames = [...textOutput.matchAll(/deviceName\s*=\s*(.+)/g)];
		const vendorIds = [
			...textOutput.matchAll(/vendorID\s*=\s*(0x[0-9a-fA-F]+)/g),
		];

		for (let i = 0; i < deviceNames.length; i++) {
			const name = deviceNames[i][1].trim();
			const vendorId = parseInt(vendorIds[i]?.[1] || '0', 16);

			let vendor: 'amd' | 'nvidia' | 'intel' | 'unknown' = 'unknown';
			if (vendorId === 0x10de) vendor = 'nvidia';
			else if (vendorId === 0x1002 || vendorId === 0x1022) vendor = 'amd';
			else if (vendorId === 0x8086) vendor = 'intel';

			gpus.push({
				name,
				architecture: undefined,
				driverVersion: '',
				temperature: 0,
				gpuPercent: 0,
				vram: {
					percent: 0,
					total: undefined,
					used: 0,
					type: 'unknown',
				},
				vendor,
				capabilities: {
					webgpu: true,
					vulkan: true,
					cuda: vendor === 'nvidia',
					rocm: vendor === 'amd' && process.platform === 'linux',
					directml: false,
					mps: false,
					openvino: vendor === 'intel',
				},
			});
		}

		if (gpus.length > 0) return gpus;
	}

	return [];
}
