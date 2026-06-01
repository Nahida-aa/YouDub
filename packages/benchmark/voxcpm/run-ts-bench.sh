#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../.."

# Run the TS benchmark using the workspace's Bun
bun run packages/benchmark/voxcpm/ts-benchmark.ts 2>&1
