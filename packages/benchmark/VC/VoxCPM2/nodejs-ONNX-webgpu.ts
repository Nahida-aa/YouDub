import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBenchmark, RESULTS_DIR } from './bench-shared';

async function main() {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const results = await runBenchmark('webgpu');
  const outPath = join(RESULTS_DIR, 'ts-webgpu.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nSaved to ${outPath}`);
}

main().catch(console.error);
