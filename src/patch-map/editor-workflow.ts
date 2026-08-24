import type { MaterializedPatchMapDataset } from './semantic/dataset';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationOperation,
  PatchMapMutationTransactionRequest,
} from './semantic/transaction';

import { normalizeAction } from './editor-workflow/action-normalization';
import {
  PATCH_MAP_EDITOR_WORKFLOW_REVISION,
  type PatchMapEditorWorkflowAction,
  type PatchMapEditorWorkflowDiagnosticCode,
  type PatchMapEditorWorkflowFacts,
  type PatchMapEditorWorkflowMode,
  type PatchMapEditorWorkflowPlan,
  type PatchMapEditorWorkflowProbe,
} from './editor-workflow/contracts';
import {
  change,
  findElement,
  gridCoordinate,
  gridElement,
  mergeElement,
  relationOwnersForTargets,
  relationsElement,
  removeElement,
  resizeGridCells,
  textElement,
  uniqueStrings,
} from './editor-workflow/dataset-atoms';
import { sameStringArray } from './shared/string-array-values';

export {
  PATCH_MAP_EDITOR_MUTATION_KINDS,
  PATCH_MAP_EDITOR_WORKFLOW_REVISION,
} from './editor-workflow/contracts';
export type {
  PatchMapEditorMutationKind,
  PatchMapEditorWorkflowAction,
  PatchMapEditorWorkflowDiagnostic,
  PatchMapEditorWorkflowDiagnosticCode,
  PatchMapEditorWorkflowFacts,
  PatchMapEditorWorkflowMode,
  PatchMapEditorWorkflowPlan,
  PatchMapEditorWorkflowProbe,
} from './editor-workflow/contracts';
export { planPatchMapEditorMatrixMutation } from './editor-workflow/matrix-mutation';

interface GridSession {
  readonly target: string;
  readonly linkedCellIds: ReadonlySet<string>;
  readonly inactiveCellsVisible: boolean;
  readonly lastActionId: string | null;
}

interface RelationSession {
  readonly target: string;
  readonly lastActionId: string | null;
}

interface TextSession {
  readonly target: string;
  readonly originalText: string;
  readonly awaitingResolve: boolean;
}

interface DeleteSession {
  readonly requestedIds: readonly string[];
  readonly plannedIds: readonly string[];
  readonly confirmed: boolean;
  readonly cascadeTargets: readonly string[];
}

interface WorkflowState {
  readonly mode: PatchMapEditorWorkflowMode;
  readonly grid: GridSession | null;
  readonly relation: RelationSession | null;
  readonly text: TextSession | null;
  readonly deletion: DeleteSession | null;
  readonly textAppliedCount: number;
  readonly textUnchangedCount: number;
  readonly replacementRecoveryCount: number;
}

interface PendingPlan {
  readonly next: WorkflowState;
}

const EMPTY_FACTS: PatchMapEditorWorkflowFacts = Object.freeze({});
const INITIAL_STATE: WorkflowState = Object.freeze({
  mode: 'select',
  grid: null,
  relation: null,
  text: null,
  deletion: null,
  textAppliedCount: 0,
  textUnchangedCount: 0,
  replacementRecoveryCount: 0,
});

/**
 * Engine-local editor orchestration.
 *
 * It owns only logical edit sessions and host-companion facts. Semantic data
 * still commits through the Engine transaction/history/reconcile authority;
 * Pixi remains one root interaction surface with no entity listeners.
 */
export class PatchMapEditorWorkflowAuthority {
  private state: WorkflowState = INITIAL_STATE;
  private readonly pending = new WeakMap<PatchMapEditorWorkflowPlan, PendingPlan>();
  private destroyed = false;

