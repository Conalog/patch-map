import type { PatchMapComponentVisualTarget } from '../core/contracts';
import type {
  PatchMapSemanticHistory,
  PatchMapHistoryPreparedRecord,
  PatchMapHistoryState,
} from '../history';
import type { PatchMapReconcileDiagnostic } from '../semantic/reconcile';
import type {
  MaterializedPatchMapDataset,
  NormalizedPatchMapElement,
} from '../semantic/dataset';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationTransactionDiagnostic,
  PatchMapMutationTransactionPlan,
} from '../semantic/transaction';
import { sameStringArray } from '../shared/string-array-values';
import type { PatchMapHostInteractionAuthority } from '../host-interaction';
import type {
  PatchMapEngineSurface,
  PatchMapSurfaceReconcileResult,
} from './contracts';
import {
  createPatchMapEngineHistorySnapshot,
  patchMapEngineHistoryTransactionSelection,
  type PatchMapEngineHistoryCompanion,
  type PatchMapEngineHistorySnapshot,
} from './history-planning';
import {
  EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
  createPatchMapRefusedTransactionResult,
  createPatchMapRejectedTransactionResult,
  createPatchMapTransactionDiagnostic,
  freezePatchMapCommittedTransactionResult,
  freezePatchMapMutationTargets,
  freezePatchMapReconcileDiagnostics,
  freezePatchMapTransactionHistory,
} from './operation-outcomes';
import type {
  PatchMapDiagnosticCategory,
  PatchMapEngineDiagnostic,
  PatchMapLifecycle,
  PatchMapRevisionStamp,
} from './contracts/lifecycle';
import type {
  PatchMapEngineTransactionPerformanceProbe,
  PatchMapEngineTransactionResult,
} from './contracts/mutation';
import type { PatchMapPublicationAuthority } from './publication-authority';
import type { PatchMapSurfaceMutationGuard } from './surface-mutation-guard';
import {
  componentOrderOwners,
  directAnimatedBarTargets,
  directBarHeightUpdatesFor,
  incrementalBarHeightRootIds,
  incrementalFlatRootIds,
  incrementalOwnedRootIds,
  operationsMayChangeElementStructure,
  operationsOnlyUpdateBarSize,
  operationsOnlyUpdateElementGeometry,
  reconcileComponentSemantics,
  reconcileTextSemantics,
} from './reconcile-planning';
import type { PatchMapSceneStateAuthority } from './scene-state-authority';
import {
  ownedStructuralRootDelta,
  reconcileDirectBarHeightComponentSemantics,
  reconcilePlannedBarHeightComponentSemantics,
} from './semantic-index';

export interface PatchMapTransactionCommitPort {
  readonly reducedMotion: () => boolean;
  readonly terminalSurfaceFailure: () => Error | null;
  readonly historySnapshot: () => PatchMapEngineHistorySnapshot;
  readonly planHistoryCompanion: (
    value: PatchMapMutationJsonValue | undefined,
    fallbackSelectionIds: readonly string[],
    materialized: MaterializedPatchMapDataset,
    fallbackMode: PatchMapEngineHistoryCompanion['mode'],
    stableIdentity: boolean,
    structuralIdentity: boolean,
  ) => PatchMapEngineHistoryCompanion;
  readonly commitSceneMetadata: (
    hostCompanion: PatchMapMutationJsonValue | null,
  ) => void;
  readonly commitLifecycle: (
    lifecycle: Extract<PatchMapLifecycle, 'scene-ready' | 'ready-empty'>,
  ) => void;
  readonly restoreAuthoritativeSurfaceScene: (
    surface: PatchMapEngineSurface,
    operation: string,
  ) => void;
  readonly revisionStamp: () => PatchMapRevisionStamp;
  readonly diagnosticFrom: (error: unknown, operation: string) => PatchMapEngineDiagnostic;
  readonly operationDiagnostic: (
    code: string,
    category: PatchMapDiagnosticCategory,
    operation: string,
    recoverable: boolean,
    datasetPath?: string,
  ) => PatchMapEngineDiagnostic;
  readonly emitDiagnostic: (diagnostic: PatchMapEngineDiagnostic) => void;
  readonly emitChange: (
    result: Extract<PatchMapEngineTransactionResult, { readonly status: 'committed' }>,
  ) => void;
  readonly now: () => number;
}

