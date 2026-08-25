import type { PatchMapEngineSurfaceFactory } from '../../../src/patch-map/engine';

// @ts-expect-error -- the committed browser-safe executor is authored as an ESM JavaScript module.
import * as workerModule from '../../../scripts/verification/patch-map-contract/execute-worker.mjs';

import {
  PATCH_MAP_CONTRACT_LAB_BRIDGE_REVISION,
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
import { PatchMapExecutableLiveGestureController } from './executable-live-gesture';
import { resolvePatchMapExecutableRuntime } from './executable-runtime';
import {
  deepFreezePatchMapLabValue as deepFreeze,
  isPatchMapLabRecord as isRecord,
} from './runtime-values';
import {
  TargetedWebGLPatchMapEngine,
  assertPatchMapExecutableSurfaceReleased,
  surfaceHostForEngineRole,
} from './targeted-webgl-engine';

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

export function createPatchMapExecutableLabBridge(
  options: PatchMapExecutableLabBridgeOptions,
): PatchMapContractLabBridgeV1 {
  invariant(isPatchMapExecutableCaseId(options.caseId), `unsupported case ${options.caseId}`);
  invariant(options.rootTestId === `scenario-${options.caseId.toLowerCase()}`, 'root test identity');

  const casePlan = materializePatchMapExecutableCase(options.caseId, options.size, options.seed);
  const runtime = resolvePatchMapExecutableRuntime(options.caseId);
  const liveGesture = new PatchMapExecutableLiveGestureController(
    casePlan,
    options.surfaceHost,
    options.surfaceFactory,
  );
  invariant(casePlan.rootTestId === options.rootTestId, 'fixture root test identity');

  let status: PatchMapContractLabStatus = 'armed';
  let actionIndex = -1;
  let repeatIndex = 0;
  let runCount = 0;
  let completedRunCount = 0;
  let destroyed = false;
  let destroying = false;
  let destroyPromise: Promise<Readonly<Record<string, unknown>>> | null = null;
  let publishedTuple = emptyPublishedTuple();
  let lastExecution: Readonly<Record<string, unknown>> | null = null;
  let lastCleanup: Readonly<Record<string, unknown>> | null = null;
  let lastObservation: Readonly<Record<string, unknown>> | null = null;
  let lastRun: Readonly<PatchMapContractLabRunResult> | null = null;
  let activeRun: Promise<Readonly<PatchMapContractLabRunResult>> | null = null;

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

  function assertRunnable(): void {
    invariant(!destroying && !destroyed, `${options.caseId} bridge is destroyed`);
  }

  async function executeFreshRun(isRepeat: boolean): Promise<Readonly<PatchMapContractLabRunResult>> {
    assertRunnable();
    await liveGesture.release();
    assertRunnable();
    assertPatchMapExecutableSurfaceReleased(options.surfaceHost);
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
      assertPatchMapExecutableSurfaceReleased(options.surfaceHost);
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
      assertPatchMapExecutableSurfaceReleased(options.surfaceHost);
      throw error;
    }
  }

  function startRun(isRepeat: boolean): Promise<Readonly<PatchMapContractLabRunResult>> {
    assertRunnable();
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
      assertRunnable();
      await awaitActiveRun();
      assertRunnable();
      await liveGesture.release();
      assertRunnable();
      const summary = cleanupSummary(lastCleanup, runCount, completedRunCount);
      assertPatchMapExecutableSurfaceReleased(options.surfaceHost);
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
    async armGesture(value: number): Promise<Readonly<PatchMapContractGesturePlan>> {
      assertActionIndex(value);
      assertRunnable();
      await awaitActiveRun();
      assertRunnable();
      return liveGesture.arm(value, publishedTuple);
    },
    async awaitMilestone(value: number, milestone: PatchMapContractLabMilestone): Promise<void> {
      assertActionIndex(value);
      assertRunnable();
      if (await liveGesture.awaitMilestone(value, milestone)) return;
      assertRunnable();
      const run = await startRun(false);
      const result = arrayValue(run.execution.actionResults, 'execution actionResults')[value];
      invariant(isRecord(result) && result.status === 'completed', `${options.caseId} action ${value} completion`);
      if (milestone === 'released') {
        invariant(run.cleanup.status === 'completed', `${options.caseId} released cleanup milestone`);
      }
    },
    async actualObservation(): Promise<Readonly<Record<string, unknown>>> {
      const liveObservation = liveGesture.observation();
      if (liveObservation !== null) return liveObservation;
      if (lastObservation) return lastObservation;
      if (destroying || destroyed) return destroyedWithoutRunObservation(casePlan);
      try {
        return (await startRun(false)).actualObservation;
      } catch {
        invariant(lastObservation !== null, `${options.caseId} failure observation`);
        return lastObservation;
      }
    },
    destroyCase(): Promise<Readonly<Record<string, unknown>>> {
      if (destroyPromise !== null) return destroyPromise;
      destroying = true;
      const pending = (async () => {
        await awaitActiveRun();
        await liveGesture.release();
        destroyed = true;
        status = 'destroyed';
        assertPatchMapExecutableSurfaceReleased(options.surfaceHost);
        return cleanupSummary(lastCleanup, runCount, completedRunCount);
      })();
      destroyPromise = pending;
      pending.catch(() => {
        if (destroyPromise === pending) destroyPromise = null;
      });
      return pending;
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

function arrayValue(value: unknown, label: string): readonly unknown[] {
  invariant(Array.isArray(value), label);
  return value;
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), label);
  return value;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap executable Lab bridge: ${message}`);
}