  public plan(
    materialized: MaterializedPatchMapDataset,
    input: PatchMapEditorWorkflowAction,
  ): PatchMapEditorWorkflowPlan {
    this.assertAlive();
    const action = normalizeAction(input);
    switch (action.type) {
      case 'select-targets':
        return this.planSelection(materialized, action);
      case 'enter-grid-edit':
        return this.planEnterGrid(materialized, action);
      case 'reveal-inactive-cells':
        return this.planRevealGrid(action);
      case 'resize-grid':
        return this.planResizeGrid(materialized, action);
      case 'set-grid-cell-active':
        return this.planGridCell(materialized, action);
      case 'exit-grid-edit':
        return this.planExitGrid(materialized, action);
      case 'enter-relation-edit':
        return this.planEnterRelation(materialized, action);
      case 'add-relation-link':
      case 'remove-relation-link':
        return this.planRelationLink(materialized, action);
      case 'exit-relation-edit':
        return this.planExitRelation(materialized, action);
      case 'open-text-editor':
        return this.planOpenText(materialized, action);
      case 'resolve-editor-target-by-id':
        return this.planResolveText(materialized, action);
      case 'commit-text-edit':
        return this.planCommitText(materialized, action);
      case 'cancel-text-edit':
        return this.planCancelText(action);
      case 'request-delete-plan':
        return this.planDeleteRequest(materialized, action);
      case 'apply-host-cascade-confirmation':
        return this.planDeleteConfirmation(action);
      case 'delete-transaction':
        return this.planDeleteTransaction(materialized, action);
    }
  }

  public commit(plan: PatchMapEditorWorkflowPlan): boolean {
    const pending = this.pending.get(plan);
    if (pending === undefined || this.destroyed) return false;
    this.pending.delete(plan);
    this.state = pending.next;
    return true;
  }

  public discard(plan: PatchMapEditorWorkflowPlan): boolean {
    return this.pending.delete(plan);
  }

  public onSceneReplaced(): void {
    if (this.destroyed) return;
    const text = this.state.text;
    if (text === null) {
      this.state = Object.freeze({
        ...this.state,
        mode: 'select',
        grid: null,
        relation: null,
        deletion: null,
      });
      return;
    }
    this.state = Object.freeze({
      ...this.state,
      mode: 'text-edit',
      grid: null,
      relation: null,
      deletion: null,
      text: Object.freeze({ ...text, awaitingResolve: true }),
      replacementRecoveryCount: this.state.replacementRecoveryCount + 1,
    });
  }

  public probe(): PatchMapEditorWorkflowProbe {
    const activeTargetId =
      this.state.grid?.target ??
      this.state.relation?.target ??
      this.state.text?.target ??
      null;
    return Object.freeze({
      schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
      mode: this.state.mode,
      activeTargetId,
      activeSessionCount: activeTargetId === null ? 0 : 1,
      inactiveCellsVisible: this.state.grid?.inactiveCellsVisible ?? false,
      pendingDeleteCount: this.state.deletion?.plannedIds.length ?? 0,
      textAppliedCount: this.state.textAppliedCount,
      textUnchangedCount: this.state.textUnchangedCount,
      replacementRecoveryCount: this.state.replacementRecoveryCount,
      destroyed: this.destroyed,
    });
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.state = INITIAL_STATE;
    return true;
  }

