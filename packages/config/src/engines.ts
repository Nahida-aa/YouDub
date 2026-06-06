import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './root.ts';
import { env } from './env.ts';

export interface TTSEngineConfig {
  runtime: 'ort' | 'pytorch' | 'cloud';
  device: 'cpu' | 'gpu' | 'webgpu';
}

export interface ASREngineConfig {
  runtime: 'faster-whisper' | 'openai-whisper';
  device: 'cpu' | 'gpu';
}

export interface TranslateEngineConfig {
  apiBase: string;
  model: string;
}

export interface SeparateEngineConfig {
  runtime: 'demucs';
  device: 'cpu';
}

export interface EnginesConfig {
  tts: TTSEngineConfig;
  asr: ASREngineConfig;
  translate: TranslateEngineConfig;
  separate: SeparateEngineConfig;
}

export function readEnginesConfig(path?: string): EnginesConfig {
  const configPath = path ?? join(REPO_ROOT, 'packages', 'cli', 'config.json');
  let file: any = {};
  try {
    file = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch { /* use defaults */ }
  const e = file.engines ?? {};
  return {
    tts: { runtime: e.tts?.runtime ?? 'ort', device: e.tts?.device ?? 'webgpu' },
    asr: { runtime: e.asr?.runtime ?? 'faster-whisper', device: e.asr?.device ?? 'gpu' },
    translate: { apiBase: e.translate?.apiBase ?? env.OPENAI_BASE_URL, model: e.translate?.model ?? env.OPENAI_MODEL },
    separate: { runtime: e.separate?.runtime ?? 'demucs', device: e.separate?.device ?? 'cpu' },
  };
}
