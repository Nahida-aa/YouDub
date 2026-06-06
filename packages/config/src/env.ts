import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { REPO_ROOT } from './root.ts';

loadEnv({ path: resolve(REPO_ROOT, '.env') });

function envStr(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function envStrUndefined(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export const env = {
  // Paths
  WORKFOLDER: resolve(REPO_ROOT, envStr('WORKFOLDER', 'workfolder')),
  MODEL_CACHE_DIR: resolve(REPO_ROOT, envStr('MODEL_CACHE_DIR', 'data/modelscope')),

  // Device
  DEVICE: envStr('DEVICE', 'auto'),
  CUDA_DEVICE: envStrUndefined('CUDA_DEVICE'),

  // Translate API
  OPENAI_BASE_URL: envStr('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  OPENAI_MODEL: envStr('OPENAI_MODEL', 'gpt-4o-mini'),
} as const;
