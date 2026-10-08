import type { PatchMapHistoryState } from '../history';
import type {
  PatchMapGestureCancelReason,
  PatchMapPointerGestureAuthority,
} from '../pointer-gesture';
import type { MaterializedPatchMapDataset } from '../semantic/dataset';
import {
  planPatchMapPreviewMutationTransaction,
  promotePatchMapPreviewMutationTransaction,
  type PatchMapMutationTransactionPlan,
} from '../semantic/transaction';
import type {
  PatchMapSelectionSetOperation,
} from '../query-selection';
import {
  PatchMapTransformerGestureAuthority,
  type PatchMapTransformerGestureProbe,
  type PatchMapTransformerHandle,
  type PatchMapTransformerInputFamily,
} from '../selection-transformer';
import {
  planPatchMapTransformerEdit,
  type PatchMapTransformerEditRequest,
} from '../selection-transformer/edit';
import { assertTransformerHandleKind, nonEmptyValue } from './input-contracts';
import {
  EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
  freezePatchMapReconcileDiagnostics,
} from './operation-outcomes';
import { incrementalFlatRootIds } from './reconcile-planning';
import type {
  PatchMapEngineSurface,
  PatchMapSurfaceReconcileResult,
} from './contracts';
import type {
  PatchMapEngineTransformerCancelResult,
  PatchMapEngineTransformerCompletionResult,
  PatchMapEngineTransformerPreviewResult,
  PatchMapEngineTransformerSessionBeginInput,
  PatchMapEngineTransformerSessionProbe,
} from './contracts/history-transformer';
import type {
  PatchMapEngineTransactionResult,
} from './contracts/mutation';
import type {
  PatchMapRevisionStamp,
} from './contracts/lifecycle';
import { PatchMapTransformerEditAuthority } from './transformer-edit-authority';

export interface PatchMapTransformerSessionPort {
  readonly requireSurface: (operation: string) => PatchMapEngineSurface;
  readonly requirePointerGestures: (operation: string) => PatchMapPointerGestureAuthority;
  readonly materialized: () => MaterializedPatchMapDataset | null;
  readonly selectionIds: () => readonly string[];
  readonly historyState: () => PatchMapHistoryState;
  readonly clearTooltipForDrag: () => void;
  readonly applySelectionForTransformerStart: (
    operation: PatchMapSelectionSetOperation,
  ) => void;
  readonly replaceSelectionForRollback: (selectionIds: readonly string[]) => void;
  readonly revisionStamp: () => PatchMapRevisionStamp;
  readonly applyPlannedTransaction: (input: Readonly<{
    readonly surface: PatchMapEngineSurface;
    readonly plan: PatchMapMutationTransactionPlan;
    readonly previousRevisions: PatchMapRevisionStamp;
    readonly previousHistory: PatchMapHistoryState;
    readonly beforeChangeEvent: () => void;
  }>) => PatchMapEngineTransactionResult;
  readonly advanceInteraction: () => void;
  readonly operationFailure: (
    code: 'NOT_READY' | 'UNSUPPORTED_RUNTIME' | 'CONFLICT',
    operation: string,
    recoverable: boolean,
  ) => Error;
  readonly sameSelection: (
    left: readonly string[],
    right: readonly string[],
  ) => boolean;
}

/**
 * Owns the complete transformer session from pointer capture through preview
 * settlement. The facade supplies atomic scene mutation and publication ports,
 * but no other unit writes transformer edit or gesture state.
 */
export class PatchMapTransformerSessionCoordinator {
  private readonly gestures = new PatchMapTransformerGestureAuthority();
  private readonly edits = new PatchMapTransformerEditAuthority();
  private readonly publicSessions = new WeakMap<object, number>();
  private nextPublicPointerId = 1_000_000_000;

  public constructor(private readonly port: PatchMapTransformerSessionPort) {}

  public beginHandleGesture(
    pointerId: number,
    handle: PatchMapTransformerHandle,
  ): PatchMapTransformerGestureProbe {
    this.port.requireSurface('beginTransformerHandleGesture');
    this.port.clearTooltipForDrag();
    this.gestures.begin(pointerId, handle);
    try {
      this.port.requirePointerGestures('beginTransformerHandleGesture')
        .beginOwnedGesture(
          handle === 'rotate' ? 'rotate' : handle === 'frame' ? 'move' : 'resize',
          pointerId,
        );
    } catch (error) {
      this.gestures.cancel(pointerId);
      throw error;
    }
    return this.gestures.probe();
  }

  public routeInput(
    pointerId: number,
    family: PatchMapTransformerInputFamily,
  ): ReturnType<PatchMapTransformerGestureAuthority['route']> {
    this.port.requireSurface('routeTransformerInput');
    return this.gestures.route(pointerId, family);
  }

