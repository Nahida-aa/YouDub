import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './../config/env.ts';
import { REPO_ROOT } from './../config/utils.ts';

export { REPO_ROOT };

// ── Data directories ──
export const DATA_DIR = join(REPO_ROOT, 'data');
export const COOKIE_DIR = join(DATA_DIR, 'cookies');
export const YOUTUBE_COOKIE_PATH = join(COOKIE_DIR, 'youtube.txt'); // matches Python backend
export const LOG_DIR = join(DATA_DIR, 'logs');
export const WORKFOLDER = env.WORKFOLDER;

// ── Unified model cache directory (env MODEL_CACHE_DIR, default data/modelscope) ──
export const MODEL_CACHE_DIR = env.MODEL_CACHE_DIR;
export const SHERPA_WHISPER_DIR = join(MODEL_CACHE_DIR, 'sherpa-whisper-turbo');
export const WHISPER_ONNX_DIR = join(MODEL_CACHE_DIR, 'whisper-large-v3-turbo');
export const DEMUCS_DIR = join(MODEL_CACHE_DIR, 'demucs');
export const VOXCPM_DIR = join(MODEL_CACHE_DIR, 'OpenBMB__VoxCPM2');
export const COSYVOICE_DIR = join(MODEL_CACHE_DIR, 'CosyVoice3-0.5B');

// ── Device ──
export function device(): string {
	return env.CUDA_DEVICE ?? env.DEVICE;
}

// ── OpenAI translator ──
export interface OpenAIDefaults {
	baseUrl: string;
	apiKey: string;
	model: string;
	translateConcurrency: number; //
}

export function openaiDefaults(): OpenAIDefaults {
	return {
		baseUrl: env.OPENAI_BASE_URL,
		apiKey: env.OPENAI_API_KEY,
		model: env.OPENAI_MODEL,
		translateConcurrency: env.OPENAI_TRANSLATE_CONCURRENCY,
	};
}

// ── FFmpeg ──
export function ffmpegBinary(): string {
	return env.FFMPEG_PATH;
}

export function ffprobeBinary(): string {
	return env.FFPROBE_PATH;
}

// ── yt-dlp ──
export interface YtDlpDefaults {
	proxyPort?: string;
}

export function ytdlpDefaults(): YtDlpDefaults {
	return {
		proxyPort: env.YTDLP_PROXY_PORT,
	};
}

// ── Ensure runtime directories exist ──
export function ensureRuntimeDirs(): void {
	for (const dir of [
		DATA_DIR,
		COOKIE_DIR,
		LOG_DIR,
		WORKFOLDER,
		MODEL_CACHE_DIR,
	]) {
		mkdirSync(dir, { recursive: true });
	}
	// Migrate old cookie filename → match Python backend
	const oldCookie = join(COOKIE_DIR, 'youtube_cookie.txt');
	if (!existsSync(YOUTUBE_COOKIE_PATH) && existsSync(oldCookie)) {
		try {
			copyFileSync(oldCookie, YOUTUBE_COOKIE_PATH);
			console.log('[config] Migrated youtube_cookie.txt → youtube.txt');
		} catch {
			/* ignore */
		}
	}
}
