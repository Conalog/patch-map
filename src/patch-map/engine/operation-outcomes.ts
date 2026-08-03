import { PatchMapAssetError } from '../assets';
import type { PatchMapHistoryState } from '../history';
import { PatchMapPresentationError } from '../presentation';
import { PatchMapPixiRuntimeError } from '../renderers/pixi-renderer';
import {
  PatchMapDatasetError,
  type MaterializedPatchMapDataset,
} from '../semantic/dataset';
import type { PatchMapSemanticMutationDiagnostic } from '../semantic/mutation';
import type { PatchMapSemanticTarget } from '../semantic/probe';
import type { PatchMapReconcileDiagnostic } from '../semantic/reconcile';
import type {
  PatchMapMutationTarget,
  PatchMapMutationTransactionDiagnostic,
} from '../semantic/transaction';
import type {
  PatchMapDiagnosticCategory,
  PatchMapEngineDestroyTargetResult,
  PatchMapEngineDiagnostic,
  PatchMapEnginePatchResult,
  PatchMapEngineTransactionHistory,
  PatchMapEngineTransactionResult,
  PatchMapRevisionStamp,
} from './public-contracts';

export const EMPTY_PATCH_MAP_TARGETS = Object.freeze([] as PatchMapSemanticTarget[]);
export const EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS = Object.freeze(
  [] as PatchMapReconcileDiagnostic[],
);

function patchMapErrorSummary(diagnostic: PatchMapEngineDiagnostic): string {
  switch (diagnostic.code) {
    case 'UNSUPPORTED_RUNTIME':
      return diagnostic.operation === 'initialize'
        ? 'PatchMap could not start the requested GPU renderer'
        : 'This PatchMap operation is unavailable in the current renderer';
    case 'NOT_READY':
      return 'PatchMap is not ready for this operation';
    case 'DESTROYED':
      return 'This PatchMap instance has already been destroyed';
    case 'MISSING_TARGET':
      return 'PatchMap could not find one or more requested targets';
    case 'INVALID_VALUE':
    case 'INVALID_INPUT':
      return 'PatchMap received invalid input';
    case 'CONFLICT':
      return 'PatchMap could not apply the operation because state changed';
    case 'RENDERER_LOST':
      return 'PatchMap lost its GPU renderer context';
    default:
      return 'PatchMap could not complete the operation';
  }
}

function patchMapErrorHint(diagnostic: PatchMapEngineDiagnostic): string {
  if (diagnostic.code === 'UNSUPPORTED_RUNTIME' && diagnostic.operation === 'initialize') {
    return 'Use a browser with WebGL2 and hardware acceleration enabled. WebGPU is experimental.';
  }
  if (diagnostic.code === 'NOT_READY') {
    return 'Await PatchMap.mount(...) or initialize(...) before calling this method.';
  }
  if (diagnostic.code === 'DESTROYED') {
    return 'Create a new PatchMap instance instead of reusing a destroyed one.';
  }
  if (diagnostic.code === 'MISSING_TARGET') {
    return 'Check id/componentId, or compile the selector again after loading new data.';
  }
  if (diagnostic.code === 'INVALID_VALUE' || diagnostic.code === 'INVALID_INPUT') {
    return diagnostic.datasetPath === undefined
      ? 'Check the operation arguments and PATCH MAP v0.10 input shape.'
      : `Check the value at ${diagnostic.datasetPath}.`;
  }
  if (diagnostic.code === 'RENDERER_LOST') {
    return 'Destroy this instance and mount a new one after the browser restores GPU access.';
  }
  return diagnostic.recoverable
    ? 'Review diagnostic for the rejected operation; the current scene was left unchanged.'
    : 'Destroy this instance and mount a new one. Preserve this diagnostic when reporting the issue.';
}

export class PatchMapError extends Error {
  public readonly diagnostic: PatchMapEngineDiagnostic;
  public readonly code: PatchMapEngineDiagnostic['code'];
  public readonly operation: PatchMapEngineDiagnostic['operation'];
  public readonly hint: string;
  public readonly recoverable: boolean;

