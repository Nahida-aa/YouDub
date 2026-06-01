import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runOne, RESULTS_DIR } from './bench-shared';

async function main() {
  const results = [];
  for (const key of ['short', 'medium', 'long'] as const) {
    console.log(`\n[WebGPU] ${key}...`);
    const r = await runOne('webgpu', key);
    console.log(JSON.stringify(r));
    results.push(r);
  }
  const outPath = join(RESULTS_DIR, 'ts-webgpu.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nSaved to ${outPath}`);
}

main().catch(console.error);