/**
 * Owns the one planned-transaction publication path. Candidate planning stays
 * above this boundary; surface reconciliation must succeed and remain fresh
 * before any Engine authority is committed.
 */
export class PatchMapTransactionCommitCoordinator {
  private lastPerformance: PatchMapEngineTransactionPerformanceProbe | null = null;

  public constructor(
    private readonly sceneState: PatchMapSceneStateAuthority,
    private readonly history: PatchMapSemanticHistory<
      readonly NormalizedPatchMapElement[],
      PatchMapEngineHistoryCompanion
    >,
    private readonly hostInteractions: PatchMapHostInteractionAuthority,
    private readonly publication: PatchMapPublicationAuthority,
    private readonly surfaceMutationGuard: PatchMapSurfaceMutationGuard,
    private readonly port: PatchMapTransactionCommitPort,
  ) {}

  public commit(
    surface: PatchMapEngineSurface,
    plan: PatchMapMutationTransactionPlan,
    operation: 'transact' | 'bulkPatch',
    previousRevisions: PatchMapRevisionStamp,
    previousHistory: PatchMapHistoryState,
    transactionPlanMs: number,
    beforeSurfaceReconcile?: () => void,
    beforeChangeEvent?: () => void,
  ): PatchMapEngineTransactionResult {
    const applyStarted = this.port.now();
    if (plan.status === 'rejected') {
      return this.rejectPlannedTransaction(
        plan,
        operation,
        previousRevisions,
        previousHistory,
      );
    }

    const actionId = plan.actionId ?? null;
    if (plan.conflictPolicy !== 'reject') {
      const diagnostic = this.port.operationDiagnostic(
        'UNSUPPORTED_RUNTIME',
        'UNSUPPORTED_RUNTIME',
        operation,
        true,
      );
      return this.publishRejected(
        actionId,
        previousRevisions,
        diagnostic,
        undefined,
        previousHistory,
      );
    }
    if (!plan.changed) {
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        actionId,
        previousRevisions,
        revisions: this.port.revisionStamp(),
        semanticHash: this.sceneState.materialized?.semanticHash ?? null,
        applied: freezePatchMapMutationTargets(plan.applied),
        missing: freezePatchMapMutationTargets(plan.missing),
        unchanged: freezePatchMapMutationTargets(plan.unchanged),
        history: freezePatchMapTransactionHistory(
          false,
          null,
          previousHistory,
          previousHistory,
        ),
      } satisfies PatchMapEngineTransactionResult);
    }
    const currentDataset = this.sceneState.materialized?.dataset ?? EMPTY_DATASET;
    const plannedBarHeightUpdates = plan.directBarHeightUpdates;
    const plannedTextUpdates = plan.directTextUpdates;
    const plannedElementAngleUpdates = plan.directElementAngleUpdates;
    const incrementalRootIds = plannedBarHeightUpdates !== undefined
      ? incrementalBarHeightRootIds(
          currentDataset,
          plan.candidate.dataset,
          plannedBarHeightUpdates,
        )
      : plannedTextUpdates !== undefined
        ? incrementalOwnedRootIds(currentDataset, plan.candidate.dataset)
        : plannedElementAngleUpdates !== undefined
          ? Object.freeze(plannedElementAngleUpdates.map(({ id }) => id))
          : incrementalFlatRootIds(currentDataset, plan.candidate.dataset, plan.operations);
    const directSemanticProjection =
      plannedBarHeightUpdates !== undefined ||
      plannedTextUpdates !== undefined ||
      plannedElementAngleUpdates !== undefined;
    const elementGeometryOnly = operationsOnlyUpdateElementGeometry(plan.operations);
    const structuralSharing = !directSemanticProjection &&
      operationsMayChangeElementStructure(plan.operations);
    const structuralRootDelta = structuralSharing
      ? ownedStructuralRootDelta(currentDataset, plan.candidate.dataset)
      : null;
    const directBarComponentSemantics =
      plannedElementAngleUpdates !== undefined || elementGeometryOnly
        ? null
        : plannedBarHeightUpdates === undefined
          ? reconcileDirectBarHeightComponentSemantics(
              this.sceneState.componentSemantics,
              plan.candidate.dataset,
              plan.operations,
            )
          : reconcilePlannedBarHeightComponentSemantics(
              this.sceneState.componentSemantics,
              plan.candidate.dataset,
              plannedBarHeightUpdates,
            );
    const componentSemantics =
      plannedTextUpdates !== undefined ||
      plannedElementAngleUpdates !== undefined ||
      elementGeometryOnly
        ? this.sceneState.componentSemantics
        : directBarComponentSemantics ?? reconcileComponentSemantics(
            this.sceneState.componentSemantics,
            currentDataset,
            plan.candidate.dataset,
            incrementalRootIds,
            structuralRootDelta,
          );
    const textSemantics =
      plannedElementAngleUpdates !== undefined || elementGeometryOnly
        ? this.sceneState.textSemantics
        : plannedTextUpdates === undefined &&
            (
              directBarComponentSemantics !== null ||
              operationsOnlyUpdateBarSize(plan.operations, componentSemantics)
            )
          ? this.sceneState.textSemantics
          : reconcileTextSemantics(
              this.sceneState.textSemantics,
              currentDataset,
              plan.candidate.dataset,
              incrementalRootIds,
              structuralRootDelta,
            );
    const selectionBefore = this.sceneState.selectionIds;
    const modeBefore = this.hostInteractions.modeProbe().activeState;
    const requestedSelectionAfter = plan.selectionIds ??
      (!directSemanticProjection
        ? patchMapEngineHistoryTransactionSelection(selectionBefore, plan.operations)
        : selectionBefore);
    let companionAfter: PatchMapEngineHistoryCompanion;
    try {
      companionAfter = this.port.planHistoryCompanion(
        plan.history,
        requestedSelectionAfter,
        plan.candidate,
        modeBefore,
        incrementalRootIds !== undefined,
        structuralRootDelta !== null,
      );
    } catch (error) {
      return this.publishRejected(
        actionId,
        previousRevisions,
        this.port.diagnosticFrom(error, operation),
        undefined,
        previousHistory,
      );
    }

    const selectionAfter = companionAfter.selectionIds;
    const commandId = actionId ?? `transaction:${this.publication.sceneRevision + 1}`;
    let preparedHistory: PatchMapHistoryPreparedRecord | null = null;
    try {
      if (plan.recordHistory !== false) {
        preparedHistory = this.history.prepareOwnedChangedRecord({
          id: commandId,
          before: this.port.historySnapshot(),
          after: createPatchMapEngineHistorySnapshot(plan.candidate.dataset, companionAfter),
        });
      }
    } catch (error) {
      return this.publishRejected(
        actionId,
        previousRevisions,
        this.port.diagnosticFrom(error, operation),
        undefined,
        previousHistory,
      );
    }

    const animatedBarTargets = plannedElementAngleUpdates !== undefined
      ? EMPTY_COMPONENT_VISUAL_TARGETS
      : plan.animatedBarTargets !== undefined
        ? plan.animatedBarTargets
        : plannedBarHeightUpdates !== undefined
          ? plannedBarHeightUpdates
          : directAnimatedBarTargets(plan.operations, componentSemantics);
    const directBarHeightUpdates = plannedElementAngleUpdates !== undefined
      ? undefined
      : plannedBarHeightUpdates ?? directBarHeightUpdatesFor(plan.operations, componentSemantics);
    const allowedComponentOrderOwners = !directSemanticProjection
      ? componentOrderOwners(plan.operations)
      : EMPTY_STRING_IDS;
    const scenePlan = this.sceneState.prepareMutation({
      materialized: plan.candidate,
      componentSemantics,
      textSemantics,
      selectionIds: selectionAfter,
    });
    let reconcileStarted = 0;
    let reconcileCompleted = 0;
    let reconcileBaseRevisions = previousRevisions;
    let reconcile: PatchMapSurfaceReconcileResult;
    if (!this.surfaceMutationGuard.mutationCurrent(surface, previousRevisions)) {
      if (preparedHistory !== null) this.history.cancelPrepared(preparedHistory);
      const diagnostic = this.port.operationDiagnostic(
        'CONFLICT',
        'CONFLICT',
        operation,
        true,
      );
      return this.publishRefused(
        actionId,
        previousRevisions,
        diagnostic,
        this.history.state(),
        EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
      );
    }
    try {
      beforeSurfaceReconcile?.();
      if (!this.surfaceMutationGuard.sceneCurrent(surface, previousRevisions)) {
        if (preparedHistory !== null) this.history.cancelPrepared(preparedHistory);
        const diagnostic = this.port.operationDiagnostic(
          'CONFLICT',
          'CONFLICT',
          operation,
          true,
        );
        return this.publishRefused(
          actionId,
          previousRevisions,
          diagnostic,
          this.history.state(),
          EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
        );
      }
      reconcileBaseRevisions = this.port.revisionStamp();
      reconcileStarted = this.port.now();
      reconcile = surface.reconcile(plan.candidate.dataset, {
        animateBarChanges: !this.port.reducedMotion() && animatedBarTargets.length > 0,
        animatedBarTargets,
        allowedComponentOrderOwners,
        ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
        ...(structuralSharing ? { structuralSharing: true } : {}),
        ...(directBarHeightUpdates === undefined ? {} : { directBarHeightUpdates }),
        ...(plannedTextUpdates === undefined
          ? {}
          : { directTextUpdates: plannedTextUpdates }),
        ...(plannedElementAngleUpdates === undefined
          ? {}
          : { directElementAngleUpdates: plannedElementAngleUpdates }),
        ...(plan.allowedElementOrderIds === undefined
          ? {}
          : { allowedElementOrderIds: plan.allowedElementOrderIds }),
        ...(!sameStringArray(selectionBefore, selectionAfter)
          ? { selectionIds: selectionAfter }
          : {}),
      });
    } catch (error) {
      if (preparedHistory !== null) this.history.cancelPrepared(preparedHistory);
      const terminalFailure = this.port.terminalSurfaceFailure();
      if (terminalFailure !== null) throw terminalFailure;
      return this.publishRefused(
        actionId,
        previousRevisions,
        this.port.diagnosticFrom(error, operation),
        previousHistory,
        EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
      );
    }
    reconcileCompleted = this.port.now();

    if (
      !this.surfaceMutationGuard.mutationCurrent(surface, reconcileBaseRevisions) ||
      (preparedHistory !== null && !this.history.canCommitPrepared(preparedHistory))
    ) {
      if (preparedHistory !== null) this.history.cancelPrepared(preparedHistory);
      this.port.restoreAuthoritativeSurfaceScene(surface, operation);
      const diagnostic = this.port.operationDiagnostic(
        'CONFLICT',
        'CONFLICT',
        operation,
        true,
      );
      return this.publishRefused(
        actionId,
        previousRevisions,
        diagnostic,
        this.history.state(),
        EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
      );
    }

    const reconcileDiagnostics = freezePatchMapReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      if (preparedHistory !== null) this.history.cancelPrepared(preparedHistory);
      const datasetPath = reconcileDiagnostics.find((entry) => entry.severity === 'error')?.path;
      const diagnostic = this.port.operationDiagnostic(
        'CONFLICT',
        'CONFLICT',
        operation,
        true,
        datasetPath,
      );
      return this.publishRefused(
        actionId,
        previousRevisions,
        diagnostic,
        previousHistory,
        reconcileDiagnostics,
      );
    }

    this.sceneState.commit(scenePlan);
    this.port.commitSceneMetadata(companionAfter.hostCompanion);
    this.hostInteractions.applyModeOperation({ op: 'replace', state: companionAfter.mode });
    this.publication.advanceScene();
    this.port.commitLifecycle(
      plan.candidate.rootIds.length > 0 ? 'scene-ready' : 'ready-empty',
    );
    if (
      !sameStringArray(selectionBefore, selectionAfter) ||
      modeBefore !== companionAfter.mode ||
      plan.history !== undefined
    ) {
      this.publication.advanceInteraction();
    }
    let historyRecorded = false;
    if (preparedHistory !== null) {
      const historyStatus = this.history.commitPrepared(preparedHistory);
      if (
        historyStatus === 'stale' ||
        historyStatus === 'invalid' ||
        historyStatus === 'cancelled'
      ) {
        throw new Error(`${operation} history preflight became ${historyStatus} after surface commit`);
      }
      historyRecorded = historyStatus === 'recorded';
    } else {
      this.history.closeActionGroup();
    }
    const currentHistory = this.history.state();
    const result = freezePatchMapCommittedTransactionResult(plan.candidate, {
      status: 'committed',
      changed: true,
      actionId,
      previousRevisions,
      revisions: this.port.revisionStamp(),
      applied: freezePatchMapMutationTargets(plan.applied),
      missing: freezePatchMapMutationTargets(plan.missing),
      unchanged: freezePatchMapMutationTargets(plan.unchanged),
      history: freezePatchMapTransactionHistory(
        historyRecorded,
        historyRecorded ? commandId : null,
        previousHistory,
        currentHistory,
      ),
      publication: 'pending',
      denseOperationCount: reconcile.operationCount,
      denseChanged: reconcile.denseChanged,
      reconcileDiagnostics,
    });
    const completed = this.port.now();
    this.lastPerformance = Object.freeze({
      transactionPlanMs,
      preReconcileMs: reconcileStarted - applyStarted,
      reconcileMs: reconcileCompleted - reconcileStarted,
      postReconcileMs: completed - reconcileCompleted,
      totalMs: transactionPlanMs + (completed - applyStarted),
      surfaceTimings: reconcile.timings ?? null,
    });
    beforeChangeEvent?.();
    this.port.emitChange(result);
    return result;
  }

  public performanceProbe(): PatchMapEngineTransactionPerformanceProbe | null {
    return this.lastPerformance;
  }

  public reset(): void {
    this.lastPerformance = null;
  }

  private rejectPlannedTransaction(
    plan: Extract<PatchMapMutationTransactionPlan, { readonly status: 'rejected' }>,
    operation: string,
    previousRevisions: PatchMapRevisionStamp,
    previousHistory: PatchMapHistoryState,
  ): PatchMapEngineTransactionResult {
    const diagnostic = createPatchMapTransactionDiagnostic(
      plan.diagnostic,
      operation,
      this.port.revisionStamp(),
    );
    return this.publishRejected(
      plan.actionId ?? null,
      previousRevisions,
      diagnostic,
      plan.diagnostic,
      previousHistory,
    );
  }

  private publishRejected(
    actionId: string | null,
    previousRevisions: PatchMapRevisionStamp,
    diagnostic: PatchMapEngineDiagnostic,
    transactionDiagnostic: PatchMapMutationTransactionDiagnostic | undefined,
    history: PatchMapHistoryState,
  ): Extract<PatchMapEngineTransactionResult, { readonly status: 'rejected' }> {
    const result = createPatchMapRejectedTransactionResult(
      actionId,
      previousRevisions,
      this.port.revisionStamp(),
      this.sceneState.materialized?.semanticHash ?? null,
      diagnostic,
      transactionDiagnostic,
      history,
    );
    this.port.emitDiagnostic(diagnostic);
    return result;
  }

  private publishRefused(
    actionId: string | null,
    previousRevisions: PatchMapRevisionStamp,
    diagnostic: PatchMapEngineDiagnostic,
    history: PatchMapHistoryState,
    reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[],
  ): Extract<PatchMapEngineTransactionResult, { readonly status: 'refused' }> {
    const result = createPatchMapRefusedTransactionResult(
      actionId,
      previousRevisions,
      this.port.revisionStamp(),
      this.sceneState.materialized?.semanticHash ?? null,
      diagnostic,
      history,
      reconcileDiagnostics,
    );
    this.port.emitDiagnostic(diagnostic);
    return result;
  }

}

const EMPTY_DATASET = Object.freeze([] as NormalizedPatchMapElement[]);
const EMPTY_COMPONENT_VISUAL_TARGETS = Object.freeze(
  [] as PatchMapComponentVisualTarget[],
);
const EMPTY_STRING_IDS = Object.freeze([] as string[]);
