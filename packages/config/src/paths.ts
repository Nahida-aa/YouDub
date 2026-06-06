import { join } from 'node:path';
import { env } from './env.ts';

export const MODEL_CACHE_DIR = env.MODEL_CACHE_DIR;

export const VOXCPM_DIR = join(MODEL_CACHE_DIR, 'OpenBMB__VoxCPM2');
export const WHISPER_ONNX_DIR = join(MODEL_CACHE_DIR, 'whisper-large-v3-turbo');
export const DEMUCS_DIR = join(MODEL_CACHE_DIR, 'demucs');
