/** Shared benchmark runner for TS VoxCPM CPU / WebGPU comparison */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { VoxCPM } from '../../../api/src/ml/voxcpm/voxcpm';

export const RESULTS_DIR = join(__dirname, 'results');
export const REF_WAV = join(__dirname, 'ref.wav');

export interface BenchmarkResult {
  engine: string;
  device: string;
  text_key: string;
  text_len: number;
  load_time_s: number;
  generate_time_s: number;
  total_time_s: number;
  output_samples: number;
  output_duration_s: number;
  auto_patches: number;
}

export const TEXTS: Record<string, string> = {
  short: '你好。',
  medium: '今天天气真不错，我们一起去公园散步吧。',
  long: '请播放一段关于人工智能发展的新闻。近年来，人工智能技术在各个领域都取得了显著的进展，从自然语言处理到计算机视觉，再到自动驾驶，AI正在改变我们的生活方式。',
};

export function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export async function runOne(ep: 'cpu' | 'webgpu', textKey: string): Promise<BenchmarkResult> {
  const text = TEXTS[textKey];

  const t0 = performance.now();
  const model = new VoxCPM(undefined, { executionProvider: ep });
  await model.load();
  const loadTime = (performance.now() - t0) / 1000;

  const tGen0 = performance.now();
  // No explicit maxPatches → auto-compute from text length
  const audio = await model.generate({ text, referenceWavPath: REF_WAV, cfgValue: 2.0 });
  const genTime = (performance.now() - tGen0) / 1000;

  return {
    engine: 'typescript',
    device: ep,
    text_key: textKey,
    text_len: text.length,
    load_time_s: round(loadTime, 3),
    generate_time_s: round(genTime, 3),
    total_time_s: round(loadTime + genTime, 3),
    output_samples: audio.length,
    output_duration_s: round(audio.length / 48000, 3),
    auto_patches: Math.ceil(audio.length / 7680),
  };
}
