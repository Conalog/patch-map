import {
  PatchMap,
  type PatchMapOptions,
  type PatchMapEngineSurfaceFactory,
  type PatchMapInitializeOptions,
  type PatchMapInitializeResult,
} from '../../../src/patch-map/engine';

// @ts-expect-error -- the committed browser-safe executor is authored as an ESM JavaScript module.
import * as workerModule from '../../../scripts/verification/core-v2-contract/execute-worker.mjs';

import {
  PATCH_MAP_CONTRACT_LAB_BRIDGE_REVISION,
  PatchMapContractExecutionNotImplementedError,
  type PatchMapContractGesturePlan,
  type PatchMapContractLabBridgeV1,
  type PatchMapContractLabMilestone,
  type PatchMapContractLabRunResult,
  type PatchMapContractLabState,
  type PatchMapContractLabStatus,
} from './bridge';
import {
  isPatchMapExecutableCaseId,
  materializePatchMapExecutableCase,
  resolvePatchMapExecutableDataset,
  selectPatchMapExecutableActionDefinitions,
  type PatchMapExecutableCaseId,
} from './executable-cases';
import {
  ExecutableLabClock,
  defaultEnvironment,
  defaultProvenance,
  freshCasePlan,
} from './executable-run-profile';
import {
  attachPostDestroyProductProbe,
  cleanupSummary,
  destroyedWithoutRunObservation,
  emptyPublishedTuple,
  executionActionIndex,
  executionPublishedTuple,
  executionWithProductCleanup,
  failureObservation,
  mergeCleanup,
  partialExecutionFrom,
  serializeError,
} from './executable-run-results';
import { resolvePatchMapExecutableRuntime } from './executable-runtime';
import {
  deepFreezePatchMapLabValue as deepFreeze,
  isPatchMapLabRecord as isRecord,
} from './runtime-values';

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>>;
}

const { executeContractCase } = workerModule as unknown as WorkerRuntime;

export interface PatchMapExecutableLabBridgeOptions {
  readonly caseId: PatchMapExecutableCaseId;
  readonly rootTestId: string;
  readonly size: string;
  readonly seed: number;
  readonly surfaceHost?: HTMLElement;
  readonly surfaceFactory?: PatchMapEngineSurfaceFactory;
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly environment?: Readonly<Record<string, unknown>>;
}

class TargetedWebGLPatchMapEngine extends PatchMap {
  private readonly surfaceHost: HTMLElement | undefined;

  public constructor(
    surfaceHost: HTMLElement | undefined,
    surfaceFactory: PatchMapEngineSurfaceFactory | undefined,
    engineOptions: Readonly<PatchMapOptions> = {},
  ) {
    super({
      ...engineOptions,
      ...(surfaceFactory ? { surfaceFactory } : {}),
    });
    this.surfaceHost = surfaceHost;
  }

  public override initialize(options: PatchMapInitializeOptions): Promise<PatchMapInitializeResult> {
    return super.initialize({
      ...options,
      preference: 'webgl',
      ...(this.surfaceHost ? { target: this.surfaceHost } : {}),
    });
  }
}

function surfaceHostForEngineRole(
  visibleHost: HTMLElement | undefined,
  factoryContext: unknown,
): HTMLElement | undefined {
  if (
    visibleHost === undefined
    || typeof document === 'undefined'
    || !isRecord(factoryContext)
    || typeof factoryContext.role !== 'string'
    || !factoryContext.role.startsWith('declared-failure:')
  ) {
    return visibleHost;
  }
  return document.createElement('div');
}

interface LiveViewportGestureEvent {
  readonly source: string;
  readonly centerWorld: readonly [number, number];
  readonly scale: number;
  readonly viewRevision: number;
}

interface LiveViewportGestureSession {
  readonly actionIndex: number;
  readonly engine: TargetedWebGLPatchMapEngine;
  readonly events: LiveViewportGestureEvent[];
  readonly unbind: () => void;
}

