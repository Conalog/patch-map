import type {
  PatchMapContractPublishedTuple,
} from './bridge';
import type { PatchMapExecutableCasePlan } from './executable-cases';
import {
  deepFreezePatchMapLabValue as deepFreeze,
  isPatchMapLabRecord as isRecord,
} from './runtime-values';

const EXECUTABLE_FAILURE_SCHEMA = 'core-v2-contract-lab-failure/1';

export function mergeCleanup(
  executionCleanup: Readonly<Record<string, unknown>> | null,
  supplementalCleanup: Readonly<Record<string, unknown>> | null,
  productProbeFailure: Readonly<Record<string, unknown>> | null = null,
): Readonly<Record<string, unknown>> | null {
  if (!executionCleanup && !supplementalCleanup && !productProbeFailure) return null;
  const executionStatus = executionCleanup?.status;
  const supplementalStatus = supplementalCleanup?.status;
  const productProbeStatus = productProbeFailure?.status;
  const status = [executionStatus, supplementalStatus, productProbeStatus]
    .filter((value): value is string => typeof value === 'string')
    .every((value) => value === 'completed')
    ? 'completed'
    : 'failed';
  return deepFreeze({
    ...(executionCleanup ?? {}),
    status,
    ...(supplementalCleanup ? { supplementalWebGLLease: supplementalCleanup } : {}),
    ...(productProbeFailure ? { productResourceProbe: productProbeFailure } : {}),
  });
}

export function attachPostDestroyProductProbe(
  execution: Readonly<Record<string, unknown>>,
  productResources: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const cleanup = requireRecord(execution.cleanup, 'execution cleanup');
  invariant(
    cleanup.status === 'completed' || cleanup.status === 'failed',
    'post-destroy probe requires terminal cleanup',
  );
  invariant(cleanup.productResources === undefined, 'execution cleanup productResources is unique');
  return deepFreeze({
    ...execution,
    cleanup: {
      ...cleanup,
      productResources,
    },
  });
}

export function executionWithProductCleanup(
  productResources: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    status: 'failed',
    cleanup: {
      status: 'completed',
      errors: [],
      releases: [],
      productResources,
    },
  });
}

export function failureObservation(
  plan: PatchMapExecutableCasePlan,
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

export function destroyedWithoutRunObservation(
  plan: PatchMapExecutableCasePlan,
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

export function partialExecutionFrom(error: unknown): Readonly<Record<string, unknown>> | null {
  if (!isRecord(error) || !isRecord(error.partialExecution)) return null;
  return error.partialExecution;
}

export function executionActionIndex(execution: Readonly<Record<string, unknown>>): number {
  if (!Array.isArray(execution.actionResults)) return -1;
  const results = execution.actionResults as unknown as readonly unknown[];
  const last = results.at(-1);
  return isRecord(last) && Number.isInteger(last.index) ? Number(last.index) : -1;
}

export function executionPublishedTuple(
  execution: Readonly<Record<string, unknown>>,
): PatchMapContractPublishedTuple {
  const terminal = isRecord(execution.terminalSnapshot) ? execution.terminalSnapshot : null;
  const tuple = terminal && isRecord(terminal.publishedTuple) ? terminal.publishedTuple : null;
  if (!tuple) return emptyPublishedTuple();
  return Object.freeze({
    scene: finiteNumberOrZero(tuple.scene),
    view: finiteNumberOrZero(tuple.view),
    interaction: finiteNumberOrZero(tuple.interaction),
  });
}

export function cleanupSummary(
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

export function serializeError(error: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze({
    name: error instanceof Error ? error.name : typeof error,
    code: errorCode(error),
    message: error instanceof Error ? error.message : String(error),
  });
}

export function emptyPublishedTuple(): PatchMapContractPublishedTuple {
  return Object.freeze({ scene: 0, view: 0, interaction: 0 });
}

function sumFinite(values: readonly Readonly<Record<string, unknown>>[], field: string): number | null {
  if (values.length === 0) return null;
  const numbers = values.map((value) => value[field]);
  return numbers.every((value): value is number => typeof value === 'number' && Number.isFinite(value))
    ? numbers.reduce((sum, value) => sum + value, 0)
    : null;
}

function errorCode(error: unknown): string {
  if (isRecord(error) && typeof error.code === 'string') return error.code;
  if (isRecord(error) && isRecord(error.diagnostic) && typeof error.diagnostic.code === 'string') {
    return error.diagnostic.code;
  }
  return error instanceof Error ? error.name : 'UNKNOWN_FAILURE';
}

function finiteNumberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), label);
  return value;
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap executable Lab bridge: ${message}`);
}
