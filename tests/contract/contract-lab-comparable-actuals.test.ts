import { describe, expect, it } from 'vitest';

import normalizedExpected from '../../contracts/evidence/catalog-normalized-expected.v1.json';
import type { PatchMapContractLabRunResult } from '../../lab/contract/bridge';
import { createPatchMapExecutableLabBridge } from '../../lab/contract/executable-bridge';
import packageConsumerEvidence from '../../contracts/evidence/qualification/package-consumer.json';
import {
  createFakeSurfaceFactory,
  createSurfaceHost,
  runPatchMapContractCase,
} from '../support/contract-lab-harness';
import type { FakeSurface } from '../support/contract-lab-harness';
// @ts-expect-error -- the independent browser-safe comparator is authored as ESM JavaScript.
import * as compareModule from '../../verification/contract/compare.mjs';

interface CompareRuntime {
  compareObservation(this: void, input: Readonly<Record<string, unknown>>): Readonly<{
    readonly passed: number;
    readonly failed: number;
    readonly assertions: readonly Readonly<{
      readonly passed: boolean;
      readonly path: string;
      readonly code: string;
      readonly actual: unknown;
      readonly expected: unknown;
    }>[];
  }>;
}

const { compareObservation } = compareModule as unknown as CompareRuntime;
const PACKED_CODE_COMMIT = packageConsumerEvidence.provenance.codeCommit;
const PACKED_PACKAGE_SHA256 =
  packageConsumerEvidence.provenance.packedPackageSha256;