interface LivePointerGestureSession {
  readonly actionIndex: number;
  readonly engine: TargetedWebGLPatchMapEngine;
  readonly events: Readonly<Record<string, unknown>>[];
  readonly unbind: () => void;
}

export function createPatchMapExecutableLabBridge(
  options: PatchMapExecutableLabBridgeOptions,
): PatchMapContractLabBridgeV1 {
  invariant(isPatchMapExecutableCaseId(options.caseId), `unsupported case ${options.caseId}`);
  invariant(options.rootTestId === `scenario-${options.caseId.toLowerCase()}`, 'root test identity');

  const casePlan = materializePatchMapExecutableCase(options.caseId, options.size, options.seed);
  const runtime = resolvePatchMapExecutableRuntime(options.caseId);
  invariant(casePlan.rootTestId === options.rootTestId, 'fixture root test identity');

  let status: PatchMapContractLabStatus = 'armed';
  let actionIndex = -1;
  let repeatIndex = 0;
  let runCount = 0;
  let completedRunCount = 0;
  let destroyed = false;
  let publishedTuple = emptyPublishedTuple();
  let lastExecution: Readonly<Record<string, unknown>> | null = null;
  let lastCleanup: Readonly<Record<string, unknown>> | null = null;
  let lastObservation: Readonly<Record<string, unknown>> | null = null;
  let lastRun: Readonly<PatchMapContractLabRunResult> | null = null;
  let activeRun: Promise<Readonly<PatchMapContractLabRunResult>> | null = null;
  let liveViewportGesture: LiveViewportGestureSession | null = null;
  let livePointerGesture: LivePointerGestureSession | null = null;

  function state(): Readonly<PatchMapContractLabState> {
    return Object.freeze({
      caseId: options.caseId,
      rootTestId: options.rootTestId,
      status,
      actionIndex,
      repeatIndex,
      publishedTuple,
    });
  }

  function assertActionIndex(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value >= casePlan.actionTrace.length) {
      throw new RangeError(`Action index is outside ${options.caseId}: ${value}`);
    }
  }

  async function executeFreshRun(isRepeat: boolean): Promise<Readonly<PatchMapContractLabRunResult>> {
    invariant(!destroyed, `${options.caseId} bridge is destroyed`);
    if (liveViewportGesture !== null) await releaseViewportGesture();
    if (livePointerGesture !== null) await releasePointerGesture();
    assertSurfaceIsReleased(options.surfaceHost);
    status = 'running';
    actionIndex = -1;
    repeatIndex = isRepeat ? repeatIndex + 1 : 0;
    runCount += 1;
    lastExecution = null;
    lastCleanup = null;
    lastObservation = null;
    lastRun = null;

    let execution: Readonly<Record<string, unknown>> | null = null;
    let postDestroyProductProbe: (() =>
      | Readonly<Record<string, unknown>>
      | Promise<Readonly<Record<string, unknown>>>) | null = null;
    let supplementalEngine: TargetedWebGLPatchMapEngine | null = null;
    let supplementalCleanup: Readonly<Record<string, unknown>> | null = null;
    let supplementalReleaseError: unknown = null;

    try {
      const runRuntime = runtime.createRun(casePlan);
      postDestroyProductProbe = runRuntime.postDestroyProductProbe ?? null;
      if (runtime.needsSupplementalWebGLLease) {
        supplementalEngine = new TargetedWebGLPatchMapEngine(
          options.surfaceHost,
          options.surfaceFactory,
          runRuntime.engineOptions,
        );
        await supplementalEngine.initialize({
          instanceId: `${options.caseId.toLowerCase()}-lab-surface-${runCount}`,
          width: 800,
          height: 600,
          pixelRatio: 1,
          strategy: 'mesh',
          preference: 'webgl',
        });
        invariant(
          supplementalEngine.snapshot().resources.renderer?.backend === 'webgl',
          `${options.caseId} supplemental surface backend`,
        );
      }

      execution = await executeContractCase({
        caseRecord: freshCasePlan(casePlan),
        actionDefinitions: selectPatchMapExecutableActionDefinitions(casePlan),
        engineFactory: (factoryContext: unknown) => new TargetedWebGLPatchMapEngine(
          surfaceHostForEngineRole(options.surfaceHost, factoryContext),
          options.surfaceFactory,
          runRuntime.engineOptions,
        ),
        datasets: { resolve: resolvePatchMapExecutableDataset },
        clock: new ExecutableLabClock(),
        handlerEntries: runRuntime.handlerEntries,
        ...(runRuntime.actionTimeoutMs === undefined
          ? {}
          : { actionTimeoutMs: runRuntime.actionTimeoutMs }),
      });
      if (postDestroyProductProbe) {
        const probe = postDestroyProductProbe;
        postDestroyProductProbe = null;
        execution = attachPostDestroyProductProbe(
          execution,
          await probe(),
        );
      }
      const folded = runtime.fold({
        casePlan: freshCasePlan(casePlan),
        execution,
        provenance: options.provenance ?? defaultProvenance(casePlan),
        environment: options.environment ?? defaultEnvironment(casePlan),
      });
      if (supplementalEngine) {
        try {
          supplementalCleanup = await releaseSupplementalWebGLLease(supplementalEngine);
        } catch (error) {
          supplementalReleaseError = error;
          throw error;
        }
        supplementalEngine = null;
      }
      const cleanup = requireRecord(
        mergeCleanup(requireRecord(execution.cleanup, 'execution cleanup'), supplementalCleanup),
        'merged cleanup',
      );
      lastExecution = execution;
      lastCleanup = cleanup;
      lastObservation = folded.actual;
      actionIndex = executionActionIndex(execution);
      publishedTuple = executionPublishedTuple(execution);
      status = 'observed';
      completedRunCount += 1;
      const run = deepFreeze({
        status: 'observed',
        execution,
        actualObservation: folded.actual,
        fixtures: folded.fixtures,
        captures: folded.captures,
        cleanup,
      } satisfies PatchMapContractLabRunResult);
      lastRun = run;
      assertSurfaceIsReleased(options.surfaceHost);
      return run;
    } catch (error) {
      if (supplementalEngine) {
        const retryCleanup = await releaseSupplementalWebGLLease(supplementalEngine)
          .catch((releaseError: unknown) => deepFreeze({
            status: 'failed',
            error: serializeError(releaseError),
          }));
        supplementalCleanup = supplementalReleaseError === null
          ? retryCleanup
          : deepFreeze({
              status: 'failed',
              error: serializeError(supplementalReleaseError),
              retryCleanup,
            });
        supplementalEngine = null;
      }
      let partialExecution = execution ?? partialExecutionFrom(error);
      let productProbeFailure: Readonly<Record<string, unknown>> | null = null;
      if (postDestroyProductProbe) {
        const probe = postDestroyProductProbe;
        postDestroyProductProbe = null;
        try {
          const productResources = await probe();
          partialExecution = partialExecution
            ? attachPostDestroyProductProbe(partialExecution, productResources)
            : executionWithProductCleanup(productResources);
        } catch (probeError) {
          productProbeFailure = deepFreeze({
            status: 'failed',
            error: serializeError(probeError),
          });
        }
      }
      lastExecution = partialExecution;
      const executionCleanup = partialExecution && isRecord(partialExecution.cleanup)
        ? partialExecution.cleanup
        : null;
      lastCleanup = mergeCleanup(executionCleanup, supplementalCleanup, productProbeFailure);
      actionIndex = partialExecution ? executionActionIndex(partialExecution) : -1;
      publishedTuple = partialExecution ? executionPublishedTuple(partialExecution) : emptyPublishedTuple();
      status = 'failed';
      lastObservation = failureObservation(casePlan, partialExecution, error);
      assertSurfaceIsReleased(options.surfaceHost);
      throw error;
    }
  }

  function startRun(isRepeat: boolean): Promise<Readonly<PatchMapContractLabRunResult>> {
    if (activeRun) return activeRun;
    if (!isRepeat && lastRun) return Promise.resolve(lastRun);
    const pending = executeFreshRun(isRepeat);
    activeRun = pending;
    pending.then(
      () => {
        if (activeRun === pending) activeRun = null;
      },
      () => {
        if (activeRun === pending) activeRun = null;
      },
    );
    return pending;
  }

  async function awaitActiveRun(): Promise<void> {
    if (!activeRun) return;
    await activeRun.catch(() => undefined);
  }

  async function armViewportGesture(
    value: number,
  ): Promise<Readonly<PatchMapContractGesturePlan>> {
    invariant(options.caseId === 'VIE-001', `${options.caseId} live gesture case`);
    invariant(value === 0, 'VIE-001 live gesture action index');
    invariant(!destroyed, `${options.caseId} bridge is destroyed`);
    invariant(options.surfaceHost !== undefined, 'VIE-001 live gesture surface host');
    await awaitActiveRun();

    if (liveViewportGesture === null) {
      assertSurfaceIsReleased(options.surfaceHost);
      const engine = new TargetedWebGLPatchMapEngine(
        options.surfaceHost,
        options.surfaceFactory,
      );
      try {
        await engine.initialize({
          instanceId: `contract-${options.caseId.toLowerCase()}-trusted-gesture`,
          width: 800,
          height: 600,
          pixelRatio: 1,
          strategy: 'mesh',
          preference: 'webgl',
          zoomLimits: [0.25, 4],
        });
        const profile = requireRecord(
          casePlan.fixtureProfiles['viewport-transform-matrix'],
          'VIE-001 viewport fixture profile',
        );
        const datasetRef = requiredString(
          profile.datasetRef,
          'VIE-001 viewport fixture datasetRef',
        );
        const dataset = structuredClone(resolvePatchMapExecutableDataset(datasetRef));
        engine.loadDataset(dataset, { datasetRef });
        engine.setViewport({ centerWorld: [400, 300], scale: 1 });
        engine.publishFrame(0);
        const events: LiveViewportGestureEvent[] = [];
        const unbind = engine.on('viewChanged', (event) => {
          events.push(Object.freeze({
            source: event.source,
            centerWorld: Object.freeze([
              event.viewport.centerWorld[0],
              event.viewport.centerWorld[1],
            ] as const),
            scale: event.viewport.scale,
            viewRevision: event.revisions.viewRevision,
          }));
        });
        if (options.surfaceHost.dataset) {
          options.surfaceHost.dataset.patchMapRootInputProbe = 'true';
        }
        liveViewportGesture = { actionIndex: value, engine, events, unbind };
      } catch (error) {
        await engine.destroy().catch(() => undefined);
        if (options.surfaceHost.dataset) {
          delete options.surfaceHost.dataset.patchMapRootInputProbe;
        }
        throw error;
      }
    }

    return deepFreeze({
      revision: 'core-v2-contract-gesture-plan/1',
      actionIndex: value,
      driverId: 'trusted-pointer-wheel',
      ownerQualifiedTarget:
        `[data-testid="${casePlan.rootTestId}"] [data-contract-surface] `
        + 'canvas[data-patch-map-product="patch-map"]',
      cssLocalAnchors: [
        { x: 400, y: 300 },
        { x: 440, y: 280 },
      ],
      button: 0,
      modifiers: [],
      publishedTuple,
    });
  }

  function viewportGestureObservation(): Readonly<Record<string, unknown>> {
    const session = liveViewportGesture;
    invariant(session !== null, 'VIE-001 live gesture session');
    const { engine } = session;
    const geometry = engine.geometryProbe();
    invariant(geometry !== null, 'VIE-001 live gesture geometry');
    const target = geometry.entities.find((entity) => entity.id === 'rect-b');
    invariant(target !== undefined, 'VIE-001 live gesture target geometry');
    const point = {
      x: target.screenBounds[0] + target.screenBounds[2] / 2,
      y: target.screenBounds[1] + target.screenBounds[3] / 2,
    };
    const snapshot = engine.snapshot();
    const anchorWorld = engine.screenToWorld({ x: 400, y: 300 });
    return deepFreeze({
      $schema: 'core-v2-contract-gesture-observation/1',
      case: {
        id: options.caseId,
        actionIndex: session.actionIndex,
      },
      events: structuredClone(session.events),
      viewport: structuredClone(engine.viewportProbe()),
      persistence: structuredClone(engine.viewportPersistenceProbe()),
      revisions: structuredClone(snapshot.revisions),
      ownership: structuredClone(engine.interactionOwnershipProbe()),
      anchorWorld: { x: anchorWorld.x, y: anchorWorld.y },
      transformedHit: {
        point,
        target: engine.hitTest(point),
      },
      resources: {
        canvasCount: snapshot.resources.canvasCount,
        subscriptions: snapshot.resources.subscriptions.active,
        pendingWork: snapshot.pendingWork,
      },
    });
  }

  async function releaseViewportGesture(): Promise<void> {
    const session = liveViewportGesture;
    if (session === null) return;
    liveViewportGesture = null;
    const errors: unknown[] = [];
    try {
      session.unbind();
    } catch (error) {
      errors.push(error);
    }
    try {
      await session.engine.destroy();
    } catch (error) {
      errors.push(error);
    }
    if (options.surfaceHost) {
      if (options.surfaceHost.dataset) {
        delete options.surfaceHost.dataset.patchMapRootInputProbe;
      }
      try {
        assertSurfaceIsReleased(options.surfaceHost);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'PatchMap VIE-001 live gesture cleanup failed');
    }
  }

  async function armPointerGesture(
    value: number,
  ): Promise<Readonly<PatchMapContractGesturePlan>> {
    invariant(
      options.caseId === 'EVT-003' ||
        options.caseId === 'EVT-008' ||
        options.caseId === 'ACC-002',
      `${options.caseId} live pointer case`,
    );
    invariant(value === 0, `${options.caseId} live pointer action index`);
    invariant(!destroyed, `${options.caseId} bridge is destroyed`);
    invariant(options.surfaceHost !== undefined, `${options.caseId} live pointer surface host`);
    await awaitActiveRun();

    if (livePointerGesture === null) {
      assertSurfaceIsReleased(options.surfaceHost);
      const engine = new TargetedWebGLPatchMapEngine(
        options.surfaceHost,
        options.surfaceFactory,
      );
      try {
        await engine.initialize({
          instanceId: `contract-${options.caseId.toLowerCase()}-trusted-pointer`,
          width: 800,
          height: 600,
          pixelRatio: 1,
          strategy: 'mesh',
          preference: 'webgl',
          zoomLimits: [0.25, 4],
        });
        const profileId = options.caseId === 'ACC-002'
          ? 'logical-accessibility-tree'
          : 'input-device-and-gesture-matrix';
        const profile = requireRecord(
          casePlan.fixtureProfiles[profileId],
          `${options.caseId} pointer fixture profile`,
        );
        const datasetRef = requiredString(
          profile.datasetRef,
          `${options.caseId} pointer fixture datasetRef`,
        );
        const dataset = structuredClone(resolvePatchMapExecutableDataset(datasetRef));
        engine.loadDataset(dataset, { datasetRef });
        engine.setViewport({ centerWorld: [400, 300], scale: 1 });
        engine.publishFrame(0);
        if (options.caseId === 'ACC-002') {
          engine.accessibilityTree('scene');
          engine.publishFrame(1);
        }
        const events: Readonly<Record<string, unknown>>[] = [];
        const unbind = engine.on('pointerEvent', (event) => {
          events.push(
            structuredClone(event) as unknown as Readonly<Record<string, unknown>>,
          );
        });
        if (options.surfaceHost.dataset) {
          options.surfaceHost.dataset.patchMapRootInputProbe = 'true';
        }
        livePointerGesture = { actionIndex: value, engine, events, unbind };
      } catch (error) {
        await engine.destroy().catch(() => undefined);
        if (options.surfaceHost.dataset) {
          delete options.surfaceHost.dataset.patchMapRootInputProbe;
        }
        throw error;
      }
    }

    const anchors = options.caseId === 'EVT-003'
      ? [{ x: 20, y: 30 }, { x: 400, y: 400 }]
      : [{ x: 170, y: 50 }, { x: 400, y: 400 }];
    return deepFreeze({
      revision: 'core-v2-contract-gesture-plan/1',
      actionIndex: value,
      driverId: options.caseId === 'EVT-003'
        ? 'trusted-pointer-hover-leave'
        : options.caseId === 'EVT-008'
          ? 'trusted-secondary-contextmenu'
          : 'trusted-accessibility-click',
      ownerQualifiedTarget:
        `[data-testid="${casePlan.rootTestId}"] [data-contract-surface] `
        + 'canvas[data-patch-map-product="patch-map"]',
      cssLocalAnchors: anchors,
      button: options.caseId === 'EVT-008' ? 2 : 0,
      modifiers: [],
      publishedTuple,
    });
  }

  function pointerGestureObservation(): Readonly<Record<string, unknown>> {
    const session = livePointerGesture;
    invariant(session !== null, `${options.caseId} live pointer session`);
    const snapshot = session.engine.snapshot();
    return deepFreeze({
      $schema: 'core-v2-contract-pointer-input-observation/1',
      case: {
        id: options.caseId,
        actionIndex: session.actionIndex,
      },
      events: structuredClone(session.events),
      pointerGesture: structuredClone(session.engine.pointerGestureProbe()),
      ownership: structuredClone(session.engine.interactionOwnershipProbe()),
      accessibility: structuredClone(session.engine.accessibilityProbe()),
      snapshot: structuredClone(session.engine.snapshot()),
      resources: {
        canvasCount: snapshot.resources.canvasCount,
        subscriptions: snapshot.resources.subscriptions.active,
        pendingWork: snapshot.pendingWork,
      },
    });
  }

  async function releasePointerGesture(): Promise<void> {
    const session = livePointerGesture;
    if (session === null) return;
    livePointerGesture = null;
    const errors: unknown[] = [];
    try {
      session.unbind();
    } catch (error) {
      errors.push(error);
    }
    try {
      await session.engine.destroy();
    } catch (error) {
      errors.push(error);
    }
    if (options.surfaceHost) {
      if (options.surfaceHost.dataset) {
        delete options.surfaceHost.dataset.patchMapRootInputProbe;
      }
      try {
        assertSurfaceIsReleased(options.surfaceHost);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `PatchMap ${options.caseId} live pointer cleanup failed`);
    }
  }

  return Object.freeze({
    revision: PATCH_MAP_CONTRACT_LAB_BRIDGE_REVISION,
    state,
    execution(): Readonly<Record<string, unknown>> | null {
      return lastExecution;
    },
    cleanup(): Readonly<Record<string, unknown>> | null {
      return lastCleanup;
    },
    runCase(): Promise<Readonly<PatchMapContractLabRunResult>> {
      return startRun(false);
    },
    async resetCase(): Promise<Readonly<Record<string, unknown>>> {
      invariant(!destroyed, `${options.caseId} bridge is destroyed`);
      await awaitActiveRun();
      await releaseViewportGesture();
      await releasePointerGesture();
      const summary = cleanupSummary(lastCleanup, runCount, completedRunCount);
      assertSurfaceIsReleased(options.surfaceHost);
      status = 'armed';
      actionIndex = -1;
      repeatIndex = 0;
      publishedTuple = emptyPublishedTuple();
      lastExecution = null;
      lastCleanup = null;
      lastObservation = null;
      lastRun = null;
      return summary;
    },
    repeatCase(): Promise<Readonly<PatchMapContractLabRunResult>> {
      return startRun(true);
    },
    armGesture(value: number): Promise<Readonly<PatchMapContractGesturePlan>> {
      assertActionIndex(value);
      if (options.caseId === 'VIE-001') return armViewportGesture(value);
      if (
        options.caseId === 'EVT-003' ||
        options.caseId === 'EVT-008' ||
        options.caseId === 'ACC-002'
      ) {
        return armPointerGesture(value);
      }
      return Promise.reject(new PatchMapContractExecutionNotImplementedError(
        options.caseId,
        'gesture execution for the current non-gesture executable slice',
      ));
    },
    async awaitMilestone(value: number, milestone: PatchMapContractLabMilestone): Promise<void> {
      assertActionIndex(value);
      if (options.caseId === 'VIE-001' && liveViewportGesture !== null) {
        invariant(liveViewportGesture.actionIndex === value, 'VIE-001 live gesture action identity');
        if (milestone === 'settled') {
          liveViewportGesture.engine.settleViewport();
          liveViewportGesture.engine.publishFrame(0);
        }
        if (milestone === 'released') await releaseViewportGesture();
        return;
      }
      if (
        (
          options.caseId === 'EVT-003' ||
          options.caseId === 'EVT-008' ||
          options.caseId === 'ACC-002'
        ) &&
        livePointerGesture !== null
      ) {
        invariant(
          livePointerGesture.actionIndex === value,
          `${options.caseId} live pointer action identity`,
        );
        if (milestone === 'released') await releasePointerGesture();
        return;
      }
      const run = await startRun(false);
      const result = arrayValue(run.execution.actionResults, 'execution actionResults')[value];
      invariant(isRecord(result) && result.status === 'completed', `${options.caseId} action ${value} completion`);
      if (milestone === 'released') {
        invariant(run.cleanup.status === 'completed', `${options.caseId} released cleanup milestone`);
      }
    },
    async actualObservation(): Promise<Readonly<Record<string, unknown>>> {
      if (liveViewportGesture !== null) return viewportGestureObservation();
      if (livePointerGesture !== null) return pointerGestureObservation();
      if (lastObservation) return lastObservation;
      if (destroyed) return destroyedWithoutRunObservation(casePlan);
      try {
        return (await startRun(false)).actualObservation;
      } catch {
        invariant(lastObservation !== null, `${options.caseId} failure observation`);
        return lastObservation;
      }
    },
    async destroyCase(): Promise<Readonly<Record<string, unknown>>> {
      if (!destroyed) {
        await awaitActiveRun();
        await releaseViewportGesture();
        await releasePointerGesture();
        destroyed = true;
        status = 'destroyed';
      }
      assertSurfaceIsReleased(options.surfaceHost);
      return cleanupSummary(lastCleanup, runCount, completedRunCount);
    },
  });
}

