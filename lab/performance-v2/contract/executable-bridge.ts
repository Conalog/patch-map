import {
  CoreV2Engine,
  type CoreV2EngineSurfaceFactory,
  type CoreV2InitializeOptions,
  type CoreV2InitializeResult,
} from '../../../src/core-v2/engine';

// @ts-expect-error -- the committed browser-safe executor is authored as an ESM JavaScript module.
import * as workerModule from '../../../scripts/verification/core-v2-contract/execute-worker.mjs';

import {
  CORE_V2_CONTRACT_LAB_BRIDGE_REVISION,
  CoreV2ContractExecutionNotImplementedError,
  type CoreV2ContractGesturePlan,
  type CoreV2ContractLabBridgeV1,
  type CoreV2ContractLabMilestone,
  type CoreV2ContractLabRunResult,
  type CoreV2ContractLabState,
  type CoreV2ContractLabStatus,
  type CoreV2ContractPublishedTuple,
} from './bridge';
import {
  CORE_V2_EXECUTABLE_CLOCK_PROFILE,
  CORE_V2_EXECUTABLE_PROFILE_ENVIRONMENT,
  isCoreV2ExecutableCaseId,
  materializeCoreV2ExecutableCase,
  resolveCoreV2ExecutableDataset,
  selectCoreV2ExecutableActionDefinitions,
  type CoreV2ExecutableCaseId,
  type CoreV2ExecutableCasePlan,
} from './executable-cases';
import { resolveCoreV2ExecutableRuntime } from './executable-runtime';

const EXECUTABLE_RUNNER_REVISION = 'core-v2-executable-lab-runner/1';
const EXECUTABLE_FAILURE_SCHEMA = 'core-v2-contract-lab-failure/1';

interface WorkerRuntime {
  executeContractCase(
    this: void,
    options: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>>;
}

const { executeContractCase } = workerModule as unknown as WorkerRuntime;

export interface CoreV2ExecutableLabBridgeOptions {
  readonly caseId: CoreV2ExecutableCaseId;
  readonly rootTestId: string;
  readonly size: string;
  readonly seed: number;
  readonly surfaceHost?: HTMLElement;
  readonly surfaceFactory?: CoreV2EngineSurfaceFactory;
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly environment?: Readonly<Record<string, unknown>>;
}

class TargetedWebGLCoreV2Engine extends CoreV2Engine {
  private readonly surfaceHost: HTMLElement | undefined;

  public constructor(
    surfaceHost: HTMLElement | undefined,
    surfaceFactory: CoreV2EngineSurfaceFactory | undefined,
  ) {
    super(surfaceFactory ? { surfaceFactory } : {});
    this.surfaceHost = surfaceHost;
  }

  public override initialize(options: CoreV2InitializeOptions): Promise<CoreV2InitializeResult> {
    return super.initialize({
      ...options,
      preference: 'webgl',
      ...(this.surfaceHost ? { target: this.surfaceHost } : {}),
    });
  }
}

export function createCoreV2ExecutableLabBridge(
  options: CoreV2ExecutableLabBridgeOptions,
): CoreV2ContractLabBridgeV1 {
  invariant(isCoreV2ExecutableCaseId(options.caseId), `unsupported case ${options.caseId}`);
  invariant(options.rootTestId === `scenario-${options.caseId.toLowerCase()}`, 'root test identity');

  const casePlan = materializeCoreV2ExecutableCase(options.caseId, options.size, options.seed);
  const runtime = resolveCoreV2ExecutableRuntime(options.caseId);
  invariant(casePlan.rootTestId === options.rootTestId, 'fixture root test identity');

  let status: CoreV2ContractLabStatus = 'armed';
  let actionIndex = -1;
  let repeatIndex = 0;
  let runCount = 0;
  let completedRunCount = 0;
  let destroyed = false;
  let publishedTuple = emptyPublishedTuple();
  let lastExecution: Readonly<Record<string, unknown>> | null = null;
  let lastCleanup: Readonly<Record<string, unknown>> | null = null;
  let lastObservation: Readonly<Record<string, unknown>> | null = null;
  let lastRun: Readonly<CoreV2ContractLabRunResult> | null = null;
  let activeRun: Promise<Readonly<CoreV2ContractLabRunResult>> | null = null;

  function state(): Readonly<CoreV2ContractLabState> {
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

  async function executeFreshRun(isRepeat: boolean): Promise<Readonly<CoreV2ContractLabRunResult>> {
    invariant(!destroyed, `${options.caseId} bridge is destroyed`);
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
    let supplementalEngine: TargetedWebGLCoreV2Engine | null = null;
    let supplementalCleanup: Readonly<Record<string, unknown>> | null = null;
    let supplementalReleaseError: unknown = null;

    try {
      if (runtime.needsSupplementalWebGLLease) {
        supplementalEngine = new TargetedWebGLCoreV2Engine(
          options.surfaceHost,
          options.surfaceFactory,
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
        actionDefinitions: selectCoreV2ExecutableActionDefinitions(casePlan),
        engineFactory: () => new TargetedWebGLCoreV2Engine(
          options.surfaceHost,
          options.surfaceFactory,
        ),
        datasets: { resolve: resolveCoreV2ExecutableDataset },
        clock: new ExecutableLabClock(),
        handlerEntries: runtime.handlerEntries(casePlan),
      });
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
      } satisfies CoreV2ContractLabRunResult);
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
      const partialExecution = execution ?? partialExecutionFrom(error);
      lastExecution = partialExecution;
      const executionCleanup = partialExecution && isRecord(partialExecution.cleanup)
        ? partialExecution.cleanup
        : null;
      lastCleanup = mergeCleanup(executionCleanup, supplementalCleanup);
      actionIndex = partialExecution ? executionActionIndex(partialExecution) : -1;
      publishedTuple = partialExecution ? executionPublishedTuple(partialExecution) : emptyPublishedTuple();
      status = 'failed';
      lastObservation = failureObservation(casePlan, partialExecution, error);
      assertSurfaceIsReleased(options.surfaceHost);
      throw error;
    }
  }

