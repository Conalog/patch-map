import path from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- performance runner is authored as ESM JavaScript.
import * as contractCliModule from '../../performance/contract-run/cli.mjs';
// @ts-expect-error -- verification helper is authored as ESM JavaScript.
import * as candidatePathModule from '../../verification/candidate-path.mjs';

interface ContractRunOptions {
  readonly resultsRoot: string;
}

interface ContractCliModule {
  readonly parseContractRunOptions: (
    arguments_: readonly string[],
    options: Readonly<{ readonly root: string; readonly resultsRoot: string }>,
  ) => ContractRunOptions;
}

interface CandidatePathModule {
  readonly resolvePatchMapCandidateInputPath: (options: Readonly<{
    readonly root: string;
    readonly value: string;
    readonly label: string;
    readonly prohibitedRoots?: readonly string[];
  }>) => string;
  readonly resolvePatchMapCandidateOutputPath: (options: Readonly<{
    readonly root: string;
    readonly value: string;
    readonly label: string;
    readonly prohibitedRoots?: readonly string[];
  }>) => string;
}

const { parseContractRunOptions } = contractCliModule as unknown as ContractCliModule;
const {
  resolvePatchMapCandidateInputPath,
  resolvePatchMapCandidateOutputPath,
} = candidatePathModule as unknown as CandidatePathModule;

const root = '/workspace/patch-map';
const resultsRoot = path.join(root, '.artifacts/performance/contract');

describe('PatchMap candidate output boundaries', () => {
  it('accepts transient workspace candidates and rejects escapes or generated artifacts', () => {
    expect(resolvePatchMapCandidateOutputPath({
      root,
      value: '.artifacts/performance/candidate.json',
      label: 'candidate',
    })).toBe(path.join(root, '.artifacts/performance/candidate.json'));
    for (const value of [
      '../outside.json',
      '.',
      'dist/evidence.json',
      'node_modules/evidence.json',
      '.artifacts/performance/candidate.map',
      '.artifacts/performance/candidate.bundle.js',
      'src/patch-map',
      'lab/patch-map',
      '.github/workflows',
      'scripts/verification',
    ]) {
      expect(() => resolvePatchMapCandidateOutputPath({ root, value, label: 'candidate' }))
        .toThrow();
    }
  });

  it('keeps read-only evidence resolution separate from output authority', () => {
    expect(resolvePatchMapCandidateInputPath({
      root,
      value: 'candidate-input/package.json',
      label: 'candidate input',
    })).toBe(path.join(root, 'candidate-input/package.json'));
    expect(() => resolvePatchMapCandidateInputPath({
      root,
      value: '../outside.json',
      label: 'candidate input',
    })).toThrow('workspace');
  });

  it('prevents contract runs from overwriting retained or immutable evidence', () => {
    const parse = (output: string) => parseContractRunOptions([
      'node',
      'contract-run.mjs',
      '--smoke',
      '--request-headless',
      '--output-dir',
      output,
    ], { root, resultsRoot });

    expect(parse('.artifacts/performance/fresh-contract').resultsRoot)
      .toBe(path.join(root, '.artifacts/performance/fresh-contract'));
    for (const output of [
      'src/patch-map',
      'lab/patch-map',
      '.github/workflows',
    ]) {
      expect(() => parse(output)).toThrow('.artifacts/performance');
    }
    for (const output of [
      'contracts/evidence/qualification',
      'contracts/evidence/qualification/nested',
      'contracts/evidence',
    ]) {
      expect(() => parse(output)).toThrow('protected evidence');
    }
  });
});