  private planSelection(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'select-targets' }>,
  ): PatchMapEditorWorkflowPlan {
    const missing = action.targets.find((id) => findElement(materialized.dataset, id) === null);
    if (missing !== undefined) {
      return rejected(action, 'MISSING_TARGET', ['targets'], `selection target ${missing} is missing`);
    }
    const next = Object.freeze({
      ...this.state,
      mode: 'select' as const,
      grid: null,
      relation: null,
      text: null,
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({ selectedIds: Object.freeze([...action.targets]) }),
      next,
      { selectionIds: action.targets },
    );
  }

  private planEnterGrid(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'enter-grid-edit' }>,
  ): PatchMapEditorWorkflowPlan {
    if (gridElement(materialized, action.target) === null) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'grid edit target is missing');
    }
    const next = Object.freeze({
      ...this.state,
      mode: 'grid-edit' as const,
      grid: Object.freeze({
        target: action.target,
        linkedCellIds: new Set(action.linkedCellIds ?? []),
        inactiveCellsVisible: false,
        lastActionId: null,
      }),
      relation: null,
      text: null,
      deletion: null,
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({ mode: 'grid-edit', targetId: action.target }),
      next,
      { selectionIds: [action.target] },
    );
  }

  private planRevealGrid(
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'reveal-inactive-cells' }>,
  ): PatchMapEditorWorkflowPlan {
    const session = this.state.grid;
    if (session === null || session.target !== action.target) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'grid edit session is not active');
    }
    if (session.inactiveCellsVisible) {
      return this.unchangedPlan(
        action,
        Object.freeze({ inactiveCellsVisible: true }),
        this.state,
      );
    }
    const next = Object.freeze({
      ...this.state,
      grid: Object.freeze({ ...session, inactiveCellsVisible: true }),
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({ inactiveCellsVisible: true }),
      next,
    );
  }

  private planResizeGrid(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'resize-grid' }>,
  ): PatchMapEditorWorkflowPlan {
    const session = this.state.grid;
    const grid = gridElement(materialized, action.target);
    if (session === null || session.target !== action.target || grid === null) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'grid edit session is not active');
    }
    const cells = resizeGridCells(grid.cells, action.rows, action.columns);
    const transaction = workflowTransaction(
      action.actionId,
      [
        mergeElement(action.target, [
          change(['cells'], cells),
          change(['gap'], Object.freeze({ x: action.gapX, y: action.gapY })),
        ]),
      ],
      [action.target],
      'grid-edit',
      Object.freeze({ targetId: action.target }),
    );
    const next = Object.freeze({
      ...this.state,
      grid: Object.freeze({ ...session, lastActionId: action.actionId }),
    });
    return this.pendingPlan(
      action,
      transaction,
      Object.freeze({
        rows: action.rows,
        columns: action.columns,
        gapX: action.gapX,
        gapY: action.gapY,
      }),
      next,
    );
  }

  private planGridCell(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'set-grid-cell-active' }>,
  ): PatchMapEditorWorkflowPlan {
    const session = this.state.grid;
    if (session === null) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'grid edit session is not active');
    }
    const grid = gridElement(materialized, session.target);
    if (grid === null) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'grid edit target is missing');
    }
    const coordinate = gridCoordinate(session.target, action.target);
    if (coordinate === null) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'grid cell target is invalid');
    }
    const [row, column] = coordinate;
    const current = grid.cells[row]?.[column];
    if (current === undefined) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'grid cell target is outside the grid');
    }
    if (!action.active && session.linkedCellIds.has(action.target)) {
      return rejected(action, 'CONFLICT', ['target'], 'linked grid cell cannot be disabled');
    }
    const nextValue = action.active ? (current === 0 ? 1 : current) : 0;
    if (nextValue === current) {
      return this.unchangedPlan(
        action,
        Object.freeze({
          appliedCells: Object.freeze([]),
          rejectedCells: Object.freeze([]),
        }),
        this.state,
      );
    }
    const cells = grid.cells.map((values, rowIndex) =>
      Object.freeze(values.map((value, columnIndex) =>
        rowIndex === row && columnIndex === column ? nextValue : value)),
    );
    const transaction = workflowTransaction(
      action.actionId,
      [mergeElement(session.target, [change(['cells'], Object.freeze(cells))])],
      [session.target],
      'grid-edit',
      Object.freeze({ targetId: session.target }),
    );
    const next = Object.freeze({
      ...this.state,
      grid: Object.freeze({ ...session, lastActionId: action.actionId }),
    });
    return this.pendingPlan(
      action,
      transaction,
      Object.freeze({
        appliedCells: Object.freeze([action.target]),
        rejectedCells: Object.freeze([]),
      }),
      next,
    );
  }

  private planExitGrid(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'exit-grid-edit' }>,
  ): PatchMapEditorWorkflowPlan {
    const session = this.state.grid;
    if (
      session === null ||
      session.target !== action.target ||
      gridElement(materialized, action.target) === null
    ) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'grid edit session is not active');
    }
    const next = Object.freeze({
      ...this.state,
      mode: 'select' as const,
      grid: null,
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({ mode: 'select', selectedIds: Object.freeze([action.target]) }),
      next,
      { selectionIds: [action.target], closeHistoryGroup: true },
    );
  }

  private planEnterRelation(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'enter-relation-edit' }>,
  ): PatchMapEditorWorkflowPlan {
    if (relationsElement(materialized, action.target) === null) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'relation edit target is missing');
    }
    const next = Object.freeze({
      ...this.state,
      mode: 'relation-edit' as const,
      grid: null,
      relation: Object.freeze({ target: action.target, lastActionId: null }),
      text: null,
      deletion: null,
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({ mode: 'relation-edit', targetId: action.target }),
      next,
      { selectionIds: [action.target] },
    );
  }

  private planRelationLink(
    materialized: MaterializedPatchMapDataset,
    action: Extract<
      PatchMapEditorWorkflowAction,
      { readonly type: 'add-relation-link' | 'remove-relation-link' }
    >,
  ): PatchMapEditorWorkflowPlan {
    const session = this.state.relation;
    const relation = relationsElement(materialized, action.relationId);
    if (session === null || session.target !== action.relationId || relation === null) {
      return rejected(action, 'MISSING_TARGET', ['relationId'], 'relation edit session is not active');
    }
    if (
      findElement(materialized.dataset, action.source) === null ||
      findElement(materialized.dataset, action.target) === null
    ) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'relation endpoint is missing');
    }
    const index = relation.links.findIndex(
      (link) => link.source === action.source && link.target === action.target,
    );
    if (action.type === 'add-relation-link' && index >= 0) {
      return rejected(action, 'CONFLICT', ['target'], 'directed relation link already exists');
    }
    if (action.type === 'remove-relation-link' && index < 0) {
      return this.unchangedPlan(
        action,
        Object.freeze({ changedLinkCount: 0 }),
        this.state,
      );
    }
    const links = action.type === 'add-relation-link'
      ? Object.freeze([
          ...relation.links.map((link) => Object.freeze({ ...link })),
          Object.freeze({ source: action.source, target: action.target }),
        ])
      : Object.freeze(
          relation.links
            .filter((_link, linkIndex) => linkIndex !== index)
            .map((link) => Object.freeze({ ...link })),
        );
    const transaction = workflowTransaction(
      action.actionId,
      [mergeElement(action.relationId, [change(['links'], links)])],
      [action.relationId],
      'relation-edit',
      Object.freeze({ targetId: action.relationId }),
    );
    const next = Object.freeze({
      ...this.state,
      relation: Object.freeze({ ...session, lastActionId: action.actionId }),
    });
    return this.pendingPlan(
      action,
      transaction,
      Object.freeze({ changedLinkCount: 1, links }),
      next,
    );
  }

  private planExitRelation(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'exit-relation-edit' }>,
  ): PatchMapEditorWorkflowPlan {
    const session = this.state.relation;
    const relation = relationsElement(materialized, action.relationId);
    if (session === null || session.target !== action.relationId || relation === null) {
      return rejected(action, 'MISSING_TARGET', ['relationId'], 'relation edit session is not active');
    }
    const removeEmpty = relation.links.length === 0;
    const transaction = removeEmpty
      ? workflowTransaction(
          session.lastActionId ?? `relation-edit:${action.relationId}`,
          [removeElement(action.relationId)],
          [],
          'select',
          Object.freeze({ emptyRelationRemoved: true }),
        )
      : null;
    const next = Object.freeze({
      ...this.state,
      mode: 'select' as const,
      relation: null,
    });
    return this.pendingPlan(
      action,
      transaction,
      Object.freeze({
        mode: 'select',
        emptyRelationRemoved: removeEmpty,
      }),
      next,
      {
        selectionIds: removeEmpty ? [] : [action.relationId],
        closeHistoryGroup: true,
      },
    );
  }

  private planOpenText(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'open-text-editor' }>,
  ): PatchMapEditorWorkflowPlan {
    const text = textElement(materialized, action.target);
    if (text === null) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'text edit target is missing');
    }
    const next = Object.freeze({
      ...this.state,
      mode: 'text-edit' as const,
      grid: null,
      relation: null,
      text: Object.freeze({
        target: action.target,
        originalText: text.text,
        awaitingResolve: false,
      }),
      deletion: null,
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({
        mode: 'text-edit',
        targetId: action.target,
        sourceText: text.text,
      }),
      next,
      { selectionIds: [action.target] },
    );
  }

  private planResolveText(
    materialized: MaterializedPatchMapDataset,
    action: Extract<
      PatchMapEditorWorkflowAction,
      { readonly type: 'resolve-editor-target-by-id' }
    >,
  ): PatchMapEditorWorkflowPlan {
    const session = this.state.text;
    const text = textElement(materialized, action.target);
    if (session === null || session.target !== action.target || text === null) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'replacement text target is missing');
    }
    const next = Object.freeze({
      ...this.state,
      mode: 'text-edit' as const,
      text: Object.freeze({ ...session, awaitingResolve: false }),
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({ resolvedTargetId: action.target }),
      next,
      { selectionIds: [action.target] },
    );
  }

  private planCommitText(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'commit-text-edit' }>,
  ): PatchMapEditorWorkflowPlan {
    const text = textElement(materialized, action.target);
    const session = this.state.text;
    if (text === null || (session !== null && session.awaitingResolve)) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'text edit target is missing');
    }
    const nextBase = Object.freeze({
      ...this.state,
      mode: 'select' as const,
      text: null,
    });
    if (text.text === action.text) {
      const next = Object.freeze({
        ...nextBase,
        textUnchangedCount: this.state.textUnchangedCount + 1,
      });
      return this.unchangedPlan(
        action,
        Object.freeze({
          appliedCount: 0,
          unchangedCount: 1,
          selectedIds: Object.freeze([action.target]),
        }),
        next,
        { selectionIds: [action.target], closeHistoryGroup: true },
      );
    }
    const removing = action.text.length === 0;
    const transaction = workflowTransaction(
      action.actionId,
      removing
        ? [removeElement(action.target)]
        : [mergeElement(action.target, [change(['text'], action.text)])],
      removing ? [] : [action.target],
      'select',
      Object.freeze({
        textEdit: true,
        preserveStyle: action.preserveStyle ?? false,
      }),
    );
    const next = Object.freeze({
      ...nextBase,
      textAppliedCount: this.state.textAppliedCount + 1,
    });
    return this.pendingPlan(
      action,
      transaction,
      Object.freeze({
        appliedCount: 1,
        unchangedCount: 0,
        emptyDeleted: removing,
        selectedIds: Object.freeze(removing ? [] : [action.target]),
      }),
      next,
      { closeHistoryGroup: true },
    );
  }

  private planCancelText(
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'cancel-text-edit' }>,
  ): PatchMapEditorWorkflowPlan {
    const session = this.state.text;
    if (session === null || session.target !== action.target) {
      return rejected(action, 'MISSING_TARGET', ['target'], 'text edit session is not active');
    }
    const next = Object.freeze({
      ...this.state,
      mode: 'select' as const,
      text: null,
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({
        cancelled: true,
        restoredText: session.originalText,
      }),
      next,
      { selectionIds: [action.target], closeHistoryGroup: true },
    );
  }

  private planDeleteRequest(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'request-delete-plan' }>,
  ): PatchMapEditorWorkflowPlan {
    const missing = action.targets.find((id) => findElement(materialized.dataset, id) === null);
    if (missing !== undefined) {
      return rejected(action, 'MISSING_TARGET', ['targets'], `delete target ${missing} is missing`);
    }
    const dependentRelations = relationOwnersForTargets(materialized.dataset, action.targets);
    const plannedIds = Object.freeze(uniqueStrings([...action.targets, ...dependentRelations]));
    const next = Object.freeze({
      ...this.state,
      deletion: Object.freeze({
        requestedIds: Object.freeze([...action.targets]),
        plannedIds,
        confirmed: false,
        cascadeTargets: Object.freeze([]),
      }),
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({ deletePlan: plannedIds }),
      next,
    );
  }

  private planDeleteConfirmation(
    action: Extract<
      PatchMapEditorWorkflowAction,
      { readonly type: 'apply-host-cascade-confirmation' }
    >,
  ): PatchMapEditorWorkflowPlan {
    const deletion = this.state.deletion;
    if (deletion === null) {
      return rejected(action, 'INVALID_MUTATION', ['confirmed'], 'delete plan is not active');
    }
    if (action.registryLoading === true) {
      return rejected(action, 'CONFLICT', ['registryLoading'], 'delete is blocked while registry loads');
    }
    const next = Object.freeze({
      ...this.state,
      deletion: Object.freeze({
        ...deletion,
        confirmed: action.confirmed,
        cascadeTargets: Object.freeze([...action.cascadeTargets]),
      }),
    });
    return this.pendingPlan(
      action,
      null,
      Object.freeze({
        confirmed: action.confirmed,
        cascadeTargets: Object.freeze([...action.cascadeTargets]),
      }),
      next,
    );
  }

  private planDeleteTransaction(
    materialized: MaterializedPatchMapDataset,
    action: Extract<PatchMapEditorWorkflowAction, { readonly type: 'delete-transaction' }>,
  ): PatchMapEditorWorkflowPlan {
    const deletion = this.state.deletion;
    if (deletion === null || !deletion.confirmed) {
      return rejected(action, 'CONFLICT', ['targets'], 'host delete confirmation is required');
    }
    const expected = uniqueStrings([...deletion.requestedIds, ...deletion.cascadeTargets]);
    if (!sameStringArray(expected, action.targets)) {
      return rejected(action, 'CONFLICT', ['targets'], 'confirmed delete targets do not match');
    }
    const missing = action.targets.find((id) => findElement(materialized.dataset, id) === null);
    if (missing !== undefined) {
      return rejected(action, 'MISSING_TARGET', ['targets'], `delete target ${missing} is missing`);
    }
    const relationIds = new Set(
      action.targets.filter((id) => relationsElement(materialized, id) !== null),
    );
    const ordered = [
      ...action.targets.filter((id) => relationIds.has(id)),
      ...action.targets.filter((id) => !relationIds.has(id)),
    ];
    const transaction = workflowTransaction(
      action.actionId,
      ordered.map((id) => removeElement(id)),
      [],
      'select',
      Object.freeze({ deletedIds: Object.freeze([...action.targets]) }),
    );
    const next = Object.freeze({
      ...this.state,
      mode: 'select' as const,
      grid: null,
      relation: null,
      text: null,
      deletion: null,
    });
    return this.pendingPlan(
      action,
      transaction,
      Object.freeze({ deletedIds: Object.freeze([...action.targets]) }),
      next,
      { closeHistoryGroup: true },
    );
  }

  private pendingPlan(
    action: PatchMapEditorWorkflowAction,
    transactionValue: PatchMapMutationTransactionRequest | null,
    facts: PatchMapEditorWorkflowFacts,
    next: WorkflowState,
    effects: Readonly<{
      readonly selectionIds?: readonly string[];
      readonly closeHistoryGroup?: boolean;
    }> = {},
  ): PatchMapEditorWorkflowPlan {
    const plan = Object.freeze({
      schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
      actionType: action.type,
      action,
      status: 'planned',
      changed: true,
      transaction: transactionValue,
      facts,
      ...(effects.selectionIds === undefined
        ? {}
        : { selectionIds: Object.freeze([...effects.selectionIds]) }),
      closeHistoryGroup: effects.closeHistoryGroup ?? false,
    } satisfies PatchMapEditorWorkflowPlan);
    this.pending.set(plan, { next });
    return plan;
  }

  private unchangedPlan(
    action: PatchMapEditorWorkflowAction,
    facts: PatchMapEditorWorkflowFacts,
    next: WorkflowState,
    effects: Readonly<{
      readonly selectionIds?: readonly string[];
      readonly closeHistoryGroup?: boolean;
    }> = {},
  ): PatchMapEditorWorkflowPlan {
    const plan = Object.freeze({
      schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
      actionType: action.type,
      action,
      status: 'unchanged',
      changed: false,
      transaction: null,
      facts,
      ...(effects.selectionIds === undefined
        ? {}
        : { selectionIds: Object.freeze([...effects.selectionIds]) }),
      closeHistoryGroup: effects.closeHistoryGroup ?? false,
    } satisfies PatchMapEditorWorkflowPlan);
    this.pending.set(plan, { next });
    return plan;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('editor workflow authority is destroyed');
  }
}

function workflowTransaction(
  actionId: string,
  operations: readonly PatchMapMutationOperation[],
  selectedIds: readonly string[],
  editorMode: PatchMapEditorWorkflowMode,
  details: PatchMapMutationJsonValue,
): PatchMapMutationTransactionRequest {
  return Object.freeze({
    operations: Object.freeze([...operations]),
    strict: true,
    conflictPolicy: 'reject',
    recordHistory: true,
    actionId,
    history: Object.freeze({
      selectedIds: Object.freeze([...selectedIds]),
      mode: 'select',
      editorWorkflow: Object.freeze({
        revision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
        editorMode,
        details,
      }),
    }),
  });
}
function rejected(
  action: PatchMapEditorWorkflowAction,
  code: PatchMapEditorWorkflowDiagnosticCode,
  path: readonly (string | number)[],
  message: string,
): PatchMapEditorWorkflowPlan {
  return Object.freeze({
    schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
    actionType: action.type,
    action,
    status: 'rejected',
    changed: false,
    transaction: null,
    facts: EMPTY_FACTS,
    closeHistoryGroup: false,
    diagnostic: Object.freeze({
      code,
      path: Object.freeze([...path]),
      message,
    }),
  });
}
