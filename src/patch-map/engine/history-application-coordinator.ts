import type { PatchMapHostInteractionAuthority } from '../host-interaction';
import { patchMapOwnsKeyboardInput } from '../host-interaction';
import type {
  PatchMapHistoryDirection,
  PatchMapSemanticHistory,
} from '../history';
import {
  materializePatchMapDataset,
  ownedPatchMapMaterialization,
  type MaterializedPatchMapDataset,
  type NormalizedPatchMapElement,
} from '../semantic/dataset';
import type { PatchMapReconcileDiagnostic } from '../semantic/reconcile';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
} from '../semantic/transaction';
import { sameStringArray } from '../shared/string-array-values';
import type { PatchMapEngineSurface } from './contracts';
import {
  createPatchMapEngineHistoryCompanion,
  createPatchMapEngineHistorySnapshot,
  planPatchMapEngineHistoryCompanion,
  resolvePatchMapEngineHistoryTransitionMode,
  resolvePatchMapEngineHistoryTransitionSelection,
  type PatchMapEngineHistoryCompanion,
  type PatchMapEngineHistorySnapshot,
  type PatchMapEngineHistoryTransition,
} from './history-planning';
import { resolvePatchMapHistoryShortcut } from './input-contracts';
import {
  EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
  freezePatchMapReconcileDiagnostics,
} from './operation-outcomes';
import type {
  PatchMapDiagnosticCategory,
  PatchMapEngineDiagnostic,
  PatchMapLifecycle,
  PatchMapRevisionStamp,
} from './contracts/lifecycle';
import type {
  PatchMapEngineHistoryClearResult,
  PatchMapEngineHistoryCompanionState,
  PatchMapEngineHistoryRestoredEvent,
  PatchMapEngineHistoryResult,
  PatchMapHistoryShortcutInput,
  PatchMapHistoryShortcutResult,
} from './contracts/history-transformer';
import {
  historyReconcileOrderScope,
  incrementalOwnedRootIds,
  reconcileComponentSemantics,
  reconcileTextSemantics,
} from './reconcile-planning';
import type { PatchMapPublicationAuthority } from './publication-authority';
import type { PatchMapSceneStateAuthority } from './scene-state-authority';
import { ownedStructuralRootDelta } from './semantic-index';
import type { PatchMapTransformerSessionCoordinator } from './transformer-session-coordinator';

interface PatchMapHistoryApplicationPort {
  readonly requireSurface: (operation: string) => PatchMapEngineSurface;
  readonly terminalSurfaceFailure: () => Error | null;
  readonly setLifecycle: (
    lifecycle: Extract<PatchMapLifecycle, 'scene-ready' | 'ready-empty'>,
  ) => void;
  readonly isSurfaceMutationCurrent: (
    surface: PatchMapEngineSurface,
    revisions: PatchMapRevisionStamp,
  ) => boolean;
  readonly restoreAuthoritativeSurfaceScene: (
    surface: PatchMapEngineSurface,
    operation: string,
  ) => void;
  readonly syncSelectionVisualPolicy: () => void;
  readonly invalidateViewportContributors: () => void;
  readonly diagnosticFrom: (
    error: unknown,
    operation: string,
  ) => PatchMapEngineDiagnostic;
  readonly operationDiagnostic: (
    code: string,
    category: PatchMapDiagnosticCategory,
    operation: string,
    recoverable: boolean,
    datasetPath?: string,
  ) => PatchMapEngineDiagnostic;
  readonly revisionStamp: () => PatchMapRevisionStamp;
  readonly emitDiagnostic: (diagnostic: PatchMapEngineDiagnostic) => void;
  readonly emitSemanticRestored: (event: PatchMapEngineHistoryRestoredEvent) => void;
  readonly emitSelectionReconciled: (event: PatchMapEngineHistoryRestoredEvent) => void;
  readonly emitHistoryResult: (
    direction: PatchMapHistoryDirection,
    result: Extract<PatchMapEngineHistoryResult, { readonly status: 'committed' }>,
  ) => void;
  readonly emitHistoryCleared: (result: PatchMapEngineHistoryClearResult) => void;
}

