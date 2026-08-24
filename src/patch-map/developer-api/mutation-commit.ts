import type { PatchMapInstanceBarHeightBatchRequest } from '../core/contracts';
import type {
  PatchMapEngineInstanceBarHeightResult,
  PatchMapEngineTransactionResult,
} from '../engine/public-contracts';
import type {
  PatchMapBarHeightBatchRequest,
  PatchMapMutationOperation,
  PatchMapMutationTransactionRequest,
  PatchMapTextBatchRequest,
} from '../semantic/transaction';
import type {
  PatchMapTransactionOptions,
  PatchMapUpdateBatchOptions,
  PatchMapUpdateOptions,
  PatchMapUpdateResult,
} from './contracts';
import type { ResolvedBarMutation, ResolvedTextMutation } from './mutation-batch';
import type { ResolvedInstancePresentationBatch } from './mutation-batch';

export interface PatchMapMutationDeveloperHost {
  transact(request: PatchMapMutationTransactionRequest): PatchMapEngineTransactionResult;
  updateBarHeights(request: PatchMapBarHeightBatchRequest): PatchMapEngineTransactionResult;
  updateInstanceBarHeights(
    request: PatchMapInstanceBarHeightBatchRequest,
  ): PatchMapEngineInstanceBarHeightResult;
  updateTexts(request: PatchMapTextBatchRequest): PatchMapEngineTransactionResult;
}

export const EMPTY_UPDATE_RESULT: PatchMapUpdateResult = Object.freeze({
  status: 'unchanged',
  changed: false,
  appliedCount: 0,
  missing: Object.freeze([]),
  diagnostic: null,
});

export function commitBarUpdates(
  host: PatchMapMutationDeveloperHost,
  updates: readonly ResolvedBarMutation[],
  options: PatchMapUpdateOptions | PatchMapUpdateBatchOptions,
  heightColumn?: ArrayLike<number | null>,
): PatchMapUpdateResult {
  const instanceCount = updates.filter((update) => update.instance).length;
  if (instanceCount !== 0 && instanceCount !== updates.length) {
    throw new TypeError('updateBatch() cannot mix authored and concrete grid-instance bar targets');
  }
  if (instanceCount === updates.length) {
    return projectInstanceResult(host.updateInstanceBarHeights({
      targets: updates.map(({ ownerId: id, componentId }) => ({ id, componentId })),
      heights: heightColumn ?? updates.map(({ height }) => height),
      ...instanceAnimationRequest(options.animate, updates.map(({ ownerId: id, componentId }) => ({
        id,
        componentId,
      }))),
    }));
  }
  if (updates.some(({ height }) => height === null)) {
    throw new TypeError('null bar heights only restore concrete grid-instance presentation values');
  }
  return projectTransactionResult(host.updateBarHeights({
    targets: updates.map(({ ownerId, componentId }) => ({ ownerId, componentId })),
    heights: (heightColumn ?? updates.map(({ height }) => height)) as ArrayLike<number>,
    ...(options.animate === undefined ? {} : { animate: options.animate }),
    ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
  }));
}

export function commitInstancePresentation(
  host: PatchMapMutationDeveloperHost,
  request: ResolvedInstancePresentationBatch,
  options: PatchMapUpdateOptions | PatchMapUpdateBatchOptions,
): PatchMapUpdateResult {
  return projectInstanceResult(host.updateInstanceBarHeights({
    ...request,
    ...instanceAnimationRequest(
      options.animate,
      request.bar?.targets ?? request.targets ?? Object.freeze([]),
    ),
  }));
}

function instanceAnimationRequest(
  animate: boolean | ArrayLike<boolean> | undefined,
  targets: readonly Readonly<{ readonly id: string; readonly componentId: string }>[],
): Readonly<{
  readonly animate?: boolean;
  readonly animatedBarTargets?: readonly Readonly<{
    readonly id: string;
    readonly componentId: string;
  }>[];
}> {
  if (animate === undefined || typeof animate === 'boolean') {
    return animate === undefined ? Object.freeze({}) : Object.freeze({ animate });
  }
  const animated = targets.filter((_target, index) => animate[index] === true);
  if (animated.length === targets.length) return Object.freeze({ animate: true });
  if (animated.length === 0) return Object.freeze({ animate: false });
  return Object.freeze({
    animate: true,
    animatedBarTargets: Object.freeze(animated.map((target) => Object.freeze({ ...target }))),
  });
}

export function commitTextUpdates(
  host: PatchMapMutationDeveloperHost,
  updates: readonly ResolvedTextMutation[],
  options: PatchMapUpdateOptions,
): PatchMapUpdateResult {
  const hasStyle = updates.some((update) => update.style !== undefined);
  return projectTransactionResult(host.updateTexts({
    targets: updates.map(({ ownerId, componentId }) => ({ ownerId, componentId })),
    texts: updates.map(({ text }) => text),
    ...(hasStyle ? { styles: updates.map(({ style }) => style ?? {}) } : {}),
    ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
  }));
}

export function commitOperations(
  host: PatchMapMutationDeveloperHost,
  operations: readonly PatchMapMutationOperation[],
  options: PatchMapUpdateOptions,
): PatchMapUpdateResult {
  if (operations.length === 0) return EMPTY_UPDATE_RESULT;
  return projectTransactionResult(host.transact({
    operations,
    strict: true,
    ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
  }));
}

export function commitTransactionOperations(
  host: PatchMapMutationDeveloperHost,
  operations: readonly PatchMapMutationOperation[],
  options: PatchMapTransactionOptions,
  animatedBarTargets?: readonly Readonly<{
    readonly ownerId: string;
    readonly componentId: string;
  }>[],
): PatchMapUpdateResult {
  if (operations.length === 0) return EMPTY_UPDATE_RESULT;
  return projectTransactionResult(host.transact({
    operations,
    strict: true,
    ...(options.actionId === undefined ? {} : { actionId: options.actionId }),
    ...(options.recordHistory === undefined ? {} : { recordHistory: options.recordHistory }),
    ...(options.conflictPolicy === undefined ? {} : { conflictPolicy: options.conflictPolicy }),
    ...(options.selectedIds === undefined
      ? {}
      : { history: Object.freeze({ selectedIds: Object.freeze([...options.selectedIds]) }) }),
    ...(animatedBarTargets === undefined ? {} : { animatedBarTargets }),
  }));
}

function projectTransactionResult(result: PatchMapEngineTransactionResult): PatchMapUpdateResult {
  const diagnostic = result.status === 'rejected' || result.status === 'refused'
    ? result.diagnostic
    : null;
  return Object.freeze({
    status: result.status === 'committed'
      ? 'committed'
      : result.status === 'rejected'
        ? 'rejected'
        : result.status === 'refused'
          ? 'refused'
          : 'unchanged',
    changed: result.changed,
    appliedCount: result.applied.length,
    missing: Object.freeze(result.missing.map((target) => target.kind === 'element'
      ? Object.freeze({ id: target.id })
      : Object.freeze({ id: target.ownerId, componentId: target.id }))),
    diagnostic,
  });
}

function projectInstanceResult(
  result: PatchMapEngineInstanceBarHeightResult,
): PatchMapUpdateResult {
  return Object.freeze({
    status: result.status,
    changed: result.changed,
    appliedCount: result.appliedTargets.length,
    missing: result.missingTargets,
    diagnostic: result.status === 'rejected' ? result.diagnostic : null,
  });
}
