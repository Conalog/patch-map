import { describe, expect, it } from 'vitest';

import { CoreV2ContractExecutionNotImplementedError } from '../../lab/performance-v2/contract/bridge';
import { createCoreV2ExecutableLabBridge } from '../../lab/performance-v2/contract/executable-bridge';
import {
  CORE_V2_EXECUTABLE_CASE_IDS,
  materializeCoreV2ExecutableCase,
} from '../../lab/performance-v2/contract/executable-cases';
import { resolveCoreV2ExecutableRuntime } from '../../lab/performance-v2/contract/executable-runtime';
import type {
  CoreV2EngineSurface,
  CoreV2EngineSurfaceFactory,
  CoreV2Point,
  CoreV2SurfaceReconcileResult,
  CoreV2SurfaceDebug,
  CoreV2SurfaceOptions,
} from '../../src/core-v2/engine';

describe('Core v2 executable Lab product bridge', () => {
  it.each(CORE_V2_EXECUTABLE_CASE_IDS.filter((caseId) => caseId !== 'DAT-008'))(
    'executes %s through a targeted CoreV2Engine and retains actual-only cleanup facts',
    async (caseId) => {
      const surfaceHost = createSurfaceHost();
      const surfaces: FakeSurface[] = [];
      const receivedTargets: Array<HTMLElement | undefined> = [];
      const surfaceFactory = createFakeSurfaceFactory(surfaces, receivedTargets);
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
        environment: { backend: 'webgl2', routeSize: '5000' },
      });
      expect(bridge.execution()).toBe(run.execution);
      expect(bridge.cleanup()).toBe(run.cleanup);
      expect(surfaces.length).toBeGreaterThan(0);
      expect(surfaces.every((surface) => surface.destroyed)).toBe(true);
      expect(receivedTargets.every((target) => target === surfaceHost)).toBe(true);
      expect(surfaces.every((surface) => surface.preference === 'webgl')).toBe(true);
      expect(JSON.stringify(run)).not.toContain('"status":"pass"');
      await expect(
        bridge.armGesture(0),
      ).rejects.toBeInstanceOf(CoreV2ContractExecutionNotImplementedError);
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

    await expect(bridge.runCase()).rejects.toThrow(/synthetic WebGL initialization failure/);
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

    await expect(bridge.runCase()).rejects.toThrow(/synthetic supplemental teardown failure/u);
    expect(bridge.state().status).toBe('failed');
    expect(bridge.cleanup()).toMatchObject({
      status: 'failed',
      supplementalWebGLLease: {
        status: 'failed',
        error: { message: 'synthetic supplemental teardown failure' },
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
      'CSM-001': 'foundation',
      'CSM-003': 'foundation',
      'LAY-001': 'render-foundation',
      'REN-001': 'render-foundation',
      'REN-004': 'render-foundation',
      'REN-003': 'render-foundation',
      'REN-002': 'render-foundation',
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
): CoreV2EngineSurfaceFactory {
  return (options) => {
    receivedTargets.push(options.target);
    const surface = new FakeSurface(options);
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
  private view: Readonly<{ x: number; y: number; scale: number; rotation: number }> =
    Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

  public constructor(options: CoreV2SurfaceOptions) {
    this.preference = options.preference;
    this.width = options.width;
    this.height = options.height;
    this.pixelRatio = options.pixelRatio;
  }

  public load(_input: unknown): void {
    this.selectionIds = Object.freeze([]);
  }

  public reconcile(_input: unknown): CoreV2SurfaceReconcileResult {
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

  public setView(view: Readonly<{ x: number; y: number; scale: number; rotation: number }>): void {
    this.view = Object.freeze({ ...view });
  }

  public select(ids: readonly string[]): void {
    this.selectionIds = Object.freeze([...ids]);
  }

  public hitTestScreen(_point: CoreV2Point): string | null {
    return null;
  }

  public screenToWorld(point: CoreV2Point): CoreV2Point {
    return Object.freeze({
      x: (point.x - this.view.x) / this.view.scale,
      y: (point.y - this.view.y) / this.view.scale,
    });
  }

  public debugSnapshot(): CoreV2SurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.width, this.height] as const),
      backingSize: Object.freeze([
        Math.round(this.width * this.pixelRatio),
        Math.round(this.height * this.pixelRatio),
      ] as const),
      selectionIds: this.selectionIds,
      activeAnimationCount: 0,
    });
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    this.selectionIds = Object.freeze([]);
    return Promise.resolve(true);
  }
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