  public ownsPointer(pointerId: number): boolean {
    return this.gestures.owns(pointerId);
  }

  public completeHandleGesture(
    pointerId: number,
  ): NonNullable<PatchMapEngineTransformerCompletionResult['gesture']> {
    this.port.requireSurface('completeTransformerHandleGesture');
    const completed = this.gestures.complete(pointerId);
    const pointer = completed
      ? this.port.requirePointerGestures('completeTransformerHandleGesture')
          .terminateOwnedGesture('pointer-up-outside')
      : null;
    return Object.freeze({
      completed,
      pointer,
      probe: this.gestures.probe(),
    });
  }

  public cancelHandleGesture(
    pointerId: number,
    reason: PatchMapGestureCancelReason = 'pointer-cancel',
  ): NonNullable<PatchMapEngineTransformerCancelResult['gesture']> {
    this.port.requireSurface('cancelTransformerHandleGesture');
    const cancelled = this.gestures.cancel(pointerId);
    const pointer = cancelled
      ? this.port.requirePointerGestures('cancelTransformerHandleGesture')
          .cancelOwnedGesture(reason)
      : null;
    return Object.freeze({
      cancelled,
      pointer,
      probe: this.gestures.probe(),
    });
  }

  public gestureProbe(): PatchMapTransformerGestureProbe {
    return this.gestures.probe();
  }

  public interruptGestures(): void {
    this.gestures.interrupt();
  }

  public beginEdit(
    input: PatchMapEngineTransformerSessionBeginInput,
  ): PatchMapEngineTransformerSessionProbe {
    this.port.requireSurface('beginTransformerEdit');
    this.edits.assertIdle();
    const materialized = this.port.materialized();
    if (materialized === null) {
      throw this.port.operationFailure('NOT_READY', 'beginTransformerEdit', true);
    }
    assertTransformerHandleKind(input.handle, input.kind);
    const actionId = nonEmptyValue(input.actionId, 'transformer actionId');
    const selectionIds = Object.freeze([
      ...(input.selectionIds ?? this.port.selectionIds()),
    ]);
    this.beginHandleGesture(input.pointerId, input.handle);
    try {
      if (input.selectionIds !== undefined) {
        this.port.applySelectionForTransformerStart({
          op: 'replace',
          ids: selectionIds,
          source: 'programmatic',
        });
      }
      this.edits.begin({
        pointerId: input.pointerId,
        actionId,
        kind: input.kind,
        handle: input.handle,
        selectionIds,
        startMaterialized: materialized,
        startSelectionIds: Object.freeze([...this.port.selectionIds()]),
        historyDepthBefore: this.port.historyState().undoDepth,
      });
    } catch (error) {
      if (this.gestures.owns(input.pointerId)) {
        this.cancelHandleGesture(input.pointerId, 'selection-change');
      }
      throw error;
    }
    return this.editProbe();
  }

  public beginPublicEdit(
    input: Omit<PatchMapEngineTransformerSessionBeginInput, 'pointerId'>,
  ): object {
    const pointerId = this.nextPublicPointerId;
    this.nextPublicPointerId = pointerId === Number.MAX_SAFE_INTEGER
      ? 1_000_000_000
      : pointerId + 1;
    const token = Object.freeze({});
    this.beginEdit({ ...input, pointerId });
    this.publicSessions.set(token, pointerId);
    return token;
  }