  function startRun(isRepeat: boolean): Promise<Readonly<CoreV2ContractLabRunResult>> {
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
    revision: CORE_V2_CONTRACT_LAB_BRIDGE_REVISION,
    state,
    execution(): Readonly<Record<string, unknown>> | null {
      return lastExecution;
    },
    cleanup(): Readonly<Record<string, unknown>> | null {
      return lastCleanup;
    },
    runCase(): Promise<Readonly<CoreV2ContractLabRunResult>> {
      return startRun(false);
    },
    async resetCase(): Promise<Readonly<Record<string, unknown>>> {
      invariant(!destroyed, `${options.caseId} bridge is destroyed`);
      await awaitActiveRun();
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
    repeatCase(): Promise<Readonly<CoreV2ContractLabRunResult>> {
      return startRun(true);
    },
    armGesture(value: number): Promise<Readonly<CoreV2ContractGesturePlan>> {
      assertActionIndex(value);
      return Promise.reject(new CoreV2ContractExecutionNotImplementedError(
        options.caseId,
        'gesture execution for the current non-gesture executable slice',
      ));
    },
    async awaitMilestone(value: number, milestone: CoreV2ContractLabMilestone): Promise<void> {
      assertActionIndex(value);
      const run = await startRun(false);
      const result = arrayValue(run.execution.actionResults, 'execution actionResults')[value];
      invariant(isRecord(result) && result.status === 'completed', `${options.caseId} action ${value} completion`);
      if (milestone === 'released') {
        invariant(run.cleanup.status === 'completed', `${options.caseId} released cleanup milestone`);
      }
    },
    async actualObservation(): Promise<Readonly<Record<string, unknown>>> {
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
        destroyed = true;
        status = 'destroyed';
      }
      assertSurfaceIsReleased(options.surfaceHost);
      return cleanupSummary(lastCleanup, runCount, completedRunCount);
    },
  });
}

class ExecutableLabClock {
  private current = CORE_V2_EXECUTABLE_CLOCK_PROFILE.startMs;

  public now(): number {
    return this.current;
  }

  public advanceTo(timeMs: number): Promise<void> {
    invariant(Number.isFinite(timeMs) && timeMs >= this.current, 'manual clock cannot rewind');
    this.current = timeMs;
    return Promise.resolve();
  }

  public withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(new Error(`Core v2 executable Lab timed out: ${label}`));
      }, timeoutMs);
      promise.then(
        (value) => {
          globalThis.clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          globalThis.clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}

function freshCasePlan(plan: CoreV2ExecutableCasePlan): CoreV2ExecutableCasePlan {
  return deepFreeze(structuredClone(plan));
}

function defaultProvenance(plan: CoreV2ExecutableCasePlan): Readonly<Record<string, unknown>> {
  return Object.freeze({
    source: 'focused-lab-product-source',
    codeCommit: 'unbound-worktree-source',
    packedPackageSha256: 'not-packed-source-lab',
    fixtureSha256: plan.fixtureSha256,
    runnerRevision: EXECUTABLE_RUNNER_REVISION,
    promotionEligible: false,
  });
}

function defaultEnvironment(plan: CoreV2ExecutableCasePlan): Readonly<Record<string, unknown>> {
  const userAgent = typeof navigator === 'undefined' ? 'unit-or-non-browser' : navigator.userAgent;
  return deepFreeze({
    ...structuredClone(CORE_V2_EXECUTABLE_PROFILE_ENVIRONMENT),
    backend: 'webgl2',
    browser: userAgent,
    browserVersion: userAgent,
    route: plan.route,
    datasetSize: plan.routeParams.size,
    seed: plan.routeParams.seed,
    canvasLifetime: 'transient-until-executor-cleanup',
  });
}

async function releaseSupplementalWebGLLease(
  engine: TargetedWebGLCoreV2Engine,
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

function mergeCleanup(
  executionCleanup: Readonly<Record<string, unknown>> | null,
  supplementalCleanup: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> | null {
  if (!executionCleanup && !supplementalCleanup) return null;
  const executionStatus = executionCleanup?.status;
  const supplementalStatus = supplementalCleanup?.status;
  const status = [executionStatus, supplementalStatus]
    .filter((value): value is string => typeof value === 'string')
    .every((value) => value === 'completed')
    ? 'completed'
    : 'failed';
  return deepFreeze({
    ...(executionCleanup ?? {}),
    status,
    ...(supplementalCleanup ? { supplementalWebGLLease: supplementalCleanup } : {}),
  });
}

function failureObservation(
  plan: CoreV2ExecutableCasePlan,
  partialExecution: Readonly<Record<string, unknown>> | null,
  error: unknown,
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    $schema: EXECUTABLE_FAILURE_SCHEMA,
    case: {
      id: plan.id,
      caseType: plan.caseType,
      rootTestId: plan.rootTestId,
      params: structuredClone(plan.routeParams),
    },
    execution: partialExecution,
    outcome: {
      status: 'failed',
      error: serializeError(error),
      promotionEligible: false,
    },
  });
}

function destroyedWithoutRunObservation(
  plan: CoreV2ExecutableCasePlan,
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    $schema: EXECUTABLE_FAILURE_SCHEMA,
    case: { id: plan.id, rootTestId: plan.rootTestId, params: structuredClone(plan.routeParams) },
    execution: null,
    outcome: {
      status: 'destroyed-without-run',
      promotionEligible: false,
    },
  });
}