/**
 * Applies semantic history transitions to the aggregate surface and Engine
 * authorities. PatchMapSemanticHistory remains the sole stack/cursor owner.
 */
export class PatchMapHistoryApplicationCoordinator {
  private hostCompanion: PatchMapMutationJsonValue | null = null;

  public constructor(
    private readonly history: PatchMapSemanticHistory<
      readonly NormalizedPatchMapElement[],
      PatchMapEngineHistoryCompanion
    >,
    private readonly sceneState: PatchMapSceneStateAuthority,
    private readonly publication: PatchMapPublicationAuthority,
    private readonly hostInteractions: PatchMapHostInteractionAuthority,
    private readonly transformerSessions: PatchMapTransformerSessionCoordinator,
    private readonly emptyMaterialized: MaterializedPatchMapDataset,
    private readonly port: PatchMapHistoryApplicationPort,
  ) {}

  public companionState(): PatchMapEngineHistoryCompanionState {
    this.port.requireSurface('historyCompanionState');
    return this.companionForSelection(this.sceneState.selectionIds);
  }

  public setCompanion(
    value: PatchMapMutationJsonValue,
  ): PatchMapEngineHistoryCompanionState {
    const surface = this.port.requireSurface('setHistoryCompanion');
    const detached = detachPatchMapMutationJsonValue(value, '$.historyCompanion');
    const previousSelection = this.sceneState.selectionIds;
    const previousMode = this.hostInteractions.modeProbe().activeState;
    const next = this.planCompanion(
      detached,
      previousSelection,
      this.sceneState.materialized ?? this.emptyMaterialized,
      previousMode,
    );
    surface.select(next.selectionIds);
    this.sceneState.replaceSelection(next.selectionIds);
    this.port.syncSelectionVisualPolicy();
    this.hostInteractions.applyModeOperation({ op: 'replace', state: next.mode });
    this.hostCompanion = next.hostCompanion;
    if (
      !sameStringArray(previousSelection, next.selectionIds) ||
      previousMode !== next.mode ||
      next.hostCompanion !== null
    ) {
      this.publication.advanceInteraction();
    }
    return this.companionForSelection(this.sceneState.selectionIds);
  }

  public handleShortcut(
    input: PatchMapHistoryShortcutInput,
  ): PatchMapHistoryShortcutResult {
    this.port.requireSurface('handleHistoryShortcut');
    const action = resolvePatchMapHistoryShortcut(input);
    if (action === null || !patchMapOwnsKeyboardInput(input.pathKind)) {
      return Object.freeze({
        action,
        handled: false,
        preventDefault: false,
        result: null,
      });
    }
    const result = action === 'undo' ? this.undo() : this.redo();
    return Object.freeze({
      action,
      handled: true,
      preventDefault: true,
      result,
    });
  }

  public undo(): PatchMapEngineHistoryResult {
    this.transformerSessions.cancelActive('redraw', true);
    return this.apply('undo');
  }

  public redo(): PatchMapEngineHistoryResult {
    this.transformerSessions.cancelActive('redraw', true);
    return this.apply('redo');
  }

  public snapshot(): PatchMapEngineHistorySnapshot {
    return createPatchMapEngineHistorySnapshot(
      this.sceneState.materialized?.dataset ?? Object.freeze([]),
      this.companionForSelection(this.sceneState.selectionIds),
    );
  }

  public companionForSelection(
    selectionIds: readonly string[],
  ): PatchMapEngineHistoryCompanion {
    return createPatchMapEngineHistoryCompanion(
      selectionIds,
      this.hostInteractions.modeProbe().activeState,
      this.hostCompanion,
    );
  }