  public constructor(diagnostic: PatchMapEngineDiagnostic) {
    const summary = patchMapErrorSummary(diagnostic);
    const hint = patchMapErrorHint(diagnostic);
    super(`${summary} [${diagnostic.code}: ${diagnostic.operation}]. ${hint}`);
    this.name = 'PatchMapError';
    this.diagnostic = diagnostic;
    this.code = diagnostic.code;
    this.operation = diagnostic.operation;
    this.hint = hint;
    this.recoverable = diagnostic.recoverable;
  }
}

export function createPatchMapOperationDiagnostic(
  revisionStamp: PatchMapRevisionStamp,
  code: string,
  category: PatchMapDiagnosticCategory,
  operation: string,
  recoverable: boolean,
  datasetPath?: string,
): PatchMapEngineDiagnostic {
  return Object.freeze({
    code,
    category,
    operation,
    lifecycleGeneration: revisionStamp.lifecycleGeneration,
    sceneRevision: revisionStamp.sceneRevision,
    revisionStamp,
    recoverable,
    retryable: recoverable,
    appliedCount: 0,
    missingCount: 0,
    unchangedCount: 0,
    ...(datasetPath === undefined ? {} : { datasetPath }),
  });
}

export function createPatchMapOperationError(
  revisionStamp: PatchMapRevisionStamp,
  code: string,
  category: PatchMapDiagnosticCategory,
  operation: string,
  recoverable: boolean,
): PatchMapError {
  return new PatchMapError(createPatchMapOperationDiagnostic(
    revisionStamp,
    code,
    category,
    operation,
    recoverable,
  ));
}

export function createPatchMapAssetInitializationError(
  error: unknown,
  revisionStamp: PatchMapRevisionStamp,
): PatchMapError {
  if (error instanceof PatchMapError) return error;
  if (error instanceof PatchMapPixiRuntimeError) {
    return createPatchMapOperationError(
      revisionStamp,
      error.code,
      error.code,
      'initialize',
      false,
    );
  }
  if (error instanceof PatchMapAssetError) {
    return createPatchMapOperationError(
      revisionStamp,
      error.code,
      error.category,
      'initialize',
      error.retryable,
    );
  }
  return createPatchMapOperationError(
    revisionStamp,
    'INTERNAL_FAILURE',
    'INTERNAL_FAILURE',
    'initialize',
    false,
  );
}

export function createPatchMapDiagnosticFromError(
  error: unknown,
  operation: string,
  revisionStamp: PatchMapRevisionStamp,
): PatchMapEngineDiagnostic {
  if (error instanceof PatchMapDatasetError) {
    return createPatchMapOperationDiagnostic(
      revisionStamp,
      error.code,
      error.category,
      operation,
      true,
      error.datasetPath,
    );
  }
  if (error instanceof PatchMapError) return error.diagnostic;
  if (error instanceof PatchMapPixiRuntimeError) {
    return createPatchMapOperationDiagnostic(
      revisionStamp,
      error.code,
      error.code,
      operation,
      false,
    );
  }
  if (error instanceof PatchMapPresentationError) {
    return createPatchMapOperationDiagnostic(
      revisionStamp,
      'CONFLICT',
      'CONFLICT',
      operation,
      true,
    );
  }
  if (error instanceof PatchMapAssetError) {
    return createPatchMapOperationDiagnostic(
      revisionStamp,
      error.code,
      error.category,
      operation,
      error.retryable,
    );
  }
  return createPatchMapOperationDiagnostic(
    revisionStamp,
    'INTERNAL_FAILURE',
    'INTERNAL_FAILURE',
    operation,
    false,
  );
}

export function createPatchMapSemanticMutationDiagnostic(
  diagnostic: PatchMapSemanticMutationDiagnostic,
  target: PatchMapSemanticTarget | null,
  operation: string,
  revisionStamp: PatchMapRevisionStamp,
): PatchMapEngineDiagnostic {
  const mapping = mutationDiagnosticMapping(diagnostic);
  const base = createPatchMapOperationDiagnostic(
    revisionStamp,
    mapping.code,
    mapping.category,
    operation,
    mapping.recoverable,
    diagnostic.path,
  );
  return Object.freeze({
    ...base,
    missingCount: diagnostic.reason === 'missing-target' && target ? 1 : 0,
  });
}

