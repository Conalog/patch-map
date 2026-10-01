import type {
  MaterializedPatchMapDataset,
  NormalizedPatchMapElement,
} from '../semantic/dataset';
import {
  applyPatchMapSemanticPatch,
  removePatchMapSemanticTarget,
} from '../semantic/mutation';
import type { PatchMapSemanticTarget } from '../semantic/probe';
import type { PatchMapReconcileDiagnostic } from '../core/reconcile';
import { sameStringArray } from '../shared/string-array-values';
import type {
  PatchMapSemanticHistory,
  PatchMapHistoryPreparedRecord,
} from '../history';
import type {
  PatchMapEngineSurface,
  PatchMapSurfaceReconcileResult,
} from './contracts';
import {
  createPatchMapEngineHistorySnapshot,
  validPatchMapEngineHistorySelection,
  type PatchMapEngineHistoryCompanion,
  type PatchMapEngineHistorySnapshot,
} from './history-planning';
import {
  EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
  EMPTY_PATCH_MAP_TARGETS,
  createPatchMapDiagnosticFromError,
  createPatchMapOperationDiagnostic,
  createPatchMapRefusedDestroyTargetResult,
  createPatchMapRefusedPatchResult,
  createPatchMapSemanticMutationDiagnostic,
  freezePatchMapReconcileDiagnostics,
  freezePatchMapTargets,
} from './operation-outcomes';
import type {
  PatchMapDiagnosticCategory,
  PatchMapEngineDiagnostic,
  PatchMapLifecycle,
  PatchMapRevisionStamp,
} from './contracts/lifecycle';
import type {
  PatchMapEngineDestroyTargetResult,
  PatchMapEnginePatchResult,
} from './contracts/mutation';
import {
  incrementalOwnedRootIds,
  reconcileComponentSemantics,
  reconcileTextSemantics,
} from './reconcile-planning';
import type { PatchMapPublicationAuthority } from './publication-authority';
import type { PatchMapSceneStateAuthority } from './scene-state-authority';
import { ownedStructuralRootDelta } from './semantic-index';

export interface PatchMapDirectMutationPort {
  readonly requireSurface: (operation: 'patch' | 'destroyTarget') => PatchMapEngineSurface;
  readonly reducedMotion: () => boolean;
  readonly terminalSurfaceFailure: () => Error | null;
  readonly historySnapshot: () => PatchMapEngineHistorySnapshot;
  readonly historyCompanionForSelection: (
    selectionIds: readonly string[],
  ) => PatchMapEngineHistoryCompanion;
  readonly cancelActiveTransformer: () => void;
  readonly isSurfaceSceneCurrent: (
    surface: PatchMapEngineSurface,
    revisions: PatchMapRevisionStamp,
  ) => boolean;
  readonly isSurfaceMutationCurrent: (
    surface: PatchMapEngineSurface,
    revisions: PatchMapRevisionStamp,
  ) => boolean;
  readonly restoreAuthoritativeSurfaceScene: (
    surface: PatchMapEngineSurface,
    operation: 'patch' | 'destroyTarget',
  ) => void;
  readonly invalidateViewportContributors: () => void;
  readonly commitLifecycle: (
    lifecycle: Extract<PatchMapLifecycle, 'scene-ready' | 'ready-empty'>,
  ) => void;
  readonly emitDiagnostic: (diagnostic: PatchMapEngineDiagnostic) => void;
  readonly emitChange: (
    result: Extract<PatchMapEnginePatchResult, { readonly status: 'committed' }>,
  ) => void;
  readonly emitTargetDestroyed: (
    result: Extract<PatchMapEngineDestroyTargetResult, { readonly status: 'committed' }>,
  ) => void;
}

/**
 * Owns direct single-target semantic mutation publication. Scene, history,
 * selection, and revision state remain in their canonical authorities; every
 * read through this coordinator happens at the point where freshness matters.
 */
