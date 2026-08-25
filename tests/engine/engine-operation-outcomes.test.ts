import { describe, expect, it } from 'vitest';

import { PatchMapError as FacadePatchMapError } from '../../src/patch-map/engine';
import {
  PatchMapError,
  createPatchMapAssetInitializationError,
  createPatchMapDiagnosticFromError,
  createPatchMapOperationDiagnostic,
  createPatchMapOperationError,
  createPatchMapRejectedTransactionResult,
  createPatchMapSemanticMutationDiagnostic,
  freezePatchMapCommittedTransactionResult,
  freezePatchMapMutationTargets,
  freezePatchMapReconcileDiagnostics,
  freezePatchMapTransactionHistory,
} from '../../src/patch-map/engine/operation-outcomes';
import { PatchMapDatasetError } from '../../src/patch-map/semantic/dataset';
import type { MaterializedPatchMapDataset } from '../../src/patch-map/semantic/dataset';
import type { PatchMapHistoryState } from '../../src/patch-map/history';
import type {
  PatchMapRevisionStamp,
} from '../../src/patch-map/engine/contracts/lifecycle';
import { PatchMapRendererRuntimeError } from '../../src/patch-map/renderers/contracts';
import { PatchMapPixiRuntimeError } from '../../src/patch-map/renderers/pixi-renderer';

const REVISIONS: PatchMapRevisionStamp = Object.freeze({
  lifecycleGeneration: 2,
  sceneRevision: 3,
  viewRevision: 5,
  interactionRevision: 7,
});

const HISTORY: PatchMapHistoryState = Object.freeze({
  capacity: 20,
  depth: 2,
  cursor: 2,
  undoDepth: 2,
  redoDepth: 0,
  canUndo: true,
  canRedo: false,
  destroyed: false,
});

