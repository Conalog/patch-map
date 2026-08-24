import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  PatchMapContractExecutionNotImplementedError,
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
} from './support/contract-lab-harness';
import type { FakeSurface } from './support/contract-lab-harness';
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
        error: {
          message:
            'PatchMap could not complete the operation [INTERNAL_FAILURE: destroy]. ' +
            'Destroy this instance and mount a new one. Preserve this diagnostic when reporting the issue.',
        },
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

});

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
