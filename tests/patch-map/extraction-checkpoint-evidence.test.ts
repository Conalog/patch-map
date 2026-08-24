import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const evidenceRoot = new URL(
  '../../docs/tasks/2026/07-15/performance-core-v2/evidence/',
  import.meta.url,
);

interface ExtractionDiagnostics {
  readonly requestedTuple: Readonly<Record<string, number>>;
  readonly capturedTuple: Readonly<Record<string, number>>;
  readonly cssSize: readonly number[];
  readonly backingSize: readonly number[];
  readonly dataUrlLengths: readonly number[];
  readonly sameCanvasObject: boolean;
  readonly authoritativeCanvasRetained: boolean;
  readonly temporaryImageCount: number;
  readonly renderTextureCount: number;
  readonly pendingWorkAfter: number;
  readonly inputUnchanged: boolean;
  readonly backend: string | null;
  readonly destroyReturned: boolean;
  readonly lifecycleAfterDestroy: string;
  readonly canvasCountAfterDestroy: number;
}

interface ExtractionTrial {
  readonly extractionSamplesMs: readonly number[];
  readonly totalMs: number;
  readonly retainedJsHeapBytes: number;
  readonly diagnostics: ExtractionDiagnostics;
}

interface ExtractionRun {
  readonly scale: number | string;
  readonly warmupRaw: readonly ExtractionTrial[];
  readonly measuredRaw: readonly ExtractionTrial[];
  readonly summary: Readonly<Record<string, {
    readonly samples: readonly number[];
    readonly min: number;
    readonly median: number;
    readonly p95: number;
    readonly max: number;
  }>>;
}

interface ExtractionPerformanceEvidence {
  readonly status: string;
  readonly protocol: {
    readonly warmups: number;
    readonly measured: number;
    readonly extractionsPerTrial: number;
    readonly cpuThrottleRate: number;
    readonly scales: readonly (number | string)[];
  };
  readonly environment: {
    readonly headed: boolean;
    readonly windowsNative: string;
  };
  readonly comparison: {
    readonly coreV1: string;
    readonly webgpu: string;
  };
  readonly errors: Readonly<Record<string, readonly unknown[]>>;
  readonly runs: readonly ExtractionRun[];
}

interface PackageEvidence {
  readonly status: string;
  readonly esm: {
    readonly engineExtraction: {
      readonly requestedTuple: Readonly<Record<string, number>>;
      readonly capturedTuple: Readonly<Record<string, number>>;
      readonly sameCanvasObject: boolean;
      readonly authoritativeCanvasRetained: boolean;
      readonly temporaryImageCount: number;
      readonly renderTextureCount: number;
      readonly pendingWorkAfter: number;
    };
    readonly engineAfterDestroy: {
      readonly lifecycle: string;
      readonly pendingWork: number;
      readonly canvasCount: number;
      readonly renderer: unknown;
      readonly assets: unknown;
    };
  };
  readonly cjs: {
    readonly extractionType: string;
  };
  readonly failures: readonly unknown[];
  readonly errors: Readonly<Record<string, readonly unknown[]>>;
}

interface MemoryEvidence {
  readonly status: string;
  readonly protocol: {
    readonly warmups: number;
    readonly measured: number;
  };
  readonly workload: {
    readonly expandedEntities: number;
  };
  readonly dom: {
    readonly canvasCount: number;
    readonly surfaceChildren: number;
  };
  readonly jsHeap: {
    readonly samples: readonly number[];
    readonly median: number;
    readonly p95: number;
    readonly maximum: number;
    readonly trend: number;
  };
  readonly hostInteractionLifecycle: readonly {
    readonly extractionBeforeDestroy: {
      readonly requestedTuple: Readonly<Record<string, number>>;
      readonly capturedTuple: Readonly<Record<string, number>>;
      readonly sameCanvasObject: boolean;
      readonly authoritativeCanvasRetained: boolean;
      readonly temporaryImageCount: number;
      readonly renderTextureCount: number;
      readonly pendingWorkAfter: number;
    };
    readonly snapshot: {
      readonly lifecycle: string;
      readonly pendingWork: number;
      readonly resources: {
        readonly canvasCount: number;
        readonly renderer: unknown;
      };
    };
    readonly retainedCanvasCount: number;
  }[];
  readonly lifecycleFailures: readonly unknown[];
  readonly failures: readonly unknown[];
  readonly errors: Readonly<Record<string, readonly unknown[]>>;
}

function readEvidence<T>(filename: string): {
  readonly bytes: Buffer;
  readonly value: T;
} {
  const bytes = readFileSync(new URL(filename, evidenceRoot));
  return {
    bytes,
    value: JSON.parse(bytes.toString('utf8')) as T,
  };
}

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function expectNoErrors(
  errors: Readonly<Record<string, readonly unknown[]>>,
): void {
  expect(Object.values(errors).every((entries) => entries.length === 0)).toBe(true);
}

