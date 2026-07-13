import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const requiredFiles = [
  'scripts/perf/low-end-benchmark.mjs',
  'scripts/perf/low-end-harness.html',
  'scripts/perf/low-end-harness.js',
  'scripts/perf/synthetic-fixture.js',
];

await Promise.all([
  import('playwright'),
  import('vite'),
  ...requiredFiles.map((file) => access(path.join(process.cwd(), file))),
]);

process.stdout.write('Implementation performance bootstrap is ready.\n');