export class PatchMapDirectMutationCoordinator {
  public constructor(
    private readonly sceneState: PatchMapSceneStateAuthority,
    private readonly history: PatchMapSemanticHistory<
      readonly NormalizedPatchMapElement[],
      PatchMapEngineHistoryCompanion
    >,
    private readonly publication: PatchMapPublicationAuthority,
    private readonly emptyMaterialized: MaterializedPatchMapDataset,
    private readonly port: PatchMapDirectMutationPort,
  ) {}

  public patch(target: PatchMapSemanticTarget, patch: unknown): PatchMapEnginePatchResult {
    const surface = this.port.requireSurface('patch');
    const previousRevisions = this.revisionStamp();
    const mutation = applyPatchMapSemanticPatch(
      this.sceneState.materialized ?? this.emptyMaterialized,
      target,
      patch,
    );

    if (mutation.status === 'rejected') {
      const diagnostic = createPatchMapSemanticMutationDiagnostic(
        mutation.diagnostic,
        mutation.target,
        'patch',
        this.revisionStamp(),
      );
      const result = Object.freeze({
        status: 'rejected',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.sceneState.materialized?.semanticHash ?? null,
        applied: EMPTY_PATCH_MAP_TARGETS,
        missing: mutation.diagnostic.reason === 'missing-target' && mutation.target
          ? freezePatchMapTargets([mutation.target])
          : EMPTY_PATCH_MAP_TARGETS,
        unchanged: EMPTY_PATCH_MAP_TARGETS,
        diagnostic,
        mutationDiagnostic: mutation.diagnostic,
      } satisfies PatchMapEnginePatchResult);
      this.port.emitDiagnostic(diagnostic);
      return result;
    }

    if (mutation.status === 'unchanged') {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.sceneState.materialized?.semanticHash ?? null,
        applied: EMPTY_PATCH_MAP_TARGETS,
        missing: EMPTY_PATCH_MAP_TARGETS,
        unchanged: freezePatchMapTargets([mutation.target]),
      } satisfies PatchMapEnginePatchResult);
    }

    const currentDataset = this.sceneState.materialized?.dataset
      ?? this.emptyMaterialized.dataset;
    const incrementalRootIds = incrementalOwnedRootIds(
      currentDataset,
      mutation.candidate.dataset,
    );
    const componentSemantics = reconcileComponentSemantics(
      this.sceneState.componentSemantics,
      currentDataset,
      mutation.candidate.dataset,
      incrementalRootIds,
      null,
    );
    const textSemantics = reconcileTextSemantics(
      this.sceneState.textSemantics,
      currentDataset,
      mutation.candidate.dataset,
      incrementalRootIds,
      null,
    );
    const selectionBefore = this.sceneState.selectionIds;
    let preparedHistory: PatchMapHistoryPreparedRecord;
    try {
      preparedHistory = this.history.prepareOwnedChangedRecord({
        id: `patch:${this.publication.sceneRevision + 1}:${semanticTargetIdentity(mutation.target)}`,
        before: this.port.historySnapshot(),
        after: createPatchMapEngineHistorySnapshot(
          mutation.candidate.dataset,
          this.port.historyCompanionForSelection(selectionBefore),
        ),
      });
    } catch (error) {
      return this.refusedFromError(mutation.target, previousRevisions, error, 'patch');
    }
    const scenePlan = this.sceneState.prepareMutation({
      materialized: mutation.candidate,
      componentSemantics,
      textSemantics,
    });
    let reconcileBaseRevisions: PatchMapRevisionStamp;
    let reconcile: PatchMapSurfaceReconcileResult;
    try {
      this.port.cancelActiveTransformer();
      if (!this.port.isSurfaceSceneCurrent(surface, previousRevisions)) {
        this.history.cancelPrepared(preparedHistory);
        return this.refusedPatch(
          mutation.target,
          previousRevisions,
          'CONFLICT',
          'CONFLICT',
          true,
          EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
        );
      }
      reconcileBaseRevisions = this.revisionStamp();
      reconcile = surface.reconcile(mutation.candidate.dataset, {
        animateBarChanges:
          !this.port.reducedMotion() && mutation.target.kind === 'component',
        ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
      });
    } catch (error) {
      this.history.cancelPrepared(preparedHistory);
      const terminalFailure = this.port.terminalSurfaceFailure();
      if (terminalFailure !== null) throw terminalFailure;
      return this.refusedFromError(mutation.target, previousRevisions, error, 'patch');
    }

    if (
      !this.port.isSurfaceMutationCurrent(surface, reconcileBaseRevisions)
      || !this.history.canCommitPrepared(preparedHistory)
    ) {
      this.history.cancelPrepared(preparedHistory);
      this.port.restoreAuthoritativeSurfaceScene(surface, 'patch');
      return this.refusedPatch(
        mutation.target,
        previousRevisions,
        'CONFLICT',
        'CONFLICT',
        true,
        EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
      );
    }

    const reconcileDiagnostics = freezePatchMapReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      this.history.cancelPrepared(preparedHistory);
      return this.refusedPatch(
        mutation.target,
        previousRevisions,
        'CONFLICT',
        'CONFLICT',
        true,
        reconcileDiagnostics,
      );
    }

    this.sceneState.commit(scenePlan);
    this.port.invalidateViewportContributors();
    this.publication.advanceScene();
    this.port.commitLifecycle(
      mutation.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty',
    );
    const historyStatus = this.history.commitPrepared(preparedHistory);
    if (historyStatus === 'stale' || historyStatus === 'invalid' || historyStatus === 'cancelled') {
      throw new Error(`patch history preflight became ${historyStatus} after surface commit`);
    }
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      target: mutation.target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: mutation.candidate.semanticHash,
      applied: freezePatchMapTargets([mutation.target]),
      missing: EMPTY_PATCH_MAP_TARGETS,
      unchanged: EMPTY_PATCH_MAP_TARGETS,
      publication: 'pending',
      denseOperationCount: reconcile.operationCount,
      denseChanged: reconcile.denseChanged,
      reconcileDiagnostics,
    } satisfies PatchMapEnginePatchResult);
    this.port.emitChange(result);
    return result;
  }

  public destroyTarget(
    target: PatchMapSemanticTarget,
  ): PatchMapEngineDestroyTargetResult {
    const surface = this.port.requireSurface('destroyTarget');
    const previousRevisions = this.revisionStamp();
    const mutation = removePatchMapSemanticTarget(
      this.sceneState.materialized ?? this.emptyMaterialized,
      target,
    );

    if (mutation.status === 'rejected') {
      const diagnostic = createPatchMapSemanticMutationDiagnostic(
        mutation.diagnostic,
        mutation.target,
        'destroyTarget',
        this.revisionStamp(),
      );
      const result = Object.freeze({
        status: 'rejected',
        changed: false,
        target: mutation.target,
        previousRevisions,
        revisions: this.revisionStamp(),
        semanticHash: this.sceneState.materialized?.semanticHash ?? null,
        applied: EMPTY_PATCH_MAP_TARGETS,
        missing: mutation.diagnostic.reason === 'missing-target' && mutation.target
          ? freezePatchMapTargets([mutation.target])
          : EMPTY_PATCH_MAP_TARGETS,
        unchanged: EMPTY_PATCH_MAP_TARGETS,
        diagnostic,
        mutationDiagnostic: mutation.diagnostic,
      } satisfies PatchMapEngineDestroyTargetResult);
      this.port.emitDiagnostic(diagnostic);
      return result;
    }

    const currentDataset = this.sceneState.materialized?.dataset
      ?? this.emptyMaterialized.dataset;
    const structuralRootDelta = ownedStructuralRootDelta(
      currentDataset,
      mutation.candidate.dataset,
    );
    const componentSemantics = reconcileComponentSemantics(
      this.sceneState.componentSemantics,
      currentDataset,
      mutation.candidate.dataset,
      undefined,
      structuralRootDelta,
    );
    const textSemantics = reconcileTextSemantics(
      this.sceneState.textSemantics,
      currentDataset,
      mutation.candidate.dataset,
      undefined,
      structuralRootDelta,
    );
    const selectionBefore = this.sceneState.selectionIds;
    const selectionAfter = validPatchMapEngineHistorySelection(
      selectionBefore,
      mutation.candidate,
      false,
      structuralRootDelta !== null,
      this.sceneState,
    );
    let preparedHistory: PatchMapHistoryPreparedRecord;
    try {
      preparedHistory = this.history.prepareOwnedChangedRecord({
        id: `destroy:${this.publication.sceneRevision + 1}:${semanticTargetIdentity(mutation.target)}`,
        before: this.port.historySnapshot(),
        after: createPatchMapEngineHistorySnapshot(
          mutation.candidate.dataset,
          this.port.historyCompanionForSelection(selectionAfter),
        ),
      });
    } catch (error) {
      return this.refusedDestroyFromError(
        mutation.target,
        previousRevisions,
        error,
      );
    }
    const scenePlan = this.sceneState.prepareMutation({
      materialized: mutation.candidate,
      componentSemantics,
      textSemantics,
      selectionIds: selectionAfter,
    });
    let reconcileBaseRevisions: PatchMapRevisionStamp;
    let reconcile: PatchMapSurfaceReconcileResult;
    try {
      this.port.cancelActiveTransformer();
      if (!this.port.isSurfaceSceneCurrent(surface, previousRevisions)) {
        this.history.cancelPrepared(preparedHistory);
        return this.refusedDestroyTarget(
          mutation.target,
          previousRevisions,
          'CONFLICT',
          'CONFLICT',
          true,
          EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
        );
      }
      reconcileBaseRevisions = this.revisionStamp();
      reconcile = surface.reconcile(mutation.candidate.dataset, {
        animateBarChanges: false,
        ...(mutation.target.kind === 'element' ? { structuralSharing: true } : {}),
        ...(!sameStringArray(selectionBefore, selectionAfter)
          ? { selectionIds: selectionAfter }
          : {}),
      });
    } catch (error) {
      this.history.cancelPrepared(preparedHistory);
      const terminalFailure = this.port.terminalSurfaceFailure();
      if (terminalFailure !== null) throw terminalFailure;
      return this.refusedDestroyFromError(mutation.target, previousRevisions, error);
    }

    if (
      !this.port.isSurfaceMutationCurrent(surface, reconcileBaseRevisions)
      || !this.history.canCommitPrepared(preparedHistory)
    ) {
      this.history.cancelPrepared(preparedHistory);
      this.port.restoreAuthoritativeSurfaceScene(surface, 'destroyTarget');
      return this.refusedDestroyTarget(
        mutation.target,
        previousRevisions,
        'CONFLICT',
        'CONFLICT',
        true,
        EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
      );
    }

    const reconcileDiagnostics = freezePatchMapReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      this.history.cancelPrepared(preparedHistory);
      return this.refusedDestroyTarget(
        mutation.target,
        previousRevisions,
        'CONFLICT',
        'CONFLICT',
        true,
        reconcileDiagnostics,
      );
    }

    this.sceneState.commit(scenePlan);
    this.port.invalidateViewportContributors();
    this.publication.advanceScene();
    this.port.commitLifecycle(
      mutation.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty',
    );
    if (!sameStringArray(selectionBefore, selectionAfter)) {
      this.publication.advanceInteraction();
    }
    const historyStatus = this.history.commitPrepared(preparedHistory);
    if (historyStatus === 'stale' || historyStatus === 'invalid' || historyStatus === 'cancelled') {
      throw new Error(`destroy history preflight became ${historyStatus} after surface commit`);
    }
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      target: mutation.target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: mutation.candidate.semanticHash,
      applied: freezePatchMapTargets([mutation.target]),
      missing: EMPTY_PATCH_MAP_TARGETS,
      unchanged: EMPTY_PATCH_MAP_TARGETS,
      publication: 'pending',
      denseOperationCount: reconcile.operationCount,
      denseChanged: reconcile.denseChanged,
      reconcileDiagnostics,
    } satisfies PatchMapEngineDestroyTargetResult);
    this.port.emitTargetDestroyed(result);
    return result;
  }

  private revisionStamp(): PatchMapRevisionStamp {
    return this.publication.revisionStamp();
  }

  private diagnosticFrom(error: unknown, operation: 'patch' | 'destroyTarget'):
    PatchMapEngineDiagnostic {
    return createPatchMapDiagnosticFromError(error, operation, this.revisionStamp());
  }

  private refusedFromError(
    target: PatchMapSemanticTarget,
    previousRevisions: PatchMapRevisionStamp,
    error: unknown,
    operation: 'patch',
  ): Extract<PatchMapEnginePatchResult, { readonly status: 'refused' }> {
    const diagnostic = this.diagnosticFrom(error, operation);
    const result = Object.freeze({
      status: 'refused',
      changed: false,
      target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: this.sceneState.materialized?.semanticHash ?? null,
      applied: EMPTY_PATCH_MAP_TARGETS,
      missing: EMPTY_PATCH_MAP_TARGETS,
      unchanged: EMPTY_PATCH_MAP_TARGETS,
      diagnostic,
      reconcileDiagnostics: EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
    } satisfies PatchMapEnginePatchResult);
    this.port.emitDiagnostic(diagnostic);
    return result;
  }

  private refusedDestroyFromError(
    target: Extract<PatchMapSemanticTarget, { readonly kind: 'element' }>,
    previousRevisions: PatchMapRevisionStamp,
    error: unknown,
  ): Extract<PatchMapEngineDestroyTargetResult, { readonly status: 'refused' }> {
    const diagnostic = this.diagnosticFrom(error, 'destroyTarget');
    const result = Object.freeze({
      status: 'refused',
      changed: false,
      target,
      previousRevisions,
      revisions: this.revisionStamp(),
      semanticHash: this.sceneState.materialized?.semanticHash ?? null,
      applied: EMPTY_PATCH_MAP_TARGETS,
      missing: EMPTY_PATCH_MAP_TARGETS,
      unchanged: EMPTY_PATCH_MAP_TARGETS,
      diagnostic,
      reconcileDiagnostics: EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
    } satisfies PatchMapEngineDestroyTargetResult);
    this.port.emitDiagnostic(diagnostic);
    return result;
  }

  private refusedPatch(
    target: PatchMapSemanticTarget,
    previousRevisions: PatchMapRevisionStamp,
    code: string,
    category: PatchMapDiagnosticCategory,
    recoverable: boolean,
    reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
  ): Extract<PatchMapEnginePatchResult, { readonly status: 'refused' }> {
    const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
    const diagnostic = createPatchMapOperationDiagnostic(
      this.revisionStamp(),
      code,
      category,
      'patch',
      recoverable,
      datasetPath,
    );
    const result = createPatchMapRefusedPatchResult(
      target,
      previousRevisions,
      this.revisionStamp(),
      this.sceneState.materialized?.semanticHash ?? null,
      diagnostic,
      reconcileDiagnostics,
    );
    this.port.emitDiagnostic(diagnostic);
    return result;
  }

  private refusedDestroyTarget(
    target: Extract<PatchMapSemanticTarget, { readonly kind: 'element' }>,
    previousRevisions: PatchMapRevisionStamp,
    code: string,
    category: PatchMapDiagnosticCategory,
    recoverable: boolean,
    reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
  ): Extract<PatchMapEngineDestroyTargetResult, { readonly status: 'refused' }> {
    const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
    const diagnostic = createPatchMapOperationDiagnostic(
      this.revisionStamp(),
      code,
      category,
      'destroyTarget',
      recoverable,
      datasetPath,
    );
    const result = createPatchMapRefusedDestroyTargetResult(
      target,
      previousRevisions,
      this.revisionStamp(),
      this.sceneState.materialized?.semanticHash ?? null,
      diagnostic,
      reconcileDiagnostics,
    );
    this.port.emitDiagnostic(diagnostic);
    return result;
  }
}

function semanticTargetIdentity(target: PatchMapSemanticTarget): string {
  return target.kind === 'element'
    ? `element:${target.id.length}:${target.id}`
    : `component:${target.ownerId.length}:${target.ownerId}:${target.id.length}:${target.id}`;
}
