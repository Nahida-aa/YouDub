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
  rtf: number;
}

export const TEXTS: Record<string, string> = {
  short: 'Hello, how are you?',
  medium: 'Today is a beautiful day. Let\'s go for a walk in the park and enjoy the sunshine together.',
  long: 'Artificial intelligence is transforming the way we live and work. From natural language processing to computer vision and autonomous driving, AI technologies have made remarkable progress in recent years. These advances are creating new opportunities and challenges across every industry.',
};

export function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export async function runBenchmark(ep: 'cpu' | 'webgpu'): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  const t0 = performance.now();
  const model = new VoxCPM(undefined, { executionProvider: ep });
  await model.load();
  const loadTime = (performance.now() - t0) / 1000;

  for (const [textKey, text] of Object.entries(TEXTS)) {
    console.log(`\n[${ep}] ${textKey}...`);
    const tGen0 = performance.now();
    const audio = await model.generate({ text, referenceWavPath: REF_WAV, cfgValue: 2.0 });
    const genTime = (performance.now() - tGen0) / 1000;

    const outDur = audio.length / 48000;
    const r: BenchmarkResult = {
      engine: 'typescript',
      device: ep,
      text_key: textKey,
      text_len: text.length,
      load_time_s: round(loadTime, 3),
      generate_time_s: round(genTime, 3),
      total_time_s: round(loadTime + genTime, 3),
      output_samples: audio.length,
      output_duration_s: round(outDur, 3),
      auto_patches: Math.ceil(audio.length / 7680),
      rtf: round(genTime / outDur, 3),
    };
    console.log(JSON.stringify(r));
    results.push(r);
  }

  return results;
}
