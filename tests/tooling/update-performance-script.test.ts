import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createSyntheticPatchMap } from '../../performance/workloads';
import { PatchMap } from '../../src/engine';

// @ts-expect-error -- verification runner is authored as ESM JavaScript.
import * as updatePerformanceSource from '../../scripts/verification/patch-map-update-performance.mjs';

interface UpdateProtocol {
  warmups: number;
  measured: number;
  scales: readonly number[];
  partialFraction: number;
  seedBase: number;
}

interface SummaryStats {
  samples: readonly number[];
  min: number;
  median: number;
  p95: number;
  max: number;
}

interface UpdateTrial {
  trial: number;
  seed: number;
  timings: Record<string, number> & {
    fullBulkPatchMs: number;
    partialBulkPatchMs: number;
    emptyBulkPatchMs: number;
    invalidRollbackMs: number;
  };
  observations: {
    full: { status: string; applied: number };
    partial: { status: string; applied: number };
    empty: { status: string; sceneRevisionDelta: number };
    invalid: {
      status: string;
      diagnosticCode: string;
      sceneRevisionDelta: number;
      authorityPreserved: boolean;
    };
    reconcileCount: number;
    inputImmutable: boolean;
  };
}

interface UpdateRun {
  scale: number;
  itemTargetCount: number;
  partialTargetCount: number;
  warmupRaw: UpdateTrial[];
  measuredRaw: UpdateTrial[];
  summary: Record<string, SummaryStats> & {
    fullBulkPatchMs: SummaryStats;
    partialBulkPatchMs: SummaryStats;
    emptyBulkPatchMs: SummaryStats;
    invalidRollbackMs: SummaryStats;
  };
}

interface UpdatePerformanceOutput {
  schemaVersion: number;
  checkpoint: string;
  protocol: { warmups: number; measured: number; scales: number[] };
  runs: UpdateRun[];
}

interface UpdatePerformanceModule {
  UPDATE_PERFORMANCE_PROTOCOL: UpdateProtocol;
  runPatchMapUpdateTransactionTrial(
    this: void,
    runtime: unknown,
    scale: number,
    trial: number,
  ): Promise<unknown>;
  summarizeUpdateSamples(this: void, samples: readonly number[]): SummaryStats;
  validatePatchMapUpdatePerformanceOutput(this: void, output: unknown): boolean;
}

const {
  UPDATE_PERFORMANCE_PROTOCOL,
  runPatchMapUpdateTransactionTrial,
  summarizeUpdateSamples,
  validatePatchMapUpdatePerformanceOutput,
} = updatePerformanceSource as unknown as UpdatePerformanceModule;