describe('PatchMap executable Lab product bridge', () => {
  it.each([
    'PKG-001',
    'PKG-002',
    'PKG-003',
    'PKG-004',
    'PKG-005',
  ] as const)(
    'produces independently comparable packed integration actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'flat'),
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      expect(comparison.failed, JSON.stringify({
        failures,
        actual: run.actualObservation,
        captures: run.captures,
      })).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      expect(run.actualObservation).toMatchObject({
        provenance: {
          codeCommit: PACKED_CODE_COMMIT,
          packedPackageSha256: PACKED_PACKAGE_SHA256,
          expectedEvidenceBound: true,
        },
        environment: {
          contractProfileBound: true,
          offlineInstall: true,
          strictTypeScript: true,
        },
      });
      if (caseId === 'PKG-003') {
        expect(run.captures).toEqual({
          baselineB: {
            assetLeaseCount: 5,
            sceneSemanticHash: 'fnv1a64:b858a777de1619ca',
          },
        });
        expect(surfaces).toHaveLength(3);
      } else {
        expect(surfaces).toHaveLength(1);
      }
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await expect(bridge.destroyCase()).resolves.toMatchObject({
        status: 'completed',
        retainedCanvasCount: 0,
        retainedSubscriptionCount: 0,
        retainedPendingWork: 0,
      });
    },
    60_000,
  );

  it.each([
    'PIX-001',
    'PIX-002',
    'PIX-003',
    'PIX-005',
  ] as const)(
    'produces independently comparable PixiJS integration actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'flat', true),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      expect(comparison.failed, JSON.stringify({
        failures,
        actual: run.actualObservation,
      })).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      if (caseId === 'PIX-003') {
        expect(run.actualObservation).toMatchObject({
          outcome: {
            runtimeMatrix: {
              measuredCellCount: 0,
              pendingCellCount: 8,
            },
          },
        });
      }
      expect(run.execution).toMatchObject({
        cleanup: {
          status: 'completed',
          errors: [],
        },
      });
      const cleanup = isRecord(run.execution.cleanup) ? run.execution.cleanup : null;
      const releases: readonly unknown[] = cleanup && Array.isArray(cleanup.releases)
        ? cleanup.releases
        : [];
      expect(releases.length).toBeGreaterThan(0);
      expect(releases).toEqual(expect.arrayContaining([
        expect.objectContaining({
          remainingResources: {
            canvasCount: 0,
            subscriptions: 0,
            pendingWork: 0,
          },
        }),
      ]));
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'CSM-025',
    'CSM-026',
    'CSM-027',
    'CSM-033',
    'CSM-034',
  ] as const)(
    'produces independently comparable editor workflow actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      expect(comparison.failed, JSON.stringify({
        failures,
        actual: run.actualObservation,
      })).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      expect(run.cleanup).toMatchObject({
        status: 'completed',
        productResources: {
          runtimeCounts: {
            engines: 0,
            renderers: 0,
            listeners: 0,
            observers: 0,
            timers: 0,
            pendingWork: 0,
            retainedDatasets: 0,
            assetLeases: 0,
            editorSessions: 0,
          },
        },
      });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'DET-004',
    'PIX-004',
    'PRF-008',
    'CSM-035',
    'CSM-038',
  ] as const)(
    'produces independently comparable export/extraction actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      expect(comparison.failed, JSON.stringify({
        failures,
        actual: run.actualObservation,
      })).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      expect(run.cleanup).toMatchObject({
        status: 'completed',
        productResources: {
          retainedDataUrlCount: 0,
          temporaryImageCount: 0,
          renderTextureCount: 0,
        },
      });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'ERR-002',
    'ERR-005',
    'LIF-003',
    'CSM-002',
    'CSM-004',
    'CSM-037',
  ] as const)(
    'produces independently comparable replacement/recovery actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      expect(comparison.failed, JSON.stringify(failures)).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      expect(run.cleanup).toMatchObject({ status: 'completed' });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'ERR-004',
    'ERR-006',
    'CSM-017',
    'CSM-036',
  ] as const)(
    'produces independently comparable lifecycle/interruption actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      expect(comparison.failed, JSON.stringify({
        failures,
        actual: run.actualObservation,
      })).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      expect(run.cleanup).toMatchObject({ status: 'completed' });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'DET-001',
    'DET-002',
    'DET-003',
    'ANI-003',
    'LIF-006',
  ] as const)(
    'produces independently comparable determinism/lifecycle actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      expect(comparison.failed, JSON.stringify({
        failures,
        actual: run.actualObservation,
      })).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      expect(run.cleanup).toMatchObject({
        status: 'completed',
        productResources: {
          runtimeCounts: {
            activeSessionCount: 0,
            retainedDatasetCount: 0,
            rendererObjectCount: 0,
            subscriptionCount: 0,
            pendingPromiseCount: 0,
            pendingTimerCount: 0,
            pendingWorkCount: 0,
          },
        },
      });
      if (caseId === 'ANI-003') {
        expect(run.actualObservation.history).toMatchObject({
          actionIdAfterPatch: 'bar-destination',
        });
      }
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it('projects PRF-007 forced-GC evidence without consulting approved expected data', async () => {
    const originalGc = Object.getOwnPropertyDescriptor(globalThis, 'gc');
    const originalMemory = Object.getOwnPropertyDescriptor(performance, 'memory');
    let usedJSHeapSize = 8 * 1024 * 1024;
    Object.defineProperty(globalThis, 'gc', {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      value: {
        get usedJSHeapSize(): number {
          return usedJSHeapSize;
        },
      },
    });
    const surfaces: FakeSurface[] = [];
    try {
      const bridge = createPatchMapExecutableLabBridge({
        caseId: 'PRF-007',
        rootTestId: 'scenario-prf-007',
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      usedJSHeapSize += 256 * 1024;
      const run = await bridge.runCase();
      const expected = normalizedExpected.cases.find(({ id }) => id === 'PRF-007');
      expect(expected).toBeDefined();
      const comparison = compareObservation({
        expectedCase: expected,
        actual: run.actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
      });

      expect(comparison.assertions.filter(({ passed }) => !passed)).toEqual([]);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      expect(run.actualObservation).toMatchObject({
        resources: {
          postDestroyForcedGcGrowthMiB: 0,
          canvasDelta: 0,
          listenerDelta: 0,
          tickerDelta: 0,
          textureLeaseDelta: 0,
          pendingWorkDelta: 0,
        },
      });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    } finally {
      if (originalGc === undefined) delete (globalThis as { gc?: () => void }).gc;
      else Object.defineProperty(globalThis, 'gc', originalGc);
      if (originalMemory === undefined) {
        delete (performance as Performance & { memory?: unknown }).memory;
      } else {
        Object.defineProperty(performance, 'memory', originalMemory);
      }
    }
  }, 60_000);

  it.each([
    'VIE-001',
    'VIE-002',
    'VIE-003',
    'VIE-004',
    'VIE-005',
    'VIE-006',
    'VIE-007',
    'VIE-008',
    'CSM-009',
    'CSM-010',
  ] as const)(
    'produces independently comparable viewport actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison } = compareExpectedObservation(caseId, run);

      expect(comparison.assertions.filter(({ passed }) => !passed)).toEqual([]);
      expect(comparison.failed).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      expect(run.cleanup).toMatchObject({ status: 'completed' });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'QRY-001',
    'QRY-002',
    'SEL-001',
    'SEL-002',
    'SEL-003',
    'SEL-004',
  ] as const)(
    'produces independently comparable query/selection actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      if (caseId === 'QRY-001') {
        expect(comparison.failed, JSON.stringify(failures)).toBe(1);
        expect(failures).toMatchObject([
          { path: '/outcome/queries/ambiguous-component/code' },
        ]);
      } else {
        expect(comparison.failed, JSON.stringify(failures)).toBe(0);
        expect(comparison.passed).toBe(expected?.expected.assertions.length);
      }
      expect(run.cleanup).toMatchObject({ status: 'completed' });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'EVT-001',
    'EVT-002',
    'EVT-003',
    'EVT-004',
    'EVT-005',
    'EVT-006',
    'EVT-007',
    'EVT-008',
    'EVT-009',
    'SEL-005',
    'SEL-006',
    'SEL-007',
    'SEL-008',
    'SEL-009',
    'TRN-001',
    'TRN-002',
    'TRN-003',
    'TRN-004',
    'TRN-005',
    'TRN-006',
    'TRN-007',
    'TRN-008',
    'TRN-009',
    'TRN-010',
    'CSM-011',
    'CSM-012',
    'CSM-015',
    'CSM-016',
    'CSM-020',
    'CSM-021',
  ] as const)(
    'produces independently comparable pointer/selection actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      const immutableConflictPath = caseId === 'EVT-003'
        ? '/interaction/overlapRedrawTrace'
        : caseId === 'EVT-008'
          ? '/events/clickCounts'
          : null;
      if (immutableConflictPath === null) {
        expect(comparison.failed, JSON.stringify({
          failures,
          actual: run.actualObservation,
        })).toBe(0);
        expect(comparison.passed).toBe(expected?.expected.assertions.length);
      } else {
        expect(failures).toMatchObject([{ path: immutableConflictPath }]);
        expect(comparison.failed).toBe(1);
        expect(comparison.passed).toBe(
          (expected?.expected.assertions.length ?? 0) - 1,
        );
      }
      expect(run.cleanup).toMatchObject({ status: 'completed' });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'CSM-013',
    'CSM-018',
    'CSM-022',
    'CSM-023',
    'CSM-024',
  ] as const)(
    'produces independently comparable interaction/editor actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);
      const immutableConflictPaths = caseId === 'CSM-022'
        ? [
            '/geometry/targets/item-a/worldBounds/x',
            '/geometry/targets/rect-b/worldBounds/x',
            '/outcome/hostEngineSeam/failureRollback/conflictCode',
          ]
        : caseId === 'CSM-024'
          ? [
              '/interaction/hitTarget',
              '/outcome/hostEngineSeam/engineReturns/transformedHitTarget',
            ]
          : [];

      expect(
        failures.map(({ path }) => path),
        JSON.stringify({ failures, actual: run.actualObservation }),
      ).toEqual(immutableConflictPaths);
      expect(comparison.failed).toBe(immutableConflictPaths.length);
      expect(comparison.passed).toBe(
        (expected?.expected.assertions.length ?? 0) - immutableConflictPaths.length,
      );
      expect(run.cleanup).toMatchObject({ status: 'completed' });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'CSM-019',
    'CSM-028',
    'CSM-029',
    'CSM-030',
    'CSM-031',
  ] as const)(
    'produces independently comparable authoring actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);
      const immutableConflictPaths = caseId === 'CSM-028'
        ? [
            '/outcome/hostEngineSeam/engineReturns/firstDistributionHash',
            '/outcome/hostEngineSeam/engineReturns/secondDistributionHash',
          ]
        : caseId === 'CSM-030'
          ? [
              '/scene/targets/rect-b/parentId',
              '/outcome/hostEngineSeam/engineReturns/movedTarget',
              '/outcome/hostEngineSeam/engineReturns/parentId',
              '/outcome/hostEngineSeam/finalState/parentById/rect-b',
            ]
          : [];

      expect(
        failures.map(({ path }) => path),
        JSON.stringify({ failures, actual: run.actualObservation }),
      ).toEqual(immutableConflictPaths);
      expect(comparison.failed).toBe(immutableConflictPaths.length);
      expect(comparison.passed).toBe(
        (expected?.expected.assertions.length ?? 0) - immutableConflictPaths.length,
      );
      expect(run.cleanup).toMatchObject({ status: 'completed' });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );

  it.each([
    'HIS-001',
    'HIS-002',
    'HIS-003',
    'HIS-004',
    'HIS-005',
    'HIS-006',
  ] as const)(
    'produces independently comparable history actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const { bridge, run } = await runPatchMapContractCase({
        caseId,
        size: '100',
        seed: 319,
        surfaceHost: createSurfaceHost(),
        surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          routeSize: '100',
          runtimeResourceIds: [],
        },
      });
      const { expected, comparison, failures } =
        compareExpectedObservation(caseId, run);

      expect(comparison.failed, JSON.stringify({
        failures,
        actual: run.actualObservation,
      })).toBe(0);
      expect(comparison.passed).toBe(expected?.expected.assertions.length);
      if (caseId === 'HIS-001' || caseId === 'HIS-006') {
        const history = isRecord(run.actualObservation.history)
          ? run.actualObservation.history
          : {};
        const matrixKey = caseId === 'HIS-001'
          ? 'domainMatrix'
          : 'compoundDomainMatrix';
        const matrix = isRecord(history[matrixKey]) ? history[matrixKey] : {};
        const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
        expect(rows.map((row) => isRecord(row)
          ? [row.domain, isRecord(row.operation) ? row.operation.op : null]
          : null)).toEqual(caseId === 'HIS-001'
          ? [
              ['geometry', 'merge'],
              ['text', 'merge'],
              ['color', 'merge'],
              ['asset', 'merge'],
              ['style', 'merge'],
              ['placement', 'merge'],
              ['metadata', 'merge'],
              ['grid', 'merge'],
              ['relation', 'merge'],
              ['components', 'merge'],
              ['hierarchy', 'move'],
            ]
          : [
              ['create', 'add'],
              ['relation', 'merge'],
              ['grid', 'merge'],
              ['text', 'merge'],
              ['group', 'group'],
              ['ungroup', 'ungroup'],
              ['reorder', 'move'],
              ['duplicate', 'add'],
              ['delete', 'remove'],
            ]);
        expect(rows.every((row) => isRecord(row)
          && row.committed === true
          && row.semanticRestored === true
          && row.hostRestored === true)).toBe(true);
      }
      expect(run.cleanup).toMatchObject({ status: 'completed' });
      expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
      await bridge.destroyCase();
    },
    60_000,
  );
});

function compareExpectedObservation(
  caseId: string,
  run: Readonly<PatchMapContractLabRunResult>,
): Readonly<{
  readonly expected: (typeof normalizedExpected.cases)[number];
  readonly comparison: ReturnType<CompareRuntime['compareObservation']>;
  readonly failures: ReturnType<CompareRuntime['compareObservation']>['assertions'];
}> {
  const expected = normalizedExpected.cases.find(({ id }) => id === caseId);
  expect(expected).toBeDefined();
  if (expected === undefined) throw new Error(`missing normalized expected case ${caseId}`);
  const comparison = compareObservation({
    expectedCase: expected,
    actual: run.actualObservation,
    fixtures: run.fixtures,
    captures: run.captures,
  });
  return Object.freeze({
    expected,
    comparison,
    failures: comparison.assertions.filter(({ passed }) => !passed),
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