export function createPatchMapTransactionDiagnostic(
  diagnostic: PatchMapMutationTransactionDiagnostic,
  operation: string,
  revisionStamp: PatchMapRevisionStamp,
): PatchMapEngineDiagnostic {
  const category: PatchMapDiagnosticCategory = diagnostic.category === 'MISSING_TARGET'
    ? 'MISSING_TARGET'
    : diagnostic.category === 'CONFLICT'
      ? 'CONFLICT'
    : diagnostic.category === 'UNSUPPORTED_RUNTIME'
      ? 'UNSUPPORTED_RUNTIME'
      : 'INVALID_INPUT';
  const base = createPatchMapOperationDiagnostic(
    revisionStamp,
    diagnostic.code,
    category,
    operation,
    true,
    diagnostic.path,
  );
  return Object.freeze({
    ...base,
    missingCount: diagnostic.category === 'MISSING_TARGET' ? 1 : 0,
  });
}

export function createPatchMapRejectedTransactionResult(
  actionId: string | null,
  previousRevisions: PatchMapRevisionStamp,
  revisions: PatchMapRevisionStamp,
  semanticHash: string | null,
  diagnostic: PatchMapEngineDiagnostic,
  transactionDiagnostic: PatchMapMutationTransactionDiagnostic | undefined,
  history: PatchMapHistoryState,
): Extract<PatchMapEngineTransactionResult, { readonly status: 'rejected' }> {
  return Object.freeze({
    status: 'rejected',
    changed: false,
    actionId,
    previousRevisions,
    revisions,
    semanticHash,
    applied: freezePatchMapMutationTargets([]),
    missing: freezePatchMapMutationTargets([]),
    unchanged: freezePatchMapMutationTargets([]),
    history: freezePatchMapTransactionHistory(false, null, history, history),
    diagnostic,
    ...(transactionDiagnostic === undefined ? {} : { transactionDiagnostic }),
  });
}

export function createPatchMapRefusedTransactionResult(
  actionId: string | null,
  previousRevisions: PatchMapRevisionStamp,
  revisions: PatchMapRevisionStamp,
  semanticHash: string | null,
  diagnostic: PatchMapEngineDiagnostic,
  history: PatchMapHistoryState,
  reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
): Extract<PatchMapEngineTransactionResult, { readonly status: 'refused' }> {
  return Object.freeze({
    status: 'refused',
    changed: false,
    actionId,
    previousRevisions,
    revisions,
    semanticHash,
    applied: freezePatchMapMutationTargets([]),
    missing: freezePatchMapMutationTargets([]),
    unchanged: freezePatchMapMutationTargets([]),
    history: freezePatchMapTransactionHistory(false, null, history, history),
    diagnostic,
    reconcileDiagnostics,
  });
}

export function createPatchMapRejectedPatchResult(
  target: PatchMapSemanticTarget | null,
  previousRevisions: PatchMapRevisionStamp,
  revisions: PatchMapRevisionStamp,
  semanticHash: string | null,
  diagnostic: PatchMapEngineDiagnostic,
): Extract<PatchMapEnginePatchResult, { readonly status: 'rejected' }> {
  return Object.freeze({
    status: 'rejected',
    changed: false,
    target,
    previousRevisions,
    revisions,
    semanticHash,
    applied: EMPTY_PATCH_MAP_TARGETS,
    missing: EMPTY_PATCH_MAP_TARGETS,
    unchanged: EMPTY_PATCH_MAP_TARGETS,
    diagnostic,
  });
}