describe('PatchMap update transaction performance checkpoint', () => {
  it('pins the isolated scale protocol to two warmups and seven measured trials', () => {
    expect(UPDATE_PERFORMANCE_PROTOCOL).toEqual({
      warmups: 2,
      measured: 7,
      scales: [100, 500, 1_000, 2_000, 5_000],
      partialFraction: 0.1,
      seedBase: 0xc0de_7500,
    });
  });

  it('preserves raw order and reports nearest-rank statistics', () => {
    expect(summarizeUpdateSamples([7, 1, 3, 2, 6, 5, 4])).toEqual({
      samples: [7, 1, 3, 2, 6, 5, 4],
      min: 1,
      median: 4,
      p95: 7,
      max: 7,
    });
    expect(() => summarizeUpdateSamples([1, Number.NaN])).toThrow(/finite non-negative/u);
  });

  it('exercises the actual public Engine transaction path without renderer timing', async () => {
    const result = await runPatchMapUpdateTransactionTrial(
      { PatchMap, createSyntheticPatchMap },
      10,
      0,
    );

    expect(result).toMatchObject({
      trial: 0,
      observations: {
        full: { status: 'committed', applied: 10 },
        partial: { status: 'committed', applied: 1 },
        empty: { status: 'unchanged', sceneRevisionDelta: 0 },
        invalid: {
          status: 'rejected',
          diagnosticCode: 'MISSING_TARGET',
          sceneRevisionDelta: 0,
          authorityPreserved: true,
        },
        reconcileCount: 2,
        inputImmutable: true,
      },
    });
  });

  it('rejects drift in raw trials, summaries, and atomic outcome observations', () => {
    const output = validOutput();
    expect(validatePatchMapUpdatePerformanceOutput(output)).toBe(true);

    const wrongSummary = structuredClone(output);
    wrongSummary.runs[0]!.summary.fullBulkPatchMs.median = 999;
    expect(() => validatePatchMapUpdatePerformanceOutput(wrongSummary)).toThrow(
      /100\/fullBulkPatchMs\/median mismatch/u,
    );

    const missingRollback = structuredClone(output);
    missingRollback.runs[4]!.measuredRaw[6]!.observations.invalid.authorityPreserved = false;
    expect(() => validatePatchMapUpdatePerformanceOutput(missingRollback)).toThrow(
      /5000\/trial 8 authority mismatch/u,
    );
  });

  it('rejects duplicate or reordered combined trial indices and seeds', () => {
    const duplicateIndex = structuredClone(validOutput());
    duplicateIndex.runs[0]!.measuredRaw[0]!.trial = 1;
    expect(() => validatePatchMapUpdatePerformanceOutput(duplicateIndex)).toThrow(
      /100\/trial 2 index mismatch \(received 1\)/u,
    );

    const reorderedIndices = structuredClone(validOutput());
    const firstMeasured = reorderedIndices.runs[1]!.measuredRaw[0]!;
    reorderedIndices.runs[1]!.measuredRaw[0] = reorderedIndices.runs[1]!.measuredRaw[1]!;
    reorderedIndices.runs[1]!.measuredRaw[1] = firstMeasured;
    expect(() => validatePatchMapUpdatePerformanceOutput(reorderedIndices)).toThrow(
      /500\/trial 2 index mismatch \(received 3\)/u,
    );

    const duplicateSeed = structuredClone(validOutput());
    duplicateSeed.runs[2]!.measuredRaw[0]!.seed = duplicateSeed.runs[2]!.warmupRaw[1]!.seed;
    expect(() => validatePatchMapUpdatePerformanceOutput(duplicateSeed)).toThrow(
      /1000\/trial 2 seed mismatch/u,
    );

    const reorderedSeeds = structuredClone(validOutput());
    const firstSeed = reorderedSeeds.runs[3]!.measuredRaw[0]!.seed;
    reorderedSeeds.runs[3]!.measuredRaw[0]!.seed = reorderedSeeds.runs[3]!.measuredRaw[1]!.seed;
    reorderedSeeds.runs[3]!.measuredRaw[1]!.seed = firstSeed;
    expect(() => validatePatchMapUpdatePerformanceOutput(reorderedSeeds)).toThrow(
      /2000\/trial 2 seed mismatch/u,
    );
  });

  it('stays expected-blind and labels the renderer exclusion explicitly', async () => {
    const source = await readFile(
      fileURLToPath(
        new URL('../../scripts/verification/patch-map-update-performance.mjs', import.meta.url),
      ),
      'utf8',
    );
    expect(source).toContain('public PatchMap transaction validation');
    expect(source).toContain('PixiJS renderer reconciliation');
    expect(source).toContain("vite.ssrLoadModule('/src/engine/index.ts')");
    expect(source).not.toMatch(/normalized-expected|catalog-evidence-manifest|review-registry/u);
    expect(source).not.toMatch(/from 'playwright'|chromium\.launch/u);
  });
});

function validOutput(): UpdatePerformanceOutput {
  const runs = UPDATE_PERFORMANCE_PROTOCOL.scales.map((scale) => {
    const partial = Math.max(1, Math.floor(scale * UPDATE_PERFORMANCE_PROTOCOL.partialFraction));
    const trial = (index: number) => ({
      trial: index,
      seed: UPDATE_PERFORMANCE_PROTOCOL.seedBase + scale * 31 + index,
      timings: {
        fullBulkPatchMs: index + 1,
        partialBulkPatchMs: index + 2,
        emptyBulkPatchMs: index + 3,
        invalidRollbackMs: index + 4,
      },
      observations: {
        full: { status: 'committed', applied: scale },
        partial: { status: 'committed', applied: partial },
        empty: { status: 'unchanged', sceneRevisionDelta: 0 },
        invalid: {
          status: 'rejected',
          diagnosticCode: 'MISSING_TARGET',
          sceneRevisionDelta: 0,
          authorityPreserved: true,
        },
        reconcileCount: 2,
        inputImmutable: true,
      },
    });
    const warmupRaw = [trial(0), trial(1)];
    const measuredRaw = Array.from({ length: 7 }, (_, index) => trial(index + 2));
    return {
      scale,
      itemTargetCount: scale,
      partialTargetCount: partial,
      warmupRaw,
      measuredRaw,
      summary: {
        fullBulkPatchMs: summarizeUpdateSamples(measuredRaw.map((entry) => entry.timings.fullBulkPatchMs)),
        partialBulkPatchMs: summarizeUpdateSamples(measuredRaw.map((entry) => entry.timings.partialBulkPatchMs)),
        emptyBulkPatchMs: summarizeUpdateSamples(measuredRaw.map((entry) => entry.timings.emptyBulkPatchMs)),
        invalidRollbackMs: summarizeUpdateSamples(measuredRaw.map((entry) => entry.timings.invalidRollbackMs)),
      },
    };
  });
  return {
    schemaVersion: 1,
    checkpoint: 'patch-map-update-transactions',
    protocol: {
      warmups: 2,
      measured: 7,
      scales: [...UPDATE_PERFORMANCE_PROTOCOL.scales],
    },
    runs,
  };
}
