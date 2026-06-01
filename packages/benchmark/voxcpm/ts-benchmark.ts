/** TypeScript VoxCPM benchmark — times load() and generate() for various input lengths. */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Import directly — the benchmark runs in the same workspace
import { VoxCPM } from '../../api/src/ml/voxcpm/voxcpm';

const RESULTS_DIR = join(__dirname, 'results');
const REF_WAV = join(__dirname, 'ref.wav');

const TEXTS: Record<string, string> = {
  short: '你好。',
  medium: '今天天气真不错，我们一起去公园散步吧。',
  long: '请播放一段关于人工智能发展的新闻。近年来，人工智能技术在各个领域都取得了显著的进展，从自然语言处理到计算机视觉，再到自动驾驶，AI正在改变我们的生活方式。',
};

interface BenchmarkResult {
  engine: string;
  text_key: string;
  text_len: number;
  load_time_s: number;
  generate_time_s: number;
  total_time_s: number;
  output_samples: number;
  output_duration_s: number;
}

async function run(textKey: keyof typeof TEXTS): Promise<BenchmarkResult> {
  const text = TEXTS[textKey];

  const t0 = performance.now();
  const model = new VoxCPM();
  await model.load();
  const loadTime = (performance.now() - t0) / 1000;

  const tGen0 = performance.now();
  const audio = await model.generate({
    text,
    referenceWavPath: REF_WAV,
    cfgValue: 2.0,
    maxPatches: 2000,
  });
  const genTime = (performance.now() - tGen0) / 1000;

  return {
    engine: 'typescript',
    text_key: textKey,
    text_len: text.length,
    load_time_s: round(loadTime, 3),
    generate_time_s: round(genTime, 3),
    total_time_s: round(loadTime + genTime, 3),
    output_samples: audio.length,
    output_duration_s: round(audio.length / 48000, 3),
  };
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const results: BenchmarkResult[] = [];
  for (const key of Object.keys(TEXTS) as (keyof typeof TEXTS)[]) {
    console.log(`\nBenchmarking text="${key}"...`);
    const r = await run(key);
    results.push(r);
    console.log(JSON.stringify(r, null, 2));
  }

  const summaryPath = join(RESULTS_DIR, 'ts-benchmark-summary.json');
  writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nSummary saved to ${summaryPath}`);
}

main().catch(console.error);
