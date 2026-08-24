import type {
  PatchMapMutationJsonValue,
  PatchMapMutationTransactionRequest,
} from '../semantic/transaction';

export const PATCH_MAP_EDITOR_WORKFLOW_REVISION =
  'core-v2-editor-workflow/1' as const;

export const PATCH_MAP_EDITOR_MUTATION_KINDS = Object.freeze([
  'create',
  'move',
  'resize',
  'rotate',
  'grid',
  'relation',
  'text',
  'style',
  'hierarchy',
  'group',
  'duplicate',
  'delete',
] as const);

export type PatchMapEditorMutationKind =
  (typeof PATCH_MAP_EDITOR_MUTATION_KINDS)[number];

export type PatchMapEditorWorkflowMode =
  | 'select'
  | 'grid-edit'
  | 'relation-edit'
  | 'text-edit';

export type PatchMapEditorWorkflowAction =
  | Readonly<{
      readonly type: 'select-targets';
      readonly targets: readonly string[];
      readonly mode: 'replace';
    }>
  | Readonly<{
      readonly type: 'enter-grid-edit';
      readonly target: string;
      readonly linkedCellIds?: readonly string[];
    }>
  | Readonly<{
      readonly type: 'reveal-inactive-cells';
      readonly target: string;
    }>
  | Readonly<{
      readonly type: 'resize-grid';
      readonly target: string;
      readonly rows: number;
      readonly columns: number;
      readonly gapX: number;
      readonly gapY: number;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'set-grid-cell-active';
      readonly target: string;
      readonly active: boolean;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'exit-grid-edit';
      readonly target: string;
    }>
  | Readonly<{
      readonly type: 'enter-relation-edit';
      readonly target: string;
    }>
  | Readonly<{
      readonly type: 'add-relation-link' | 'remove-relation-link';
      readonly relationId: string;
      readonly source: string;
      readonly target: string;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'exit-relation-edit';
      readonly relationId: string;
    }>
  | Readonly<{
      readonly type: 'open-text-editor';
      readonly target: string;
      readonly hostOverlay: true;
    }>
  | Readonly<{
      readonly type: 'resolve-editor-target-by-id';
      readonly target: string;
    }>
  | Readonly<{
      readonly type: 'commit-text-edit';
      readonly target: string;
      readonly text: string;
      readonly preserveStyle?: boolean;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'cancel-text-edit';
      readonly target: string;
    }>
  | Readonly<{
      readonly type: 'request-delete-plan';
      readonly targets: readonly string[];
    }>
  | Readonly<{
      readonly type: 'apply-host-cascade-confirmation';
      readonly confirmed: boolean;
      readonly cascadeTargets: readonly string[];
      readonly registryLoading?: boolean;
    }>
  | Readonly<{
      readonly type: 'delete-transaction';
      readonly targets: readonly string[];
      readonly actionId: string;
    }>;

export type PatchMapEditorWorkflowDiagnosticCode =
  | 'INVALID_VALUE'
  | 'INVALID_MUTATION'
  | 'MISSING_TARGET'
  | 'CONFLICT';

export interface PatchMapEditorWorkflowDiagnostic {
  readonly code: PatchMapEditorWorkflowDiagnosticCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type PatchMapEditorWorkflowFacts =
  Readonly<Record<string, PatchMapMutationJsonValue>>;

interface PatchMapEditorWorkflowPlanBase {
  readonly schemaRevision: typeof PATCH_MAP_EDITOR_WORKFLOW_REVISION;
  readonly actionType: PatchMapEditorWorkflowAction['type'];
  readonly action: PatchMapEditorWorkflowAction;
  readonly facts: PatchMapEditorWorkflowFacts;
  readonly selectionIds?: readonly string[];
  readonly closeHistoryGroup: boolean;
}

export type PatchMapEditorWorkflowPlan =
  | Readonly<PatchMapEditorWorkflowPlanBase & {
      readonly status: 'planned';
      readonly changed: true;
      readonly transaction: PatchMapMutationTransactionRequest | null;
    }>
  | Readonly<PatchMapEditorWorkflowPlanBase & {
      readonly status: 'unchanged';
      readonly changed: false;
      readonly transaction: null;
    }>
  | Readonly<PatchMapEditorWorkflowPlanBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly transaction: null;
      readonly diagnostic: PatchMapEditorWorkflowDiagnostic;
    }>;

export interface PatchMapEditorWorkflowProbe {
  readonly schemaRevision: typeof PATCH_MAP_EDITOR_WORKFLOW_REVISION;
  readonly mode: PatchMapEditorWorkflowMode;
  readonly activeTargetId: string | null;
  readonly activeSessionCount: 0 | 1;
  readonly inactiveCellsVisible: boolean;
  readonly pendingDeleteCount: number;
  readonly textAppliedCount: number;
  readonly textUnchangedCount: number;
  readonly replacementRecoveryCount: number;
  readonly destroyed: boolean;
}

