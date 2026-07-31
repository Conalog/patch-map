import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import normalizedExpected from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import {
  PatchMapContractExecutionNotImplementedError,
  type PatchMapContractLabRunResult,
} from '../../lab/patch-map/contract/bridge';
import { createPatchMapExecutableLabBridge } from '../../lab/patch-map/contract/executable-bridge';
import {
  PATCH_MAP_EXECUTABLE_CASE_IDS,
  materializePatchMapExecutableCase,
} from '../../lab/patch-map/contract/executable-cases';
import { resolvePatchMapExecutableRuntime } from '../../lab/patch-map/contract/executable-runtime';
import packageConsumerEvidence from '../../performance/patch-map/results/package-consumer.json';
import {
  FailingDestroySurface,
  createFakeSurfaceFactory,
  createSurfaceHost,
  runPatchMapContractCase,
} from './support/contract-lab-harness';
import type { FakeSurface } from './support/contract-lab-harness';
// @ts-expect-error -- the independent browser-safe comparator is authored as ESM JavaScript.
import * as compareModule from '../../scripts/verification/core-v2-contract/compare.mjs';

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
const contractLabHarnessUrl = new URL(
  './support/contract-lab-harness.ts',
  import.meta.url,
);

describe('PatchMap executable Lab product bridge', () => {
  it('keeps the actual-only contract Lab harness outside the expected comparison boundary', async () => {
    const source = await readFile(contractLabHarnessUrl, 'utf8');

    expect(source).not.toMatch(
      /catalog-normalized-expected|compareObservation|expectedCase|docs\/reference/u,
    );
  });

  it('binds packed route observations to the current candidate proof', () => {
    expect(PACKED_CODE_COMMIT).toMatch(/^[0-9a-f]{40}$/u);
    expect(PACKED_PACKAGE_SHA256).toMatch(/^[0-9a-f]{64}$/u);
    expect(packageConsumerEvidence.provenance.expectedEvidenceBound).toBe(true);
    expect(packageConsumerEvidence.artifact.sha256).toBe(PACKED_PACKAGE_SHA256);
    expect(packageConsumerEvidence.supplyChain.sourceRevision).toBe(PACKED_CODE_COMMIT);
  });

  it.each(PATCH_MAP_EXECUTABLE_CASE_IDS.filter(
    (caseId) => caseId !== 'DAT-008'
      && caseId !== 'AST-001'
      && caseId !== 'ERR-003'
      && caseId !== 'AST-002'
      && caseId !== 'AST-003'
      && caseId !== 'SEC-001'
      && caseId !== 'CSM-032'
      && caseId !== 'REN-005'
      && caseId !== 'REN-006'
      && caseId !== 'REN-008'
      && caseId !== 'REN-010'
      && caseId !== 'REN-011'
      && caseId !== 'REN-009'
      && caseId !== 'LAY-002'
      && caseId !== 'LAY-003'
      && caseId !== 'UPD-005'
      && caseId !== 'ANI-001'
      && caseId !== 'ANI-002'
      && caseId !== 'UPD-008'
      // The performance routes intentionally execute their 2,000/5,000-object
      // product workloads only in the dedicated unit/headless checkpoint.
      && caseId !== 'PRF-001'
      && caseId !== 'PRF-002'
      && caseId !== 'PRF-003'
      && caseId !== 'PRF-004'
      && caseId !== 'PRF-005'
      && caseId !== 'PRF-006'
      && caseId !== 'PRF-009',
  ))(
    'executes %s through a targeted PatchMap and retains actual-only cleanup facts',
    async (caseId) => {
      const surfaceHost = createSurfaceHost();
      const surfaces: FakeSurface[] = [];
      const receivedTargets: Array<HTMLElement | undefined> = [];
      const surfaceFactory = createFakeSurfaceFactory(
        surfaces,
        receivedTargets,
        [
          'LAY-004',
          'REN-007',
          'UPD-004',
          'UPD-009',
          'UPD-010',
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
          'QRY-001',
          'QRY-002',
          'SEL-001',
          'SEL-002',
          'SEL-003',
          'SEL-004',
          'SEL-005',
          'SEL-006',
          'SEL-007',
          'SEL-009',
          'EVT-001',
          'EVT-002',
          'EVT-003',
          'EVT-004',
          'EVT-005',
          'EVT-006',
          'EVT-007',
          'EVT-008',
          'EVT-009',
          'SEL-008',
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
          'CSM-013',
          'CSM-018',
          'CSM-022',
          'CSM-023',
          'CSM-024',
          'CSM-019',
          'CSM-028',
          'CSM-029',
          'CSM-030',
          'CSM-031',
          'CSM-025',
          'CSM-026',
          'CSM-027',
          'CSM-033',
          'CSM-034',
        ].includes(caseId)
          ? 'projection'
          : 'flat',
        caseId.startsWith('PIX-'),
      );
      const bridge = createPatchMapExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
        size: '5000',
        seed: 4_294_967_295,
        surfaceHost,
        surfaceFactory,
        environment: { browser: 'vitest', backend: 'webgl2', routeSize: '5000' },
      });

      expect(bridge.state()).toMatchObject({
        caseId,
        status: 'armed',
        actionIndex: -1,
        repeatIndex: 0,
      });
      const run = await bridge.runCase();

      expect(run.status).toBe('observed');
      expect(bridge.state().status).toBe('observed');
      expect(bridge.state().actionIndex).toBe(run.execution.actionResults instanceof Array
        ? run.execution.actionResults.length - 1
        : -1);
      expect(run.execution).toMatchObject({
        $schema: 'core-v2-contract-case-execution/1',
        caseId,
        status: 'completed',
        cleanup: { status: 'completed', errors: [] },
      });
      expect(run.actualObservation).toMatchObject({
        $schema: 'core-v2-semantic-observation/1',
        case: { id: caseId },
      });
      if (caseId.startsWith('PKG-')) {
        expect(run.actualObservation).toMatchObject({
          provenance: {
            codeCommit: PACKED_CODE_COMMIT,
            packedPackageSha256: PACKED_PACKAGE_SHA256,
            expectedEvidenceBound: true,
          },
          environment: {
            browserVersion: '143.0.7499.4',
            contractProfileBound: true,
          },
        });
      } else {
        expect(run.actualObservation).toMatchObject({
          provenance: {
            codeCommit: 'unbound-worktree-source',
            packedPackageSha256: 'not-packed-source-lab',
            promotionEligible: false,
          },
          environment: { backend: 'webgl2', routeSize: '5000' },
        });
      }
      expect(bridge.execution()).toBe(run.execution);
      expect(bridge.cleanup()).toBe(run.cleanup);
      const hasProductSurface = caseId !== 'SEC-003' && caseId !== 'SEC-004';
      if (!hasProductSurface) {
        expect(surfaces).toHaveLength(0);
        expect(receivedTargets).toHaveLength(0);
      } else {
        expect(surfaces.length).toBeGreaterThan(0);
        expect(surfaces.every((surface) => surface.destroyed)).toBe(true);
        expect(receivedTargets.every((target) => target === surfaceHost)).toBe(true);
        expect(surfaces.every((surface) => surface.preference === 'webgl')).toBe(true);
      }
      if (caseId.startsWith('PKG-')) {
        expect(run.actualObservation).toMatchObject({
          outcome: { packageEvidenceStatus: 'pass' },
        });
      } else {
        expect(JSON.stringify(run)).not.toContain('"status":"pass"');
      }
      if (caseId === 'VIE-001') {
        await expect(bridge.armGesture(0)).resolves.toMatchObject({
          revision: 'core-v2-contract-gesture-plan/1',
          actionIndex: 0,
          driverId: 'trusted-pointer-wheel',
          button: 0,
        });
        await expect(bridge.actualObservation()).resolves.toMatchObject({
          $schema: 'core-v2-contract-gesture-observation/1',
          case: { id: 'VIE-001', actionIndex: 0 },
          resources: { canvasCount: 1, pendingWork: 0 },
        });
        await expect(bridge.awaitMilestone(0, 'released')).resolves.toBeUndefined();
      } else if (caseId === 'EVT-003' || caseId === 'EVT-008' || caseId === 'ACC-002') {
        await expect(bridge.armGesture(0)).resolves.toMatchObject({
          revision: 'core-v2-contract-gesture-plan/1',
          actionIndex: 0,
          driverId: caseId === 'EVT-003'
            ? 'trusted-pointer-hover-leave'
            : caseId === 'EVT-008'
              ? 'trusted-secondary-contextmenu'
              : 'trusted-accessibility-click',
          button: caseId === 'EVT-008' ? 2 : 0,
        });
        await expect(bridge.actualObservation()).resolves.toMatchObject({
          $schema: 'core-v2-contract-pointer-input-observation/1',
          case: { id: caseId, actionIndex: 0 },
          resources: { canvasCount: 1, pendingWork: 0 },
        });
        await expect(bridge.awaitMilestone(0, 'released')).resolves.toBeUndefined();
      } else {
        await expect(
          bridge.armGesture(0),
        ).rejects.toBeInstanceOf(PatchMapContractExecutionNotImplementedError);
      }
      await expect(
        bridge.awaitMilestone(run.execution.actionResults instanceof Array
          ? run.execution.actionResults.length - 1
          : 0, 'released'),
      ).resolves.toBeUndefined();

      const destroyed = await bridge.destroyCase();
      const executionCleanup = isRecord(run.execution.cleanup) ? run.execution.cleanup : null;
      const executorReleaseCount = executionCleanup && Array.isArray(executionCleanup.releases)
        ? executionCleanup.releases.length
        : 0;
      expect(destroyed).toMatchObject({
        status: 'completed',
        runCount: 1,
        completedRunCount: 1,
        releasedEngineCount: executorReleaseCount
          + Number(resolvePatchMapExecutableRuntime(caseId).needsSupplementalWebGLLease),
        retainedCanvasCount: hasProductSurface ? 0 : null,
        retainedSubscriptionCount: hasProductSurface ? 0 : null,
        retainedPendingWork: hasProductSurface ? 0 : null,
      });
      expect(bridge.state().status).toBe('destroyed');
      expect(await bridge.actualObservation()).toBe(run.actualObservation);
    },
    60_000,
  );

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
            assetLeaseCount: 1,
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

  it('repeats DAT-002 in fresh isolated generations and reset clears only Lab-held results', async () => {
    const surfaceHost = createSurfaceHost();
    const surfaces: FakeSurface[] = [];
    const receivedTargets: Array<HTMLElement | undefined> = [];
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'DAT-002',
      rootTestId: 'scenario-dat-002',
      size: '100',
      seed: 319,
      surfaceHost,
      surfaceFactory: createFakeSurfaceFactory(surfaces, receivedTargets),
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    const first = await bridge.runCase();
    const firstSurfaceCount = surfaces.length;
    const second = await bridge.repeatCase();

    expect(firstSurfaceCount).toBe(2);
    expect(surfaces).toHaveLength(4);
    expect(first.execution).not.toBe(second.execution);
    expect(first.actualObservation).not.toBe(second.actualObservation);
    expect(JSON.stringify(first.actualObservation)).toBe(JSON.stringify(second.actualObservation));
    expect(bridge.state().repeatIndex).toBe(1);
    expect(surfaces.every((surface) => surface.destroyed)).toBe(true);
    expect(receivedTargets).toHaveLength(4);
    expect(receivedTargets.every((target) => target === surfaceHost)).toBe(true);
    expect(eventGenerations(first.execution)).toEqual([
      '1:session:1:ready',
      '1:session:1:sceneCommitted',
      '1:session:1:destroyed',
      '2:session:2:ready',
      '2:session:2:sceneCommitted',
      '2:session:2:destroyed',
    ]);
    expect(eventGenerations(second.execution)).toEqual(eventGenerations(first.execution));

    const reset = await bridge.resetCase();
    expect(reset).toMatchObject({
      status: 'completed',
      runCount: 2,
      completedRunCount: 2,
      releasedEngineCount: 2,
      retainedCanvasCount: 0,
    });
    expect(bridge.state()).toMatchObject({ status: 'armed', actionIndex: -1, repeatIndex: 0 });
    expect(bridge.execution()).toBeNull();
    expect(bridge.cleanup()).toBeNull();

    const afterReset = await bridge.runCase();
    expect(afterReset.execution).not.toBe(second.execution);
    expect(bridge.state().repeatIndex).toBe(0);
    expect(surfaces).toHaveLength(6);
    expect(surfaces.every((surface) => surface.destroyed)).toBe(true);
    expect(await bridge.destroyCase()).toMatchObject({
      runCount: 3,
      completedRunCount: 3,
      retainedCanvasCount: 0,
    });
  });

  it('executes and repeats the exact REN-007 relation handler/fold with deterministic cleanup', async () => {
    const surfaces: FakeSurface[] = [];
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'REN-007',
      rootTestId: 'scenario-ren-007',
      size: '100',
      seed: 319,
      surfaceHost: createSurfaceHost(),
      surfaceFactory: createFakeSurfaceFactory(surfaces, [], 'projection'),
      environment: { browser: 'vitest', backend: 'webgl2', routeSize: '100' },
    });

    const first = await bridge.runCase();
    const second = await bridge.repeatCase();

    expect(first.execution).toMatchObject({
      caseId: 'REN-007',
      status: 'completed',
      cleanup: { status: 'completed', errors: [] },
    });
    expect(first.execution.actionResults).toHaveLength(6);
    expect(first.actualObservation).toMatchObject({
      case: { id: 'REN-007', params: { size: '100', seed: 319 } },
      geometry: { relations: { selfLink: { kind: 'polyline' } } },
      outcome: { deterministic: true, inputUnchanged: true },
      resources: { cleanup: { status: 'completed', errors: [] } },
    });
    expect(JSON.stringify(second.actualObservation)).toBe(JSON.stringify(first.actualObservation));
    expect(surfaces).toHaveLength(4);
    expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
    expect(await bridge.destroyCase()).toMatchObject({
      status: 'completed',
      runCount: 2,
      completedRunCount: 2,
      releasedEngineCount: 2,
      retainedCanvasCount: 0,
      retainedSubscriptionCount: 0,
      retainedPendingWork: 0,
    });
  });

  it('executes and repeats AST-001 with one shared asset runtime and deterministic cleanup', async () => {
    const surfaces: FakeSurface[] = [];
    const receivedTargets: Array<HTMLElement | undefined> = [];
    const surfaceHost = createSurfaceHost();
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'AST-001',
      rootTestId: 'scenario-ast-001',
      size: '100',
      seed: 319,
      surfaceHost,
      surfaceFactory: createFakeSurfaceFactory(surfaces, receivedTargets),
      environment: { browser: 'vitest', backend: 'webgl2', routeSize: '100' },
    });

    const first = await bridge.runCase();
    const second = await bridge.repeatCase();

    for (const run of [first, second]) {
      expect(run.execution).toMatchObject({
        caseId: 'AST-001',
        status: 'completed',
        cleanup: { status: 'completed', errors: [] },
      });
      expect(run.execution.actionResults).toHaveLength(8);
      expect(actionStatuses(run.execution.actionResults)).toEqual(
        Array.from({ length: 8 }, () => 'completed'),
      );
      expect(run.actualObservation).toMatchObject({
        case: { id: 'AST-001', params: { size: '100', seed: 319 } },
        text: { fonts: { weights: [300, 400, 500, 600, 700] } },
        paint: {
          builtins: {
            aliases: [
              'object',
              'inverter',
              'combiner',
              'device',
              'edge',
              'loading',
              'warning',
              'wifi',
            ],
          },
        },
        events: { requiredFailure: { readyCount: 0 } },
        outcome: {
          recorded: true,
          aliasConflict: { code: 'CONFLICT' },
          requiredFailure: { code: 'ASSET_LOAD_FAILED', initState: 'rejected' },
        },
        resources: {
          cache: {
            device: {
              resourceCount: 1,
              leaseCount: { afterA: 1, afterB: 0 },
            },
          },
          afterDestroy: { resourceCount: 0, leaseCount: 0, pendingCount: 0 },
          assets: { pendingCount: 0 },
          requiredFailure: { canvasCount: 0, pendingCount: 0, leaseCount: 0 },
          cleanup: { status: 'completed', errors: [] },
        },
      });
      expect(JSON.stringify(run.actualObservation)).not.toContain('ASSET_ALIAS_CONFLICT');
    }

    expect(JSON.stringify(second.actualObservation)).toBe(JSON.stringify(first.actualObservation));
    const cleanup = isRecord(first.execution.cleanup) ? first.execution.cleanup : null;
    expect(cleanup).toMatchObject({ status: 'completed', errors: [] });
    expect(cleanup && Array.isArray(cleanup.releases) ? cleanup.releases : []).toHaveLength(3);
    expect(surfaces).toHaveLength(2);
    expect(surfaces.every(({ destroyed }) => destroyed)).toBe(true);
    expect(receivedTargets).toEqual([surfaceHost, surfaceHost]);
    expect(resolvePatchMapExecutableRuntime('AST-001')).toMatchObject({
      key: 'assets',
      needsSupplementalWebGLLease: true,
    });
    expect(await bridge.destroyCase()).toMatchObject({
      status: 'completed',
      runCount: 2,
      completedRunCount: 2,
      releasedEngineCount: 4,
      retainedCanvasCount: 0,
      retainedSubscriptionCount: 0,
      retainedPendingWork: 0,
    });
  });

  it('retains a failed actual record and cleanup when the WebGL surface cannot initialize', async () => {
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'LIF-001',
      rootTestId: 'scenario-lif-001',
      size: '100',
      seed: 319,
      surfaceHost: createSurfaceHost(),
      surfaceFactory: () => Promise.reject(new Error('synthetic WebGL initialization failure')),
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    await expect(bridge.runCase()).rejects.toThrow(/INTERNAL_FAILURE.*initialize/u);
    expect(bridge.state().status).toBe('failed');
    expect(bridge.execution()).toMatchObject({ status: 'failed' });
    expect(bridge.cleanup()).toMatchObject({ status: 'completed', errors: [] });
    const actual = await bridge.actualObservation();
    expect(actual).toMatchObject({
      $schema: 'core-v2-contract-lab-failure/1',
      case: { id: 'LIF-001', params: { size: '100', seed: 319 } },
      outcome: { status: 'failed', promotionEligible: false },
    });
    expect(JSON.stringify(actual)).not.toContain('"status":"pass"');
    expect(await bridge.destroyCase()).toMatchObject({ retainedCanvasCount: 0 });
  });

  it('does not report completed cleanup when a supplemental WebGL teardown fails', async () => {
    const surface = new FailingDestroySurface({
      width: 800,
      height: 600,
      pixelRatio: 1,
      antialias: true,
      background: 0xffffffff,
      strategy: 'mesh',
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'DAT-003',
      rootTestId: 'scenario-dat-003',
      size: '100',
      seed: 319,
      surfaceHost: createSurfaceHost(),
      surfaceFactory: () => Promise.resolve(surface),
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    await expect(bridge.runCase()).rejects.toThrow(/INTERNAL_FAILURE.*destroy/u);
    expect(bridge.state().status).toBe('failed');
    expect(bridge.cleanup()).toMatchObject({
      status: 'failed',
      supplementalWebGLLease: {
        status: 'failed',
        error: { message: 'INTERNAL_FAILURE: destroy' },
      },
    });
    expect(await bridge.destroyCase()).toMatchObject({
      status: 'failed',
      releasedEngineCount: 0,
    });
  });

  it('executes DAT-008 without fabricating the immutable missing binding operand', async () => {
    const surfaceHost = createSurfaceHost();
    const surfaces: FakeSurface[] = [];
    const receivedTargets: Array<HTMLElement | undefined> = [];
    const plan = materializePatchMapExecutableCase('DAT-008', '100', 319);
    expect(plan.actionTrace[2]).toMatchObject({
      type: 'retainTarget',
      operands: { id: 'explicit-a' },
    });
    expect(plan.actionTrace[2]?.operands).not.toHaveProperty('as');

    const bridge = createPatchMapExecutableLabBridge({
      caseId: 'DAT-008',
      rootTestId: 'scenario-dat-008',
      size: '100',
      seed: 319,
      surfaceHost,
      surfaceFactory: createFakeSurfaceFactory(surfaces, receivedTargets),
      environment: { browser: 'vitest', backend: 'webgl2' },
    });

    await expect(bridge.runCase()).rejects.toThrow(/retainTarget binding operand as/u);
    expect(bridge.state()).toMatchObject({ status: 'failed', actionIndex: 2 });
    expect(bridge.execution()).toMatchObject({
      caseId: 'DAT-008',
      status: 'failed',
      cleanup: { status: 'completed', errors: [] },
    });
    expect(bridge.cleanup()).toMatchObject({ status: 'completed', errors: [] });
    const actual = await bridge.actualObservation();
    expect(actual).toMatchObject({
      $schema: 'core-v2-contract-lab-failure/1',
      case: { id: 'DAT-008' },
      outcome: {
        status: 'failed',
        promotionEligible: false,
      },
    });
    const outcome = actual.outcome;
    if (!isRecord(outcome) || !isRecord(outcome.error)) {
      throw new Error('DAT-008 failure observation is missing its execution error');
    }
    expect(outcome.error.message).toMatch(/retainTarget binding operand as/u);
    expect(surfaces.length).toBeGreaterThan(0);
    expect(surfaces.every((surface) => surface.destroyed)).toBe(true);
    expect(surfaces.every((surface) => surface.preference === 'webgl')).toBe(true);
    expect(receivedTargets.every((target) => target === surfaceHost)).toBe(true);
    expect(await bridge.destroyCase()).toMatchObject({
      status: 'completed',
      runCount: 1,
      completedRunCount: 0,
      retainedCanvasCount: 0,
      retainedSubscriptionCount: 0,
      retainedPendingWork: 0,
    });
  });

  it('selects one collision-free handler/fold runtime descriptor for every executable case', () => {
    const runtimeByCase = Object.fromEntries(
      PATCH_MAP_EXECUTABLE_CASE_IDS.map((caseId) => [
        caseId,
        resolvePatchMapExecutableRuntime(caseId).key,
      ]),
    );

    expect(runtimeByCase).toEqual({
      'EVT-001': 'pointer-selection',
      'EVT-002': 'pointer-selection',
      'EVT-003': 'pointer-selection',
      'EVT-004': 'pointer-selection',
      'EVT-005': 'pointer-selection',
      'EVT-006': 'pointer-selection',
      'EVT-007': 'pointer-selection',
      'EVT-008': 'pointer-selection',
      'EVT-009': 'pointer-selection',
      'HIS-001': 'history',
      'HIS-002': 'history',
      'HIS-003': 'history',
      'HIS-004': 'history',
      'HIS-005': 'history',
      'HIS-006': 'history',
      'ERR-001': 'update-transactions',
      'ERR-002': 'replacement-recovery',
      'ERR-003': 'asset-ingestion',
      'ERR-004': 'lifecycle-interruption',
      'ERR-005': 'replacement-recovery',
      'ERR-006': 'lifecycle-interruption',
      'DET-001': 'determinism-lifecycle',
      'DET-002': 'determinism-lifecycle',
      'DET-003': 'determinism-lifecycle',
      'DET-004': 'export-extraction',
      'PRF-001': 'performance',
      'PRF-002': 'performance',
      'PRF-003': 'performance',
      'PRF-004': 'performance',
      'PRF-005': 'performance',
      'PRF-006': 'performance',
      'PRF-007': 'lifecycle-interruption',
      'PRF-008': 'export-extraction',
      'PRF-009': 'performance',
      'LIF-001': 'foundation',
      'LIF-002': 'foundation',
      'LIF-003': 'replacement-recovery',
      'LIF-004': 'lifecycle-resize',
      'LIF-005': 'lifecycle-destroy',
      'LIF-006': 'determinism-lifecycle',
      'ACC-001': 'accessibility',
      'ACC-002': 'accessibility',
      'ACC-003': 'accessibility',
      'OPS-001': 'security-operations',
      'OPS-002': 'security-operations',
      'MIG-001': 'migration',
      'MIG-002': 'migration',
      'MIG-003': 'migration',
      'DAT-001': 'foundation',
      'DAT-002': 'foundation',
      'DAT-003': 'data-foundation',
      'DAT-004': 'data-foundation',
      'DAT-005': 'data-foundation',
      'DAT-006': 'data-closure',
      'DAT-007': 'data-closure',
      'DAT-008': 'data-closure',
      'PIX-001': 'pixijs-integration',
      'PIX-002': 'pixijs-integration',
      'PIX-003': 'pixijs-integration',
      'PIX-004': 'export-extraction',
      'PIX-005': 'pixijs-integration',
      'PKG-001': 'package-integration',
      'PKG-002': 'package-integration',
      'PKG-003': 'package-integration',
      'PKG-004': 'package-integration',
      'PKG-005': 'package-integration',
      'AST-001': 'assets',
      'AST-002': 'asset-ingestion',
      'AST-003': 'asset-ingestion',
      'SEC-001': 'asset-ingestion',
      'SEC-002': 'security-operations',
      'SEC-003': 'security-operations',
      'SEC-004': 'security-operations',
      'UPD-001': 'update-transactions',
      'UPD-002': 'update-transactions',
      'UPD-003': 'update-transactions',
      'UPD-004': 'update-transactions',
      'UPD-005': 'presentation-dynamics',
      'UPD-006': 'update-transactions',
      'UPD-007': 'update-transactions',
      'UPD-008': 'update-transactions',
      'UPD-009': 'update-transactions',
      'UPD-010': 'update-transactions',
      'UPD-011': 'update-transactions',
      'UPD-012': 'update-transactions',
      'UPD-013': 'update-transactions',
      'UPD-014': 'update-transactions',
      'VIE-001': 'viewport',
      'QRY-001': 'query-selection',
      'QRY-002': 'query-selection',
      'SEL-001': 'query-selection',
      'SEL-002': 'query-selection',
      'SEL-003': 'query-selection',
      'SEL-004': 'query-selection',
      'SEL-005': 'pointer-selection',
      'SEL-006': 'pointer-selection',
      'SEL-007': 'pointer-selection',
      'SEL-008': 'pointer-selection',
      'SEL-009': 'pointer-selection',
      'TRN-001': 'pointer-selection',
      'TRN-002': 'pointer-selection',
      'TRN-003': 'pointer-selection',
      'TRN-004': 'pointer-selection',
      'TRN-005': 'pointer-selection',
      'TRN-006': 'pointer-selection',
      'TRN-007': 'pointer-selection',
      'TRN-008': 'pointer-selection',
      'TRN-009': 'pointer-selection',
      'TRN-010': 'pointer-selection',
      'VIE-002': 'viewport',
      'VIE-003': 'viewport',
      'VIE-004': 'viewport',
      'VIE-005': 'viewport',
      'VIE-006': 'viewport',
      'VIE-007': 'viewport',
      'VIE-008': 'viewport',
      'ANI-001': 'presentation-dynamics',
      'ANI-002': 'presentation-dynamics',
      'ANI-003': 'determinism-lifecycle',
      'CSM-001': 'foundation',
      'CSM-002': 'replacement-recovery',
      'CSM-003': 'foundation',
      'CSM-004': 'replacement-recovery',
      'CSM-005': 'update-transactions',
      'CSM-006': 'update-transactions',
      'CSM-007': 'update-transactions',
      'CSM-008': 'update-transactions',
      'CSM-009': 'viewport',
      'CSM-010': 'viewport',
      'CSM-011': 'pointer-selection',
      'CSM-012': 'pointer-selection',
      'CSM-013': 'interaction-editor',
      'CSM-014': 'update-transactions',
      'CSM-015': 'pointer-selection',
      'CSM-016': 'pointer-selection',
      'CSM-017': 'lifecycle-interruption',
      'CSM-018': 'interaction-editor',
      'CSM-019': 'authoring',
      'CSM-020': 'pointer-selection',
      'CSM-021': 'pointer-selection',
      'CSM-022': 'interaction-editor',
      'CSM-023': 'interaction-editor',
      'CSM-024': 'interaction-editor',
      'CSM-025': 'editor-workflow',
      'CSM-026': 'editor-workflow',
      'CSM-027': 'editor-workflow',
      'CSM-028': 'authoring',
      'CSM-029': 'authoring',
      'CSM-030': 'authoring',
      'CSM-031': 'authoring',
      'CSM-032': 'asset-ingestion',
      'CSM-033': 'editor-workflow',
      'CSM-034': 'editor-workflow',
      'CSM-035': 'export-extraction',
      'CSM-036': 'lifecycle-interruption',
      'CSM-037': 'replacement-recovery',
      'CSM-038': 'export-extraction',
      'LAY-001': 'render-foundation',
      'LAY-002': 'layout-order',
      'LAY-003': 'layout-order',
      'LAY-004': 'render-orientation',
      'LAY-005': 'render-bounds',
      'REN-001': 'render-foundation',
      'REN-004': 'render-foundation',
      'REN-005': 'render-images',
      'REN-006': 'render-text',
      'REN-008': 'render-component-assets',
      'REN-009': 'presentation-dynamics',
      'REN-010': 'render-component-assets',
      'REN-011': 'render-text',
      'REN-003': 'render-foundation',
      'REN-002': 'render-foundation',
      'REN-007': 'render-relations',
    });

    for (const caseId of PATCH_MAP_EXECUTABLE_CASE_IDS) {
      const plan = materializePatchMapExecutableCase(caseId, '100', 319);
      const handlerIds = resolvePatchMapExecutableRuntime(caseId)
        .handlerEntries(plan)
        .map(([handlerId]) => handlerId);
      const expectedHandlerIds = [...new Set(
        plan.actionTrace.map((action) => `contract/${action.type}`),
      )];
      expect(handlerIds).toHaveLength(new Set(handlerIds).size);
      expect([...handlerIds].sort()).toEqual([...expectedHandlerIds].sort());
    }
  });
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

function eventGenerations(execution: Readonly<Record<string, unknown>>): readonly string[] {
  if (!Array.isArray(execution.eventJournal)) throw new Error('missing event journal');
  return (execution.eventJournal as unknown as readonly unknown[]).map((entry) => {
    if (!isRecord(entry)) throw new Error('invalid event journal entry');
    return `${String(entry.generation)}:${String(entry.role)}:${String(entry.event)}`;
  });
}

function actionStatuses(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error('missing action results');
  return value.map((result) => {
    if (!isRecord(result) || typeof result.status !== 'string') {
      throw new Error('invalid action result status');
    }
    return result.status;
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
