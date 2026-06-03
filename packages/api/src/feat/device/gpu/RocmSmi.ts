import type { GpuInfo } from '#/feat/device/gpu/types.ts';
import { run } from '#/feat/device/utils.ts';

const GFX_ARCH_MAP: Record<string, string> = {
	gfx1010: 'RDNA 1',
	gfx1011: 'RDNA 1',
	gfx1012: 'RDNA 1',
	gfx1030: 'RDNA 2',
	gfx1031: 'RDNA 2',
	gfx1032: 'RDNA 2',
	gfx1034: 'RDNA 2',
	gfx1035: 'RDNA 2',
	gfx1036: 'RDNA 2',
	gfx1100: 'RDNA 3',
	gfx1101: 'RDNA 3',
	gfx1102: 'RDNA 3',
	gfx1103: 'RDNA 3',
	gfx1150: 'RDNA 3.5',
	gfx1151: 'RDNA 3.5',
	gfx1200: 'RDNA 4',
	gfx1201: 'RDNA 4',
};
const APU_GFX_VERSIONS = new Set([
	'gfx909', // Raven Ridge
	'gfx1012', // Renoir
	'gfx1031', // Cezanne
	'gfx1035', // Rembrandt
	'gfx1036', // Barcelo
	'gfx1103', // Phoenix (你的 780M)
	'gfx1150', // Strix Point
	'gfx1151', // Strix Halo
]);

function isApu(gfxVersion?: string): boolean {
	return !!gfxVersion && APU_GFX_VERSIONS.has(gfxVersion);
}
function getRocmVersionFromPackageManager(): string | null {
	// Arch
	const pacman = run('pacman -Q rocm-core 2>/dev/null');
	const pacmanMatch = pacman.match(/rocm-core\s+([\d.]+)/);
	if (pacmanMatch) return pacmanMatch[1];

	// Debian/Ubuntu
	const dpkg = run('dpkg -l rocm-core 2>/dev/null');
	const dpkgMatch = dpkg.match(/rocm-core\s+\S+\s+([\d.]+)/);
	if (dpkgMatch) return dpkgMatch[1];

	// Fedora/RHEL
	const rpm = run('rpm -q rocm-core 2>/dev/null');
	const rpmMatch = rpm.match(/rocm-core-([\d.]+)/);
	if (rpmMatch) return rpmMatch[1];

	// openSUSE
	const zypper = run('zypper info rocm-core 2>/dev/null');
	const zypperMatch = zypper.match(/Version\s*:\s*([\d.]+)/);
	if (zypperMatch) return zypperMatch[1];

	return null;
}

function isIntegratedGpu(
	vramMB: number,
	gttMB: number,
	gpuName: string,
): boolean {
	// 条件 1: GTT 显著大于 VRAM（典型 iGPU）
	if (gttMB > vramMB * 1.5) return true;

	// 条件 2: VRAM 很小（< 2GB），大概率 iGPU 的 BAR
	if (vramMB < 2048) return true;

	// 条件 3: 名称关键词
	const name = gpuName.toLowerCase();
	if (
		name.includes('radeon graphics') ||
		name.includes('uhd graphics') ||
		name.includes('iris xe') ||
		name.includes('mali') ||
		name.includes('adreno')
	) {
		return true;
	}

	// 条件 4: 有 gfxVersion 且是 APU 型号
	// gfx1103 是 Phoenix APU，不是 dGPU

	return false;
}

// 仅 linux AMD GPU，且需要用户安装 rocm-smi 工具
export const tryRocmSmi = () => {
	const gpus: GpuInfo[] = [];
	const capabilities = {
		cuda: false,
		rocm: true, // AMD 硬件支持 ROCm
		mps: false,
		webgpu: true, // 有 Vulkan 驱动就能支持 WebGPU
		vulkan: true, // AMD 驱动自带 Vulkan
		directml: false, // Windows 才有
		openvino: false,
	};
	const smi = run('rocm-smi 2>/dev/null');
	if (!smi) {
		return gpus;
	}

	const driverVer = getRocmVersionFromPackageManager() || 'unknown';

	for (const line of smi.split('\n')) {
		if (!/^\d+\s+/.test(line)) continue;

		const tempM = line.match(/([\d.]+)°C/);
		const pctMatches = [...line.matchAll(/(\d+)%/g)];
		const parts = line.trim().split(/\s+/);

		const id = parts[0];
		const temp = tempM ? parseFloat(tempM[1]) : 0;
		const vramPct =
			pctMatches.length >= 2
				? parseInt(pctMatches[pctMatches.length - 2][1])
				: 0;
		const gpuPct =
			pctMatches.length >= 1
				? parseInt(pctMatches[pctMatches.length - 1][1])
				: 0;

		let gpuName = `GPU ${id}`;
		let gfxVer = '';
		const pn = run('rocm-smi --showproductname 2>/dev/null');
		const pm = pn.match(
			new RegExp(`GPU\\[${id}\\]\\s*:\\s*Card Series:\\s*(.+)`, 'i'),
		);
		if (pm) gpuName = pm[1].trim();
		const gfxM = pn.match(/GFX Version:\s*(.+)/i);
		if (gfxM) gfxVer = gfxM[1].trim();
		// 获取显存信息判断 iGPU/dGPU
		const vramInfo = run('rocm-smi --showmeminfo vram 2>/dev/null');
		// GTT = Graphics Translation Table，AMD GPU 的内存管理机制
		const gttInfo = run('rocm-smi --showmeminfo gtt 2>/dev/null');

		gpus.push({
			name: gpuName,
			architecture: GFX_ARCH_MAP[gfxVer] ?? undefined,
			driverVersion: driverVer,
			temperature: temp,
			vram: {
				percent: vramPct,
			},
			gpuPercent: gpuPct,
			gfxVersion: gfxVer,
			hsaOverrideGfx: process.env.HSA_OVERRIDE_GFX_VERSION,
			vendor: 'amd',
			capabilities,
		});
	}

	if (gpus.length === 0) {
		const fallbackPn = run('rocm-smi --showproductname 2>/dev/null');
		const fallbackM = fallbackPn.match(/Card Series:\s*(.+)/i);
		gpus.push({
			name: fallbackM?.[1]?.trim() ?? 'Unknown',
			architecture: undefined,
			driverVersion: driverVer,
			temperature: 0,
			vram: {
				percent: 0,
			},
			gpuPercent: 0,
			vendor: 'amd',
			capabilities,
		});
	}

	return gpus;
};
