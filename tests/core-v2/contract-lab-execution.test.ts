import { describe, expect, it } from 'vitest';

import normalizedExpected from '../../docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json';
import { CoreV2ContractExecutionNotImplementedError } from '../../lab/performance-v2/contract/bridge';
import { createCoreV2ExecutableLabBridge } from '../../lab/performance-v2/contract/executable-bridge';
import {
  CORE_V2_EXECUTABLE_CASE_IDS,
  materializeCoreV2ExecutableCase,
} from '../../lab/performance-v2/contract/executable-cases';
import { resolveCoreV2ExecutableRuntime } from '../../lab/performance-v2/contract/executable-runtime';
import type { SlotRange } from '../../src/core-v1/contracts';
import { parsePatchMapV010 } from '../../src/core-v2';
import type { CoreV2SemanticRefreshResult } from '../../src/core-v2/core';
import {
  createCoreV2SurfaceGeometrySnapshot,
  hitTestCoreV2SurfaceRelations,
} from '../../src/core-v2/engine';
import type {
  CoreV2EngineSurface,
  CoreV2EngineSurfaceFactory,
  CoreV2Point,
  CoreV2RelationHit,
  CoreV2RelationHitOptions,
  CoreV2SurfaceReconcileResult,
  CoreV2SurfaceDebug,
  CoreV2SurfaceGeometrySnapshot,
  CoreV2SurfaceOptions,
  CoreV2SurfaceView,
} from '../../src/core-v2/engine';
import {
  CORE_V2_PRESENTATION_POLICY_REVISION,
  type CoreV2PresentationPolicyInput,
  type CoreV2PresentationPolicyProductProbe,
} from '../../src/core-v2/presentation-policy';
import type { CoreV2SemanticTarget } from '../../src/core-v2/semantic/probe';
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