async function releaseSupplementalWebGLLease(
  engine: TargetedWebGLPatchMapEngine,
): Promise<Readonly<Record<string, unknown>>> {
  const before = engine.snapshot();
  const returned = await engine.destroy();
  const after = engine.snapshot();
  const semanticAfter = engine.semanticProbe();
  return deepFreeze({
    status: 'completed',
    role: 'product-only-case-webgl-lease',
    targetedBackend: before.resources.renderer?.backend ?? null,
    returned,
    before: {
      lifecycle: before.lifecycle,
      canvasCount: before.resources.canvasCount,
    },
    after: {
      lifecycle: after.lifecycle,
      logicalDatasetRootCount: semanticAfter.dataset.rootIds.length,
      activeAnimationCount: semanticAfter.interaction.activeAnimationCount ?? 0,
    },
    remainingResources: {
      canvasCount: after.resources.canvasCount,
      subscriptions: after.resources.subscriptions.active,
      pendingWork: after.pendingWork,
    },
  });
}

function assertSurfaceIsReleased(surfaceHost: HTMLElement | undefined): void {
  if (!surfaceHost || typeof surfaceHost.querySelector !== 'function') return;
  invariant(
    surfaceHost.querySelector('canvas[data-patch-map-product="patch-map"]') === null,
    'executor left a tracked PixiJS canvas in the Lab host',
  );
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  invariant(Array.isArray(value), label);
  return value;
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), label);
  return value;
}

function requiredString(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, label);
  return value;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap executable Lab bridge: ${message}`);
}