function partialExecutionFrom(error: unknown): Readonly<Record<string, unknown>> | null {
  if (!isRecord(error) || !isRecord(error.partialExecution)) return null;
  return error.partialExecution;
}

function executionActionIndex(execution: Readonly<Record<string, unknown>>): number {
  if (!Array.isArray(execution.actionResults)) return -1;
  const results = execution.actionResults as unknown as readonly unknown[];
  const last = results.at(-1);
  return isRecord(last) && Number.isInteger(last.index) ? Number(last.index) : -1;
}

function executionPublishedTuple(
  execution: Readonly<Record<string, unknown>>,
): CoreV2ContractPublishedTuple {
  const terminal = isRecord(execution.terminalSnapshot) ? execution.terminalSnapshot : null;
  const tuple = terminal && isRecord(terminal.publishedTuple) ? terminal.publishedTuple : null;
  if (!tuple) return emptyPublishedTuple();
  return Object.freeze({
    scene: finiteNumberOrZero(tuple.scene),
    view: finiteNumberOrZero(tuple.view),
    interaction: finiteNumberOrZero(tuple.interaction),
  });
}

function cleanupSummary(
  cleanup: Readonly<Record<string, unknown>> | null,
  runCount: number,
  completedRunCount: number,
): Readonly<Record<string, unknown>> {
  const releases = cleanup && Array.isArray(cleanup.releases) ? cleanup.releases : [];
  const remaining = releases
    .map((release) => isRecord(release) && isRecord(release.remainingResources)
      ? release.remainingResources
      : null)
    .filter((value): value is Readonly<Record<string, unknown>> => value !== null);
  const supplemental = cleanup && isRecord(cleanup.supplementalWebGLLease)
    && isRecord(cleanup.supplementalWebGLLease.remainingResources)
    ? cleanup.supplementalWebGLLease.remainingResources
    : null;
  if (supplemental) remaining.push(supplemental);
  return deepFreeze({
    status: cleanup?.status ?? 'not-run',
    runCount,
    completedRunCount,
    releasedEngineCount: releases.length + Number(supplemental !== null),
    retainedCanvasCount: sumFinite(remaining, 'canvasCount'),
    retainedSubscriptionCount: sumFinite(remaining, 'subscriptions'),
    retainedPendingWork: sumFinite(remaining, 'pendingWork'),
  });
}

function sumFinite(values: readonly Readonly<Record<string, unknown>>[], field: string): number | null {
  if (values.length === 0) return null;
  const numbers = values.map((value) => value[field]);
  return numbers.every((value): value is number => typeof value === 'number' && Number.isFinite(value))
    ? numbers.reduce((sum, value) => sum + value, 0)
    : null;
}

function assertSurfaceIsReleased(surfaceHost: HTMLElement | undefined): void {
  if (!surfaceHost || typeof surfaceHost.querySelector !== 'function') return;
  invariant(
    surfaceHost.querySelector('canvas[data-patch-map-core="v2"]') === null,
    'executor left a tracked PixiJS canvas in the Lab host',
  );
}

function serializeError(error: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze({
    name: error instanceof Error ? error.name : typeof error,
    code: errorCode(error),
    message: error instanceof Error ? error.message : String(error),
  });
}

function errorCode(error: unknown): string {
  if (isRecord(error) && typeof error.code === 'string') return error.code;
  if (isRecord(error) && isRecord(error.diagnostic) && typeof error.diagnostic.code === 'string') {
    return error.diagnostic.code;
  }
  return error instanceof Error ? error.name : 'UNKNOWN_FAILURE';
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  invariant(Array.isArray(value), label);
  return value;
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), label);
  return value;
}

function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function emptyPublishedTuple(): CoreV2ContractPublishedTuple {
  return Object.freeze({ scene: 0, view: 0, interaction: 0 });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 executable Lab bridge: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
