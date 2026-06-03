import { execSync } from 'node:child_process';
import * as os from 'node:os';
import * as ort from 'onnxruntime-node';
import { getGpuInfo } from '#/feat/device/gpu/gpu.ts';
import type { GpuInfo } from '#/feat/device/gpu/types.ts';

export interface OrtBackend {
	name: string;
	bundled: boolean;
}

export interface DeviceInfo {
	platform: {
		os: string; // 'linux'| 'windows'| 'macos' | 'android' | 'ios'
		arch: string; // 'x64' | 'arm64' | 'x86'
		release: string; // '7.0.10-zen1-1-zen'
		hostname: string;
		runtime: string; // 'node' | 'bun' | 'deno' | 'python' | 'browser' | 'rs'
		runtimeVersion: string;
	};
	cpu: {
		model: string; // e.g. AMD Ryzen 7 H 255 w/ Radeon 780M Graphics
		cores: number; // 逻辑核心数
		speedMHz: number; // 3712
		//     supportsAvx2: boolean;   // 影响量化模型速度
		// supportsAvx512: boolean; // 高端 CPU 标志
	};
	memory: {
		total: string; // 系统总内存 e.g. '32 GB'
		free: string;
		processHeapUsed: string;
	};
	gpu: GpuInfo[];
	ort: {
		version: string;
		backends: OrtBackend[];
	};
}

function fmtBytes(bytes: number): string {
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
	const cpus = os.cpus();
	const backends: OrtBackend[] = (ort.listSupportedBackends?.() ?? []).map(
		(b) => ({
			name: b.name,
			bundled: b.bundled,
		}),
	);

	return {
		platform: {
			os: process.platform,
			arch: process.arch,
			release: os.release(),
			hostname: os.hostname(),
			runtime: 'bun',
			runtimeVersion: Bun?.version ?? process.version,
		},
		cpu: {
			model: cpus[0]?.model ?? 'unknown',
			cores: cpus.length,
			speedMHz: cpus[0]?.speed ?? 0,
		},
		memory: {
			total: fmtBytes(os.totalmem()),
			free: fmtBytes(os.freemem()),
			processHeapUsed: fmtBytes(process.memoryUsage().heapUsed),
		},
		gpu: getGpuInfo(),
		ort: {
			version: ort.env.versions?.common ?? 'unknown',
			backends,
		},
	};
}