  public previewEdit(
    pointerId: number,
    request: PatchMapTransformerEditRequest,
  ): PatchMapEngineTransformerPreviewResult {
    const surface = this.port.requireSurface('previewTransformerEdit');
    const active = this.edits.require(pointerId, 'previewTransformerEdit');
    if (request.kind !== active.kind) {
      throw new TypeError('transformer preview kind must match the active session');
    }
    if (!this.port.sameSelection(request.selectionIds, active.selectionIds)) {
      throw new TypeError('transformer preview selection must match the active session');
    }
    const plan = planPatchMapTransformerEdit(active.startMaterialized.dataset, request);
    if (plan.status === 'rejected') {
      return Object.freeze({
        status: 'rejected',
        changed: false,
        plan,
        reconcileDiagnostics: EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
        probe: this.editProbe(),
      });
    }
    let previewMaterialized = active.startMaterialized;
    let mutationPlan: PatchMapMutationTransactionPlan | null = null;
    if (plan.status === 'planned') {
      const preview = planPatchMapPreviewMutationTransaction(active.startMaterialized, {
        strict: true,
        recordHistory: false,
        operations: plan.operations,
      });
      if (preview.status !== 'planned') {
        throw new Error(`transformer preview transaction became ${preview.status}`);
      }
      mutationPlan = preview;
      previewMaterialized = preview.candidate;
    }
    const incrementalRootIds = plan.status === 'planned'
      ? incrementalFlatRootIds(
          active.startMaterialized.dataset,
          previewMaterialized.dataset,
          plan.operations,
        )
      : undefined;
    const transient = incrementalRootIds === undefined
      ? null
      : surface.previewIncrementalRoots?.(
          previewMaterialized.dataset,
          incrementalRootIds,
        ) ?? null;
    const reconcile: PatchMapSurfaceReconcileResult = transient === null
      ? surface.reconcile(previewMaterialized.dataset, {
          animateBarChanges: false,
          ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
        })
      : Object.freeze({
          status: 'committed',
          operationCount: plan.operations.length,
          denseChanged: false,
          diagnostics: EMPTY_PATCH_MAP_RECONCILE_DIAGNOSTICS,
        });
    const diagnostics = freezePatchMapReconcileDiagnostics(reconcile.diagnostics);
    if (reconcile.status === 'refused') {
      return Object.freeze({
        status: 'refused',
        changed: false,
        plan,
        reconcileDiagnostics: diagnostics,
        probe: this.editProbe(),
      });
    }

    if (this.edits.current() !== active) {
      this.restoreAuthoritativeAfterStalePreview(surface, transient !== null);
      throw this.port.operationFailure('CONFLICT', 'previewTransformerEdit', true);
    }

    this.port.advanceInteraction();
    this.edits.recordPreview(active, {
      latestPlan: plan,
      latestMutationPlan: mutationPlan,
      previewMaterialized,
      transientPreview: transient !== null,
    });
    return Object.freeze({
      status: plan.status === 'planned' ? 'previewed' : 'unchanged',
      changed: plan.changed,
      plan,
      reconcileDiagnostics: diagnostics,
      probe: this.editProbe(),
    });
  }

  public previewPublicEdit(
    token: object,
    request: PatchMapTransformerEditRequest,
  ): PatchMapEngineTransformerPreviewResult {
    return this.previewEdit(
      this.requirePublicPointer(token, 'previewPublicTransformerEdit'),
      request,
    );
  }

  public completeEdit(
    pointerId: number,
  ): PatchMapEngineTransformerCompletionResult {
    const completion = this.edits.prepareCompletion(pointerId);
    if (completion.status === 'stale') {
      return Object.freeze({
        status: 'stale',
        changed: false,
        mutationCount: 0,
        historyDepthDelta: 0,
        transaction: null,
        gesture: null,
        probe: this.editProbe(),
      });
    }
    const active = completion.session;
    if (completion.status === 'unchanged') {
      const gesture = this.completeHandleGesture(pointerId);
      this.edits.settle(active, 'unchanged');
      return Object.freeze({
        status: 'unchanged',
        changed: false,
        mutationCount: 0,
        historyDepthDelta: 0,
        transaction: null,
        gesture,
        probe: this.editProbe(),
      });
    }

    const surface = this.port.requireSurface('completeTransformerEdit');
    const previewPlan = active.latestMutationPlan;
    if (previewPlan === null || previewPlan.status !== 'planned') {
      throw new Error('planned transformer completion lost its preview transaction');
    }
    const previousRevisions = this.port.revisionStamp();
    const previousHistory = this.port.historyState();
    const promoted = promotePatchMapPreviewMutationTransaction(
      active.startMaterialized,
      Object.freeze({
        ...previewPlan,
        actionId: active.actionId,
        recordHistory: true,
      }),
    );
    let settledBeforeChangeEvent = false;
    const transaction = this.port.applyPlannedTransaction({
      surface,
      plan: promoted,
      previousRevisions,
      previousHistory,
      beforeChangeEvent: () => {
        this.edits.settle(active, 'committed');
        settledBeforeChangeEvent = true;
      },
    });
    if (transaction.status !== 'committed') {
      if (this.edits.current() !== active) {
        return Object.freeze({
          status: 'refused',
          changed: false,
          mutationCount: 0,
          historyDepthDelta: 0,
          transaction,
          gesture: null,
          probe: this.editProbe(),
        });
      }
      this.restorePreview();
      const gesture = this.cancelHandleGesture(pointerId, 'redraw');
      this.edits.settle(active, 'cancelled');
      return Object.freeze({
        status: 'refused',
        changed: false,
        mutationCount: 0,
        historyDepthDelta: 0,
        transaction,
        gesture: Object.freeze({
          completed: gesture.cancelled,
          pointer: gesture.pointer,
          probe: gesture.probe,
        }),
        probe: this.editProbe(),
      });
    }
    if (!settledBeforeChangeEvent) {
      throw new Error('committed transformer transaction did not settle before publication');
    }
    const depthDelta = this.port.historyState().undoDepth - active.historyDepthBefore;
    const gesture = this.completeHandleGesture(pointerId);
    return Object.freeze({
      status: 'committed',
      changed: true,
      mutationCount: 1,
      historyDepthDelta: depthDelta === 1 ? 1 : 0,
      transaction,
      gesture,
      probe: this.editProbe(),
    });
  }