export function createPatchMapRefusedPatchResult(
  target: PatchMapSemanticTarget,
  previousRevisions: PatchMapRevisionStamp,
  revisions: PatchMapRevisionStamp,
  semanticHash: string | null,
  diagnostic: PatchMapEngineDiagnostic,
  reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
): Extract<PatchMapEnginePatchResult, { readonly status: 'refused' }> {
  return Object.freeze({
    status: 'refused',
    changed: false,
    target,
    previousRevisions,
    revisions,
    semanticHash,
    applied: EMPTY_PATCH_MAP_TARGETS,
    missing: EMPTY_PATCH_MAP_TARGETS,
    unchanged: EMPTY_PATCH_MAP_TARGETS,
    diagnostic,
    reconcileDiagnostics,
  });
}

export function createPatchMapRefusedDestroyTargetResult(
  target: Extract<PatchMapSemanticTarget, { readonly kind: 'element' }>,
  previousRevisions: PatchMapRevisionStamp,
  revisions: PatchMapRevisionStamp,
  semanticHash: string | null,
  diagnostic: PatchMapEngineDiagnostic,
  reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
): Extract<PatchMapEngineDestroyTargetResult, { readonly status: 'refused' }> {
  return Object.freeze({
    status: 'refused',
    changed: false,
    target,
    previousRevisions,
    revisions,
    semanticHash,
    applied: EMPTY_PATCH_MAP_TARGETS,
    missing: EMPTY_PATCH_MAP_TARGETS,
    unchanged: EMPTY_PATCH_MAP_TARGETS,
    diagnostic,
    reconcileDiagnostics,
  });
}

export function freezePatchMapMutationTargets(
  values: readonly PatchMapMutationTarget[],
): readonly PatchMapMutationTarget[] {
  if (
    Object.isFrozen(values)
    && values.every((target) => Object.isFrozen(target))
  ) {
    return values;
  }
  return Object.freeze(values.map((target) => Object.freeze({ ...target })));
}

export function freezePatchMapTargets(
  values: readonly PatchMapSemanticTarget[],
): readonly PatchMapSemanticTarget[] {
  return Object.freeze([...values]);
}

export function freezePatchMapCommittedTransactionResult(
  candidate: MaterializedPatchMapDataset,
  value: Omit<
    Extract<PatchMapEngineTransactionResult, { readonly status: 'committed' }>,
    'semanticHash'
  >,
): Extract<PatchMapEngineTransactionResult, { readonly status: 'committed' }> {
  const result = value as Extract<
    PatchMapEngineTransactionResult,
    { readonly status: 'committed' }
  >;
  Object.defineProperty(result, 'semanticHash', {
    enumerable: true,
    configurable: false,
    get: () => candidate.semanticHash,
  });
  return Object.freeze(result);
}

export function freezePatchMapTransactionHistory(
  recorded: boolean,
  commandId: string | null,
  previous: PatchMapHistoryState,
  current: PatchMapHistoryState,
): PatchMapEngineTransactionHistory {
  return Object.freeze({
    recorded,
    commandId,
    depthDelta: current.undoDepth - previous.undoDepth,
    state: current,
  });
}

export function freezePatchMapReconcileDiagnostics(
  values: readonly PatchMapReconcileDiagnostic[],
): readonly PatchMapReconcileDiagnostic[] {
  return Object.freeze(values.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

function mutationDiagnosticMapping(
  diagnostic: PatchMapSemanticMutationDiagnostic,
): Readonly<{
  code: string;
  category: PatchMapDiagnosticCategory;
  recoverable: boolean;
}> {
  switch (diagnostic.reason) {
    case 'missing-target':
      return { code: 'MISSING_TARGET', category: 'MISSING_TARGET', recoverable: true };
    case 'ambiguous-target':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'unsupported-structure':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'invalid-candidate':
      return {
        code: diagnostic.datasetCode ?? 'INVALID_MUTATION',
        category: 'INVALID_INPUT',
        recoverable: true,
      };
    case 'invalid-target':
      return { code: 'INVALID_MUTATION', category: 'INVALID_INPUT', recoverable: true };
    case 'invalid-value':
      return { code: 'INVALID_VALUE', category: 'INVALID_INPUT', recoverable: true };
  }
}