  public planCompanion(
    value: PatchMapMutationJsonValue | undefined,
    fallbackSelectionIds: readonly string[],
    materialized: MaterializedPatchMapDataset,
    fallbackMode: PatchMapEngineHistoryCompanion['mode'],
    stableIdentity = false,
    structuralIdentity = false,
  ): PatchMapEngineHistoryCompanion {
    return planPatchMapEngineHistoryCompanion(
      value,
      fallbackSelectionIds,
      materialized,
      stableIdentity,
      structuralIdentity,
      fallbackMode,
      this.hostCompanion,
      this.sceneState,
    );
  }

  public replaceHostCompanion(value: PatchMapMutationJsonValue | null): void {
    this.hostCompanion = value;
  }

  public resetHostCompanion(): void {
    this.hostCompanion = null;
  }

  public clear(
    reason: PatchMapEngineHistoryClearResult['reason'],
    emitEvenIfUnchanged = false,
  ): PatchMapEngineHistoryClearResult {
    const changed = this.history.clear();
    this.publication.clearHistoryPublications();
    const result = Object.freeze({
      changed,
      reason,
      history: this.history.state(),
    });
    if (changed || emitEvenIfUnchanged) this.port.emitHistoryCleared(result);
    return result;
  }

  private apply(direction: PatchMapHistoryDirection): PatchMapEngineHistoryResult {
    const surface = this.port.requireSurface(direction);
    const previousRevisions = this.port.revisionStamp();
    let failure: PatchMapEngineDiagnostic | null = null;
    let reconcileDiagnostics: readonly PatchMapReconcileDiagnostic[] =
      EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS;
    const modeBefore = this.hostInteractions.modeProbe().activeState;
    const hostCompanionBefore = this.hostCompanion;
    const currentMaterialized = this.sceneState.materialized ?? this.emptyMaterialized;
    const apply = (transition: PatchMapEngineHistoryTransition): boolean => {
      let materialized: MaterializedPatchMapDataset;
      const selectionBefore = this.sceneState.selectionIds;
      try {
        materialized = ownedPatchMapMaterialization(transition.snapshot.dataset) ??
          materializePatchMapDataset(transition.snapshot.dataset);
        const incrementalRootIds = incrementalOwnedRootIds(
          currentMaterialized.dataset,
          materialized.dataset,
        );
        const orderScope = historyReconcileOrderScope(
          transition.command.before.dataset,
          transition.command.after.dataset,
        );
        const structuralRootDelta =
          incrementalRootIds === undefined &&
          orderScope.allowedElementOrderIds.length > 0
            ? ownedStructuralRootDelta(
                currentMaterialized.dataset,
                materialized.dataset,
              )
            : null;
        const componentSemantics = reconcileComponentSemantics(
          this.sceneState.componentSemantics,
          currentMaterialized.dataset,
          materialized.dataset,
          incrementalRootIds,
          structuralRootDelta,
        );
        const textSemantics = reconcileTextSemantics(
          this.sceneState.textSemantics,
          currentMaterialized.dataset,
          materialized.dataset,
          incrementalRootIds,
          structuralRootDelta,
        );
        const companion = transition.snapshot.companion;
        const mode = resolvePatchMapEngineHistoryTransitionMode(transition);
        const selection = resolvePatchMapEngineHistoryTransitionSelection(
          transition,
          materialized,
          incrementalRootIds !== undefined,
          structuralRootDelta !== null,
          this.sceneState,
        );
        const scenePlan = this.sceneState.prepareMutation({
          materialized,
          componentSemantics,
          textSemantics,
          selectionIds: selection,
        });
        const reconcile = surface.reconcile(materialized.dataset, {
          animateBarChanges: false,
          ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
          ...(orderScope.allowedElementOrderIds.length === 0
            ? {}
            : { structuralSharing: true }),
          ...(orderScope.allowedElementOrderIds.length === 0
            ? {}
            : { allowedElementOrderIds: orderScope.allowedElementOrderIds }),
          ...(orderScope.allowedComponentOrderOwners.length === 0
            ? {}
            : { allowedComponentOrderOwners: orderScope.allowedComponentOrderOwners }),
          ...(!sameStringArray(selectionBefore, selection)
            ? { selectionIds: selection }
            : {}),
        });
        if (!this.port.isSurfaceMutationCurrent(surface, previousRevisions)) {
          this.port.restoreAuthoritativeSurfaceScene(surface, direction);
          failure = this.port.operationDiagnostic(
            'CONFLICT',
            'CONFLICT',
            direction,
            true,
          );
          return false;
        }
        reconcileDiagnostics = freezePatchMapReconcileDiagnostics(reconcile.diagnostics);
        if (reconcile.status === 'refused') {
          const datasetPath = reconcileDiagnostics.find(
            (entry) => entry.severity === 'error',
          )?.path;
          failure = this.port.operationDiagnostic(
            'CONFLICT',
            'CONFLICT',
            direction,
            true,
            datasetPath,
          );
          return false;
        }
        this.hostInteractions.applyModeOperation({ op: 'replace', state: mode });
        this.hostCompanion = companion?.hostCompanion ?? null;
        this.sceneState.commit(scenePlan);
      } catch (error) {
        const terminalFailure = this.port.terminalSurfaceFailure();
        if (terminalFailure !== null) throw terminalFailure;
        failure = this.port.diagnosticFrom(error, direction);
        return false;
      }
      this.port.invalidateViewportContributors();
      this.publication.advanceScene();
      this.port.setLifecycle(
        materialized.rootIds.length > 0 ? 'scene-ready' : 'ready-empty',
      );
      if (
        !sameStringArray(selectionBefore, this.sceneState.selectionIds) ||
        modeBefore !== this.hostInteractions.modeProbe().activeState ||
        hostCompanionBefore !== this.hostCompanion
      ) {
        this.publication.advanceInteraction();
      }
      return true;
    };

    const transition = direction === 'undo'
      ? this.history.undo(apply)
      : this.history.redo(apply);
    if (transition === null && failure !== null) {
      const result = Object.freeze({
        status: 'refused',
        changed: false,
        direction,
        previousRevisions,
        revisions: this.port.revisionStamp(),
        sceneRevision: this.publication.sceneRevision,
        semanticHash: this.sceneState.materialized?.semanticHash ?? null,
        diagnostic: failure,
        reconcileDiagnostics,
        history: this.history.state(),
      } satisfies PatchMapEngineHistoryResult);
      this.port.emitDiagnostic(failure);
      return result;
    }
    if (transition === null) {
      return Object.freeze({
        status: 'unavailable',
        changed: false,
        direction,
        previousRevisions,
        revisions: this.port.revisionStamp(),
        sceneRevision: this.publication.sceneRevision,
        semanticHash: this.sceneState.materialized?.semanticHash ?? null,
        history: this.history.state(),
      } satisfies PatchMapEngineHistoryResult);
    }

    const materialized = this.sceneState.materialized;
    if (materialized === null) {
      throw new Error('history transition lost semantic authority');
    }
    const result = Object.freeze({
      status: 'committed',
      changed: true,
      direction,
      actionId: transition.command.id,
      recordCount: transition.command.recordCount,
      previousRevisions,
      revisions: this.port.revisionStamp(),
      sceneRevision: this.publication.sceneRevision,
      semanticHash: materialized.semanticHash,
      publication: 'pending',
      history: this.history.state(),
    } satisfies PatchMapEngineHistoryResult);
    const restored = Object.freeze({
      direction,
      sceneRevision: this.publication.sceneRevision,
      selectionIds: Object.freeze([...this.sceneState.selectionIds]),
      mode: this.hostInteractions.modeProbe().activeState,
      publication: 'pending',
    } satisfies PatchMapEngineHistoryRestoredEvent);
    this.port.emitSemanticRestored(restored);
    this.port.emitSelectionReconciled(restored);
    this.port.emitHistoryResult(direction, result);
    this.publication.queueHistoryPublication(direction);
    return result;
  }
}