  public completePublicEdit(token: object): PatchMapEngineTransformerCompletionResult {
    const result = this.completeEdit(
      this.requirePublicPointer(token, 'completePublicTransformerEdit'),
    );
    this.publicSessions.delete(token);
    return result;
  }

  public cancelEdit(
    pointerId: number,
    reason: PatchMapGestureCancelReason,
  ): PatchMapEngineTransformerCancelResult {
    const active = this.edits.current();
    if (active === null || active.pointerId !== pointerId) {
      return Object.freeze({
        status: 'stale',
        cancelled: false,
        reason,
        historyDepthDelta: 0,
        gesture: null,
        probe: this.editProbe(),
      });
    }
    const gesture = this.cancelActive(reason, true);
    if (gesture === null) throw new Error('active transformer cancellation was lost');
    return Object.freeze({
      status: 'cancelled',
      cancelled: true,
      reason,
      historyDepthDelta: 0,
      gesture,
      probe: this.editProbe(),
    });
  }

  public cancelPublicEdit(token: object): PatchMapEngineTransformerCancelResult {
    const result = this.cancelEdit(
      this.requirePublicPointer(token, 'cancelPublicTransformerEdit'),
      'escape',
    );
    this.publicSessions.delete(token);
    return result;
  }

  public requirePublicPointer(token: object, operation: string): number {
    const pointerId = this.publicSessions.get(token);
    const activeEdit = this.edits.current();
    if (
      pointerId === undefined ||
      !this.ownsPointer(pointerId) ||
      activeEdit?.pointerId !== pointerId
    ) {
      this.publicSessions.delete(token);
      throw this.port.operationFailure('CONFLICT', operation, true);
    }
    return pointerId;
  }

  public editProbe(): PatchMapEngineTransformerSessionProbe {
    return this.edits.probe();
  }

  public cancelActive(
    reason: PatchMapGestureCancelReason,
    restoreSurface: boolean,
  ): NonNullable<PatchMapEngineTransformerCancelResult['gesture']> | null {
    const active = this.edits.current();
    if (active === null) return null;
    if (restoreSurface) this.restorePreview();
    const gesture = this.cancelHandleGesture(active.pointerId, reason);
    this.edits.settle(active, 'cancelled');
    return gesture;
  }

  public destroy(): void {
    this.gestures.destroy();
  }

  private restorePreview(): void {
    const active = this.edits.current();
    if (active === null || active.previewMaterialized === null) return;
    const surface = this.port.requireSurface('restoreTransformerPreview');
    if (active.transientPreview && surface.clearIncrementalPreview !== undefined) {
      surface.clearIncrementalPreview();
      if (!this.port.sameSelection(this.port.selectionIds(), active.startSelectionIds)) {
        surface.select(active.startSelectionIds);
        this.port.replaceSelectionForRollback(active.startSelectionIds);
      }
      this.port.advanceInteraction();
      return;
    }
    const incrementalRootIds = active.latestPlan?.status === 'planned'
      ? incrementalFlatRootIds(
          active.previewMaterialized.dataset,
          active.startMaterialized.dataset,
          active.latestPlan.operations,
        )
      : undefined;
    const reconcile = surface.reconcile(active.startMaterialized.dataset, {
      animateBarChanges: false,
      ...(incrementalRootIds === undefined ? {} : { incrementalRootIds }),
      ...(!this.port.sameSelection(this.port.selectionIds(), active.startSelectionIds)
        ? { selectionIds: active.startSelectionIds }
        : {}),
    });
    if (reconcile.status === 'refused') {
      throw this.port.operationFailure('CONFLICT', 'restoreTransformerPreview', false);
    }
    if (!this.port.sameSelection(this.port.selectionIds(), active.startSelectionIds)) {
      this.port.replaceSelectionForRollback(active.startSelectionIds);
    }
    this.port.advanceInteraction();
  }

  private restoreAuthoritativeAfterStalePreview(
    surface: PatchMapEngineSurface,
    transientPreview: boolean,
  ): void {
    if (transientPreview && surface.clearIncrementalPreview !== undefined) {
      surface.clearIncrementalPreview();
      return;
    }
    const authoritative = this.port.materialized();
    if (authoritative === null) {
      throw this.port.operationFailure(
        'NOT_READY',
        'restoreTransformerPreview',
        false,
      );
    }
    const reconcile = surface.reconcile(authoritative.dataset, {
      animateBarChanges: false,
      selectionIds: this.port.selectionIds(),
    });
    if (reconcile.status === 'refused') {
      throw this.port.operationFailure('CONFLICT', 'restoreTransformerPreview', false);
    }
  }
}