describe('PatchMap extraction promotion evidence', () => {
  it('binds the packed ESM/CJS extraction proof to the promoted raw artifact', () => {
    const evidence = readEvidence<PackageEvidence>(
      'package-consumer-extraction-2026-07-24T08-21-00-249Z.json',
    );
    expect(digest(evidence.bytes)).toBe(
      '85f25fdab54ba605948d48b6bfa77420f7486b2a0e8bdb62a6da7c918364ec75',
    );
    expect(evidence.value.status).toBe('pass');
    expect(evidence.value.esm.engineExtraction.capturedTuple).toEqual(
      evidence.value.esm.engineExtraction.requestedTuple,
    );
    expect(evidence.value.esm.engineExtraction).toMatchObject({
      sameCanvasObject: true,
      authoritativeCanvasRetained: true,
      temporaryImageCount: 0,
      renderTextureCount: 0,
      pendingWorkAfter: 0,
    });
    expect(evidence.value.esm.engineAfterDestroy).toMatchObject({
      lifecycle: 'destroyed',
      pendingWork: 0,
      canvasCount: 0,
      renderer: null,
      assets: null,
    });
    expect(evidence.value.cjs.extractionType).toBe('function');
    expect(evidence.value.failures).toEqual([]);
    expectNoErrors(evidence.value.errors);
  });

  it('binds all 2+7 lifecycle extraction trials and retained-heap samples', () => {
    const evidence = readEvidence<MemoryEvidence>(
      'memory-extraction-2026-07-24T08-21-25-225Z.json',
    );
    expect(digest(evidence.bytes)).toBe(
      '374c59e86bf12beb2f2389012165223f138243fff93ccfe87f9d03de3910ed5f',
    );
    expect(evidence.value.status).toBe('pass');
    expect(evidence.value.protocol).toEqual({ warmups: 2, measured: 7 });
    expect(evidence.value.workload.expandedEntities).toBe(5_099);
    expect(evidence.value.hostInteractionLifecycle).toHaveLength(9);
    for (const trial of evidence.value.hostInteractionLifecycle) {
      expect(trial.extractionBeforeDestroy.capturedTuple).toEqual(
        trial.extractionBeforeDestroy.requestedTuple,
      );
      expect(trial.extractionBeforeDestroy).toMatchObject({
        sameCanvasObject: true,
        authoritativeCanvasRetained: true,
        temporaryImageCount: 0,
        renderTextureCount: 0,
        pendingWorkAfter: 0,
      });
      expect(trial.snapshot).toMatchObject({
        lifecycle: 'destroyed',
        pendingWork: 0,
        resources: { canvasCount: 0, renderer: null },
      });
      expect(trial.retainedCanvasCount).toBe(0);
    }
    expect(evidence.value.jsHeap).toMatchObject({
      samples: [185_227, 76_271, 403_503, 0, 12_931, 47_859, 206_959],
      median: 76_271,
      p95: 403_503,
      maximum: 403_503,
      trend: 21_732,
    });
    expect(evidence.value.dom).toEqual({ canvasCount: 0, surfaceChildren: 0 });
    expect(evidence.value.lifecycleFailures).toEqual([]);
    expect(evidence.value.failures).toEqual([]);
    expectNoErrors(evidence.value.errors);
  });

  it('binds every six-scale 4x raw extraction sample without hiding outliers', () => {
    const evidence = readEvidence<ExtractionPerformanceEvidence>(
      'extraction-performance-4x-2026-07-24T08-39-04-411Z.json',
    );
    expect(digest(evidence.bytes)).toBe(
      '8af3556e6c1f7f659353edf362606748eacf5224986db7b8b039615d5b936e03',
    );
    expect(evidence.value.status).toBe('pass');
    expect(evidence.value.protocol).toEqual({
      warmups: 2,
      measured: 7,
      extractionsPerTrial: 10,
      cpuThrottleRate: 4,
      scales: [100, 500, 1_000, 2_000, 5_000, 'production'],
    });
    expect(evidence.value.runs).toHaveLength(6);
    for (const run of evidence.value.runs) {
      expect(run.warmupRaw).toHaveLength(2);
      expect(run.measuredRaw).toHaveLength(7);
      for (const trial of [...run.warmupRaw, ...run.measuredRaw]) {
        expect(trial.extractionSamplesMs).toHaveLength(10);
        expect(trial.extractionSamplesMs.every(Number.isFinite)).toBe(true);
        expect(Number.isFinite(trial.totalMs)).toBe(true);
        expect(Number.isFinite(trial.retainedJsHeapBytes)).toBe(true);
        expect(trial.diagnostics.capturedTuple).toEqual(
          trial.diagnostics.requestedTuple,
        );
        expect(trial.diagnostics).toMatchObject({
          cssSize: [960, 540],
          sameCanvasObject: true,
          authoritativeCanvasRetained: true,
          temporaryImageCount: 0,
          renderTextureCount: 0,
          pendingWorkAfter: 0,
          inputUnchanged: true,
          backend: 'webgl',
          destroyReturned: true,
          lifecycleAfterDestroy: 'destroyed',
          canvasCountAfterDestroy: 0,
        });
        expect(trial.diagnostics.backingSize.every((value) => value > 0)).toBe(true);
        expect(trial.diagnostics.dataUrlLengths).toHaveLength(10);
      }
      for (const summary of Object.values(run.summary)) {
        expect(summary.samples).toHaveLength(
          summary === run.summary.allExtractionSamplesMs ? 70 : 7,
        );
        expect([summary.min, summary.median, summary.p95, summary.max]
          .every(Number.isFinite)).toBe(true);
      }
    }
    expect(evidence.value.runs.find(({ scale }) => scale === 5_000)
      ?.summary.extractionTotalMs?.p95).toBe(64_231);
    expect(evidence.value.runs.find(({ scale }) => scale === 'production')
      ?.summary.extractionTotalMs?.p95).toBe(110_215.20000000298);
    expect(evidence.value.environment).toMatchObject({
      headed: false,
      windowsNative: 'pending',
    });
    expect(evidence.value.comparison).toEqual({
      coreV1: 'not-comparable: no exact published-tuple extraction boundary',
      webgpu: 'experimental-not-run',
    });
    expectNoErrors(evidence.value.errors);
  });
});