describe('Core v2 executable Lab product bridge', () => {
  it.each(CORE_V2_EXECUTABLE_CASE_IDS.filter(
    (caseId) => caseId !== 'DAT-008'
      && caseId !== 'AST-001'
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
      && caseId !== 'UPD-008',
  ))(
    'executes %s through a targeted CoreV2Engine and retains actual-only cleanup facts',
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
          'TRN-002',
          'TRN-003',
          'TRN-010',
        ].includes(caseId)
          ? 'projection'
          : 'flat',
      );
      const bridge = createCoreV2ExecutableLabBridge({
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
        provenance: {
          codeCommit: 'unbound-worktree-source',
          packedPackageSha256: 'not-packed-source-lab',
          promotionEligible: false,
        },
        environment: { backend: 'webgl2', routeSize: '5000' },
      });
      expect(bridge.execution()).toBe(run.execution);
      expect(bridge.cleanup()).toBe(run.cleanup);
      expect(surfaces.length).toBeGreaterThan(0);
      expect(surfaces.every((surface) => surface.destroyed)).toBe(true);
      expect(receivedTargets.every((target) => target === surfaceHost)).toBe(true);
      expect(surfaces.every((surface) => surface.preference === 'webgl')).toBe(true);
      expect(JSON.stringify(run)).not.toContain('"status":"pass"');
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
      } else if (caseId === 'EVT-003' || caseId === 'EVT-008') {
        await expect(bridge.armGesture(0)).resolves.toMatchObject({
          revision: 'core-v2-contract-gesture-plan/1',
          actionIndex: 0,
          driverId: caseId === 'EVT-003'
            ? 'trusted-pointer-hover-leave'
            : 'trusted-secondary-contextmenu',
          button: caseId === 'EVT-003' ? 0 : 2,
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
        ).rejects.toBeInstanceOf(CoreV2ContractExecutionNotImplementedError);
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
          + Number(resolveCoreV2ExecutableRuntime(caseId).needsSupplementalWebGLLease),
        retainedCanvasCount: 0,
        retainedSubscriptionCount: 0,
        retainedPendingWork: 0,
      });
      expect(bridge.state().status).toBe('destroyed');
      expect(await bridge.actualObservation()).toBe(run.actualObservation);
    },
    60_000,
  );

  it.each([
    'VIE-001',
    'VIE-002',
    'VIE-003',
    'VIE-004',
    'VIE-008',
    'CSM-009',
    'CSM-010',
  ] as const)(
    'produces independently comparable viewport actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const bridge = createCoreV2ExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
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
      const run = await bridge.runCase();
      const expected = normalizedExpected.cases.find(({ id }) => id === caseId);
      expect(expected).toBeDefined();
      const comparison = compareObservation({
        expectedCase: expected,
        actual: run.actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
      });

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
      const bridge = createCoreV2ExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
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
      const run = await bridge.runCase();
      const expected = normalizedExpected.cases.find(({ id }) => id === caseId);
      expect(expected).toBeDefined();
      const comparison = compareObservation({
        expectedCase: expected,
        actual: run.actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
      });
      const failures = comparison.assertions.filter(({ passed }) => !passed);

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
    'TRN-002',
    'TRN-003',
    'TRN-010',
  ] as const)(
    'produces independently comparable pointer/selection actuals for %s',
    async (caseId) => {
      const surfaces: FakeSurface[] = [];
      const bridge = createCoreV2ExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
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
      const run = await bridge.runCase();
      const expected = normalizedExpected.cases.find(({ id }) => id === caseId);
      expect(expected).toBeDefined();
      const comparison = compareObservation({
        expectedCase: expected,
        actual: run.actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
      });
      const failures = comparison.assertions.filter(({ passed }) => !passed);

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
      const bridge = createCoreV2ExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
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
      const run = await bridge.runCase();
      const expected = normalizedExpected.cases.find(({ id }) => id === caseId);
      expect(expected).toBeDefined();
      const comparison = compareObservation({
        expectedCase: expected,
        actual: run.actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
      });
      const failures = comparison.assertions.filter(({ passed }) => !passed);

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

  it('repeats DAT-002 in fresh isolated generations and reset clears only Lab-held results', async () => {
    const surfaceHost = createSurfaceHost();
    const surfaces: FakeSurface[] = [];
    const receivedTargets: Array<HTMLElement | undefined> = [];
    const bridge = createCoreV2ExecutableLabBridge({
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
    const bridge = createCoreV2ExecutableLabBridge({
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
    const bridge = createCoreV2ExecutableLabBridge({
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
    expect(resolveCoreV2ExecutableRuntime('AST-001')).toMatchObject({
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
    const bridge = createCoreV2ExecutableLabBridge({
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
    const bridge = createCoreV2ExecutableLabBridge({
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
    const plan = materializeCoreV2ExecutableCase('DAT-008', '100', 319);
    expect(plan.actionTrace[2]).toMatchObject({
      type: 'retainTarget',
      operands: { id: 'explicit-a' },
    });
    expect(plan.actionTrace[2]?.operands).not.toHaveProperty('as');

    const bridge = createCoreV2ExecutableLabBridge({
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
      CORE_V2_EXECUTABLE_CASE_IDS.map((caseId) => [
        caseId,
        resolveCoreV2ExecutableRuntime(caseId).key,
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
      'LIF-001': 'foundation',
      'LIF-002': 'foundation',
      'LIF-004': 'lifecycle-resize',
      'LIF-005': 'lifecycle-destroy',
      'DAT-001': 'foundation',
      'DAT-002': 'foundation',
      'DAT-003': 'data-foundation',
      'DAT-004': 'data-foundation',
      'DAT-005': 'data-foundation',
      'DAT-006': 'data-closure',
      'DAT-007': 'data-closure',
      'DAT-008': 'data-closure',
      'AST-001': 'assets',
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
      'TRN-002': 'pointer-selection',
      'TRN-003': 'pointer-selection',
      'TRN-010': 'pointer-selection',
      'VIE-002': 'viewport',
      'VIE-003': 'viewport',
      'VIE-004': 'viewport',
      'VIE-008': 'viewport',
      'ANI-001': 'presentation-dynamics',
      'ANI-002': 'presentation-dynamics',
      'CSM-001': 'foundation',
      'CSM-003': 'foundation',
      'CSM-009': 'viewport',
      'CSM-010': 'viewport',
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

    for (const caseId of CORE_V2_EXECUTABLE_CASE_IDS) {
      const plan = materializeCoreV2ExecutableCase(caseId, '100', 319);
      const handlerIds = resolveCoreV2ExecutableRuntime(caseId)
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

function createSurfaceHost(): HTMLElement {
  return {
    querySelector(): null {
      return null;
    },
  } as unknown as HTMLElement;
}

function createFakeSurfaceFactory(
  surfaces: FakeSurface[],
  receivedTargets: Array<HTMLElement | undefined>,
  geometryMode: 'flat' | 'projection' = 'flat',
): CoreV2EngineSurfaceFactory {
  return (options) => {
    receivedTargets.push(options.target);
    const surface = new FakeSurface(options, geometryMode);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
}

class FakeSurface implements CoreV2EngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  public readonly preference: CoreV2SurfaceOptions['preference'];

  private width: number;
  private height: number;
  private pixelRatio: number;
  private selectionIds: readonly string[] = Object.freeze([]);
  private dataset: readonly Readonly<Record<string, unknown>>[] = Object.freeze([]);
  private geometryRevision = 0;
  private presentationInput: CoreV2PresentationPolicyInput | null = null;
  private presentationRevision = 0;
  private view: CoreV2SurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });

  public constructor(
    options: CoreV2SurfaceOptions,
    private readonly geometryMode: 'flat' | 'projection' = 'flat',
  ) {
    this.preference = options.preference;
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(input: unknown): void {
    this.replaceDataset(input);
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(input: unknown): CoreV2SurfaceReconcileResult {
    this.replaceDataset(input);
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(_timeMs: number): void {}

  public resize(width: number, height: number, pixelRatio: number): boolean {
    const changed = width !== this.width || height !== this.height || pixelRatio !== this.pixelRatio;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return changed;
  }

  public setView(view: CoreV2SurfaceView): void {
    this.view = Object.freeze({ ...view });
  }

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public setPresentationPolicy(
    input: CoreV2PresentationPolicyInput,
  ): CoreV2PresentationPolicyProductProbe {
    this.presentationInput = Object.freeze({
      highlightIds: input.highlightIds === null
        ? null
        : Object.freeze([...(input.highlightIds ?? [])]),
      deEmphasisAlpha: input.deEmphasisAlpha ?? 0.2,
      hiddenLayerIds: Object.freeze([...(input.hiddenLayerIds ?? [])]),
    });
    this.presentationRevision += 1;
    return this.presentationPolicyProbe();
  }

  public clearPresentationPolicy(): CoreV2PresentationPolicyProductProbe {
    if (this.presentationInput !== null) this.presentationRevision += 1;
    this.presentationInput = null;
    return this.presentationPolicyProbe();
  }

  public presentationPolicyProbe(): CoreV2PresentationPolicyProductProbe {
    const highlightIds = this.presentationInput?.highlightIds ?? null;
    const highlighted = new Set(highlightIds ?? []);
    const hidden = new Set(this.presentationInput?.hiddenLayerIds ?? []);
    const deEmphasisAlpha = this.presentationInput?.deEmphasisAlpha ?? 1;
    return Object.freeze({
      schemaRevision: CORE_V2_PRESENTATION_POLICY_REVISION,
      revision: this.presentationRevision,
      status: this.presentationInput === null ? 'normal' : 'active',
      highlightIds,
      deEmphasisAlpha,
      hiddenLayerIds: this.presentationInput?.hiddenLayerIds ?? Object.freeze([]),
      entities: Object.freeze(['item-a', 'rect-b', 'text-c', 'links'].map((id) => {
        const visible = !hidden.has(id);
        return Object.freeze({
          id,
          denseEntityIds: Object.freeze([id]),
          emphasis: highlightIds === null || highlighted.has(id) ? 1 : deEmphasisAlpha,
          visible,
          renderObjectCount: visible ? 1 : 0,
        });
      })),
    });
  }

  public refreshSemanticTargets(
    targets: readonly CoreV2SemanticTarget[],
    options: Readonly<{ readonly strict?: boolean }> = {},
  ): CoreV2SemanticRefreshResult {
    const labels = targets.map((target) => (
      target.kind === 'component' ? `${target.ownerId}/${target.id}` : target.id
    ));
    const missingTargets = labels.filter((label) => !['item-a/label', 'links'].includes(label));
    if (options.strict === true && missingTargets.length > 0) {
      return Object.freeze({
        changed: false,
        recomputedTargets: Object.freeze([]),
        missingTargets: Object.freeze(missingTargets),
        dirtyRanges: Object.freeze([]),
        dataDiffCount: 0,
      });
    }
    const recomputedTargets = labels.filter((label) => !missingTargets.includes(label));
    const dirtyRanges: readonly SlotRange[] = recomputedTargets.length === 0
      ? Object.freeze([])
      : Object.freeze([{ start: 0, end: recomputedTargets.length }]);
    return Object.freeze({
      changed: recomputedTargets.length > 0,
      recomputedTargets: Object.freeze(recomputedTargets),
      missingTargets: Object.freeze(missingTargets),
      dirtyRanges,
      dataDiffCount: 0,
    });
  }

  public hitTestScreen(point: CoreV2Point): string | null {
    return this.geometrySnapshot().entities.filter((entity) => (
      entity.visible
      && entity.interactive
      && fakeBoundsContain(entity.screenBounds, point)
    )).at(-1)?.id ?? null;
  }

  public relationHitTestScreen(
    point: CoreV2Point,
    options?: CoreV2RelationHitOptions,
  ): CoreV2RelationHit | null {
    return hitTestCoreV2SurfaceRelations(this.geometrySnapshot().relations, point, options);
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    const radians = this.view.rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const translatedX = (point.x - this.view.x) / this.view.scale *
      (this.view.flipX === true ? -1 : 1);
    const translatedY = (point.y - this.view.y) / this.view.scale *
      (this.view.flipY === true ? -1 : 1);
    return Object.freeze({
      x: translatedX * cosine + translatedY * sine,
      y: -translatedX * sine + translatedY * cosine,
    });
  }

  public interactionOwnershipProbe(): Readonly<{
    readonly rootBindingCount: number;
    readonly entityCallbackCount: number;
  }> {
    return Object.freeze({ rootBindingCount: 6, entityCallbackCount: 0 });
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    const geometry = this.geometrySnapshot();
    const visibleRelationCount = geometry.relations.filter(({ visible }) => visible).length;
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: geometry.entities.length + visibleRelationCount,
      visiblePrimitiveCount: geometry.entities.length + visibleRelationCount,
    });
  }

  public geometrySnapshot(): CoreV2SurfaceGeometrySnapshot {
    if (this.geometryMode === 'projection') {
      const parsed = parsePatchMapV010(this.dataset);
      const projected = createCoreV2SurfaceGeometrySnapshot(
        fakeSceneSnapshot(parsed.document, this.geometryRevision, this.selectionIds),
        parsed.projection,
        this.view,
      );
      return Object.freeze({ ...projected, revision: this.geometryRevision });
    }
    return Object.freeze({
      revision: this.geometryRevision,
      entities: Object.freeze(this.geometryEntities()),
      relations: Object.freeze([]),
      selectionOverlay: null,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.selectionIds = Object.freeze([]);
    this.dataset = Object.freeze([]);
    this.presentationInput = null;
    return Promise.resolve(true);
  }

  private replaceDataset(input: unknown): void {
    if (!Array.isArray(input)) throw new Error('FakeSurface requires an array dataset');
    this.dataset = input.filter(isRecord);
    this.geometryRevision += 1;
  }

  private geometryEntities(): CoreV2SurfaceGeometrySnapshot['entities'][number][] {
    return this.dataset.flatMap((element) => fakeGeometryEntity(element, this.view));
  }

}

function fakeSceneSnapshot(
  document: ReturnType<typeof parsePatchMapV010>['document'],
  revision: number,
  selectionIds: readonly string[],
): Parameters<typeof createCoreV2SurfaceGeometrySnapshot>[0] {
  const entities = document.entities.map((entity, slot) => Object.freeze({
    ref: Object.freeze({ slot, generation: 1 }),
    id: entity.id,
    kind: entity.kind,
    bounds: entity.kind === 'relation'
      ? Object.freeze({ x: 0, y: 0, width: 0, height: 0 })
      : Object.freeze({
          x: entity.x,
          y: entity.y,
          width: entity.width,
          height: entity.height,
        }),
    rotation: entity.kind === 'relation' ? 0 : entity.rotation ?? 0,
    opacity: entity.opacity ?? 1,
    visible: entity.visible ?? true,
    interactive: entity.interactive ?? false,
    zIndex: entity.zIndex ?? 0,
    tags: entity.tags ?? Object.freeze([]),
    data: entity.kind === 'relation'
      ? Object.freeze({
          from: entity.from,
          to: entity.to,
          color: entity.color,
          lineWidth: entity.lineWidth ?? 1,
        })
      : Object.freeze({}),
  }));
  return Object.freeze({
    revision,
    view: Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 }),
    entityCount: entities.length,
    entities: Object.freeze(entities),
    selection: Object.freeze({
      revision,
      refs: Object.freeze(
        entities.filter((entity) => selectionIds.includes(entity.id)).map(({ ref }) => ref),
      ),
    }),
  });
}

class FailingDestroySurface extends FakeSurface {
  public override destroy(): Promise<boolean> {
    return Promise.reject(new Error('synthetic supplemental teardown failure'));
  }
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

function fakeGeometryEntity(
  element: Readonly<Record<string, unknown>>,
  view: Readonly<{ x: number; y: number; scale: number; rotation: number }>,
): CoreV2SurfaceGeometrySnapshot['entities'] {
  if (element.type === 'relations' || element.type === 'group' || element.type === 'grid') return [];
  const attrs = isRecord(element.attrs) ? element.attrs : {};
  const x = fakeNumber(attrs.x, 0);
  const y = fakeNumber(attrs.y, 0);
  const scaleX = fakeNumber(attrs.scaleX, 1);
  const scaleY = fakeNumber(attrs.scaleY, 1);
  const angle = fakeNumber(attrs.angle ?? attrs.rotation, 0);
  const size = fakeRenderedSize(element);
  const localBounds = fakeBounds(0, 0, size.width, size.height);
  const worldBounds = fakeTransformedBounds(
    x,
    y,
    size.width,
    size.height,
    scaleX,
    scaleY,
    angle,
  );
  const screenBounds = fakeBounds(
    worldBounds[0] * view.scale + view.x,
    worldBounds[1] * view.scale + view.y,
    worldBounds[2] * view.scale,
    worldBounds[3] * view.scale,
  );
  const visible = element.show !== false;
  return [Object.freeze({
    id: String(element.id),
    kind: String(element.type),
    localBounds,
    worldBounds,
    screenBounds,
    visibleBounds: visible ? worldBounds : null,
    visible,
    interactive: element.eventMode === 'static',
    scaleX,
    scaleY,
  })];
}

function fakeRenderedSize(
  element: Readonly<Record<string, unknown>>,
): Readonly<{ width: number; height: number }> {
  const authored = fakeFixedSize(element.size);
  if (element.type !== 'text' || element.overflow !== 'visible') return authored;
  const style = isRecord(element.style) ? element.style : {};
  const text = typeof element.text === 'string' ? element.text : '';
  return {
    width: text.length * fakeNumber(style.fontSize, 16) / 2,
    height: authored.height,
  };
}

function fakeTransformedBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  angle: number,
): readonly [number, number, number, number] {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = ([
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const).map(([localX, localY]) => {
    const scaledX = localX * scaleX;
    const scaledY = localY * scaleY;
    return [
      x + scaledX * cosine - scaledY * sine,
      y + scaledX * sine + scaledY * cosine,
    ] as const;
  });
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return fakeBounds(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
}

function fakeFixedSize(value: unknown): Readonly<{ width: number; height: number }> {
  if (typeof value === 'number') return { width: value, height: value };
  if (!isRecord(value)) return { width: 0, height: 0 };
  return { width: fakeNumber(value.width, 0), height: fakeNumber(value.height, 0) };
}

function fakeBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): readonly [number, number, number, number] {
  return Object.freeze([
    fakeCleanNumber(x),
    fakeCleanNumber(y),
    fakeCleanNumber(width),
    fakeCleanNumber(height),
  ]);
}

function fakeBoundsContain(
  bounds: readonly [number, number, number, number],
  point: CoreV2Point,
): boolean {
  return bounds[2] > 0
    && bounds[3] > 0
    && point.x >= bounds[0]
    && point.y >= bounds[1]
    && point.x <= bounds[0] + bounds[2]
    && point.y <= bounds[1] + bounds[3];
}

function fakeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fakeCleanNumber(value: number): number {
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
