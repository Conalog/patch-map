import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface BenchmarkOptionsRuntime {
  parseBenchmarkOptions(
    argv: readonly string[],
    paths: Readonly<{ root: string; resultsRoot: string }>,
  ): Readonly<Record<string, unknown>>;
  resolveBenchmarkOutput(root: string, value: string): string;
}

const { parseBenchmarkOptions, resolveBenchmarkOutput } = await import(
  /* @vite-ignore */ new URL('../../performance/benchmark/options.mjs', import.meta.url).href
) as BenchmarkOptionsRuntime;

const root = '/workspace/patch-map';
const resultsRoot = path.join(root, '.artifacts/performance/benchmark');

describe('PatchMap benchmark output boundary', () => {
  it('keeps generated measurements under .artifacts/performance', () => {
    expect(resolveBenchmarkOutput(root, '.artifacts/performance/candidate'))
      .toBe(path.join(root, '.artifacts/performance/candidate'));
    for (const output of ['../outside', 'src', 'docs', '.github/workflows']) {
      expect(() => resolveBenchmarkOutput(root, output))
        .toThrow('.artifacts/performance');
    }
  });

  it('parses smoke runs without external evidence inputs', () => {
    const options = parseBenchmarkOptions([
      'node',
      'benchmark.mjs',
      '--smoke',
      '--headless',
      '--output-dir',
      '.artifacts/performance/fresh-benchmark',
    ], { root, resultsRoot });

    expect(options).toMatchObject({
      smoke: true,
      resultsRoot: path.join(root, '.artifacts/performance/fresh-benchmark'),
      runSizes: [100],
      runWarmups: 0,
      runMeasured: 1,
    });
    expect(options).not.toHaveProperty('packageEvidencePath');
  });
});