describe('PatchMap Engine immutable operation outcomes', () => {
  it('owns the public PatchMapError identity and frozen diagnostic envelope', () => {
    const diagnostic = createPatchMapOperationDiagnostic(
      REVISIONS,
      'INVALID_VALUE',
      'INVALID_INPUT',
      'patch',
      true,
      '$[0].size',
    );
    const error = createPatchMapOperationError(
      REVISIONS,
      'INVALID_VALUE',
      'INVALID_INPUT',
      'patch',
      true,
    );

    expect(FacadePatchMapError).toBe(PatchMapError);
    expect(diagnostic).toEqual({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation: 'patch',
      lifecycleGeneration: 2,
      sceneRevision: 3,
      revisionStamp: REVISIONS,
      recoverable: true,
      retryable: true,
      appliedCount: 0,
      missingCount: 0,
      unchangedCount: 0,
      datasetPath: '$[0].size',
    });
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(error).toBeInstanceOf(PatchMapError);
    expect(error.message).toBe(
      'PatchMap received invalid input [INVALID_VALUE: patch]. ' +
      'Check the operation arguments and PatchMap input shape.',
    );
    expect(error).toMatchObject({
      code: 'INVALID_VALUE',
      operation: 'patch',
      recoverable: true,
      hint: 'Check the operation arguments and PatchMap input shape.',
    });
    expect(error.diagnostic).toMatchObject({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation: 'patch',
    });
  });

  it('normalizes known errors and semantic mutation diagnostics without state writes', () => {
    const datasetDiagnostic = createPatchMapDiagnosticFromError(
      new PatchMapDatasetError('MISSING_TARGET', '$[2].links[0].target', 'missing'),
      'loadDataset',
      REVISIONS,
    );
    const mutationDiagnostic = createPatchMapSemanticMutationDiagnostic(
      {
        reason: 'missing-target',
        path: '$.target',
        message: 'missing',
      },
      { kind: 'element', id: 'missing' },
      'patch',
      REVISIONS,
    );

    expect(datasetDiagnostic).toMatchObject({
      code: 'MISSING_TARGET',
      category: 'MISSING_TARGET',
      operation: 'loadDataset',
      datasetPath: '$[2].links[0].target',
      recoverable: true,
      missingCount: 0,
    });
    expect(mutationDiagnostic).toMatchObject({
      code: 'MISSING_TARGET',
      category: 'MISSING_TARGET',
      operation: 'patch',
      datasetPath: '$.target',
      recoverable: true,
      missingCount: 1,
    });
    expect(Object.isFrozen(datasetDiagnostic)).toBe(true);
    expect(Object.isFrozen(mutationDiagnostic)).toBe(true);
  });

  it('normalizes concrete renderer failures through the neutral renderer contract', () => {
    const error = new PatchMapPixiRuntimeError(
      'RENDERER_LOST',
      'context lost',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PatchMapRendererRuntimeError);
    expect(error).toBeInstanceOf(PatchMapPixiRuntimeError);
    expect(error).toMatchObject({
      name: 'PatchMapPixiRuntimeError',
      message: 'context lost',
      code: 'RENDERER_LOST',
    });
    expect(createPatchMapDiagnosticFromError(error, 'publishFrame', REVISIONS))
      .toMatchObject({
        code: 'RENDERER_LOST',
        category: 'RENDERER_LOST',
        operation: 'publishFrame',
        recoverable: false,
      });

    const initialization = createPatchMapAssetInitializationError(
      new PatchMapPixiRuntimeError('UNSUPPORTED_RUNTIME', 'WebGL2 unavailable'),
      REVISIONS,
    );
    expect(initialization).toMatchObject({
      code: 'UNSUPPORTED_RUNTIME',
      operation: 'initialize',
      recoverable: false,
      hint: 'Use a browser with WebGL2 and hardware acceleration enabled. WebGPU is experimental.',
      diagnostic: {
        code: 'UNSUPPORTED_RUNTIME',
        category: 'UNSUPPORTED_RUNTIME',
        retryable: false,
      },
    });

    const forged = Object.assign(new Error('not a renderer error'), {
      code: 'RENDERER_LOST',
    });
    expect(createPatchMapDiagnosticFromError(forged, 'publishFrame', REVISIONS))
      .toMatchObject({
        code: 'INTERNAL_FAILURE',
        category: 'INTERNAL_FAILURE',
      });
  });

  it('detaches mutable targets and reconcile diagnostics while retaining frozen inputs', () => {
    const mutableTarget = { kind: 'component', ownerId: 'item', id: 'label' } as const;
    const mutableTargets = [mutableTarget];
    const detachedTargets = freezePatchMapMutationTargets(mutableTargets);
    const alreadyFrozen = Object.freeze([
      Object.freeze({ kind: 'element', id: 'item' } as const),
    ]);
    const reconcileInput = [{
      severity: 'error',
      code: 'UNPROJECTED_SEMANTIC_DELTA',
      path: '$[0]',
      message: 'refused',
    }] as const;
    const reconcile = freezePatchMapReconcileDiagnostics(reconcileInput);

    expect(detachedTargets).not.toBe(mutableTargets);
    expect(detachedTargets[0]).not.toBe(mutableTarget);
    expect(Object.isFrozen(detachedTargets)).toBe(true);
    expect(Object.isFrozen(detachedTargets[0])).toBe(true);
    expect(freezePatchMapMutationTargets(alreadyFrozen)).toBe(alreadyFrozen);
    expect(reconcile).not.toBe(reconcileInput);
    expect(reconcile[0]).not.toBe(reconcileInput[0]);
    expect(Object.isFrozen(reconcile)).toBe(true);
    expect(Object.isFrozen(reconcile[0])).toBe(true);
  });

  it('constructs frozen rejected and committed transaction results with stable hash ownership', () => {
    const diagnostic = createPatchMapOperationDiagnostic(
      REVISIONS,
      'CONFLICT',
      'CONFLICT',
      'transact',
      true,
    );
    const rejected = createPatchMapRejectedTransactionResult(
      'action-a',
      REVISIONS,
      REVISIONS,
      'stable-hash',
      diagnostic,
      undefined,
      HISTORY,
    );
    const candidate = { semanticHash: 'candidate-hash' };
    const history = freezePatchMapTransactionHistory(true, 'action-a', {
      ...HISTORY,
      undoDepth: 1,
    }, HISTORY);
    const committed = freezePatchMapCommittedTransactionResult(
      candidate as unknown as MaterializedPatchMapDataset,
      {
        status: 'committed',
        changed: true,
        actionId: 'action-a',
        previousRevisions: REVISIONS,
        revisions: REVISIONS,
        applied: Object.freeze([]),
        missing: Object.freeze([]),
        unchanged: Object.freeze([]),
        history,
        publication: 'pending',
        denseOperationCount: 1,
        denseChanged: true,
        reconcileDiagnostics: Object.freeze([]),
      },
    );

    expect(rejected).toMatchObject({
      status: 'rejected',
      changed: false,
      actionId: 'action-a',
      semanticHash: 'stable-hash',
      diagnostic,
    });
    expect(Object.isFrozen(rejected)).toBe(true);
    expect(Object.isFrozen(rejected.applied)).toBe(true);
    expect(rejected.history).toEqual({
      recorded: false,
      commandId: null,
      depthDelta: 0,
      state: HISTORY,
    });
    expect(committed.semanticHash).toBe('candidate-hash');
    candidate.semanticHash = 'updated-hash';
    expect(committed.semanticHash).toBe('updated-hash');
    expect(Object.getOwnPropertyDescriptor(committed, 'semanticHash')).toMatchObject({
      enumerable: true,
      configurable: false,
    });
    expect(Object.isFrozen(committed)).toBe(true);
  });
});
