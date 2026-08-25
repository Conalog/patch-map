import type {
  PatchMapElementType,
} from '../semantic/dataset';
import type { PatchMapPointTuple } from '../semantic/geometry';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationTransactionRequest,
} from '../semantic/transaction';

export const PATCH_MAP_AUTHORING_REVISION = 'patch-map-authoring/1' as const;

export type PatchMapAuthoringAction =
  | Readonly<{
      readonly type: 'create-element';
      readonly kind: PatchMapElementType;
      readonly id: string;
      readonly positionWorld: PatchMapPointTuple;
      readonly parentId: string | null;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'edit-position-angle';
      readonly target: string;
      readonly x: number;
      readonly y: number;
      readonly angleDegrees: number;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'align-targets';
      readonly targets: readonly string[];
      readonly axis: PatchMapAuthoringAlignmentAxis;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'distribute-targets';
      readonly targets: readonly string[];
      readonly axis: PatchMapAuthoringDistributionAxis;
      readonly basis: 'bounds';
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'apply-style';
      readonly target: string;
      readonly changes: Readonly<Record<string, PatchMapMutationJsonValue>>;
      readonly strict: true;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'move-hierarchy';
      readonly target: string;
      readonly parentId: string | null;
      readonly index: number;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'reorder-z';
      readonly targets: readonly string[];
      readonly placement: 'front' | 'back';
      readonly preserveRelativeOrder: true;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'group-targets';
      readonly targets: readonly string[];
      readonly groupId: string;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'duplicate-tree' | 'copy-paste-tree';
      readonly target: string;
      readonly rootId: string;
      readonly offsetWorld: PatchMapPointTuple;
      readonly rewriteInternalReferences: true;
      readonly preserveExternalReferences: true;
      readonly actionId: string;
    }>
  | Readonly<{
      readonly type: 'ungroup-target';
      readonly target: string;
      readonly actionId: string;
    }>;

export type PatchMapAuthoringActionType = PatchMapAuthoringAction['type'];
export type PatchMapAuthoringAlignmentAxis =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center-x'
  | 'center-y';
export type PatchMapAuthoringDistributionAxis = 'horizontal' | 'vertical';
export type PatchMapAuthoringDiagnosticCode =
  | 'DUPLICATE_ID'
  | 'INVALID_MUTATION'
  | 'INVALID_VALUE'
  | 'MISSING_TARGET';

export interface PatchMapAuthoringDiagnostic {
  readonly code: PatchMapAuthoringDiagnosticCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export interface PatchMapAuthoringPlanningContext {
  readonly selectionIds: readonly string[];
}

export type PatchMapAuthoringFacts = Readonly<Record<string, PatchMapMutationJsonValue>>;

interface PatchMapAuthoringPlanBase {
  readonly schemaRevision: typeof PATCH_MAP_AUTHORING_REVISION;
  readonly actionType: PatchMapAuthoringActionType | null;
  readonly action: PatchMapAuthoringAction | null;
  readonly facts: PatchMapAuthoringFacts;
}

export type PatchMapAuthoringPlan =
  | Readonly<PatchMapAuthoringPlanBase & {
      readonly status: 'planned';
      readonly changed: true;
      readonly transaction: PatchMapMutationTransactionRequest;
    }>
  | Readonly<PatchMapAuthoringPlanBase & {
      readonly status: 'unchanged';
      readonly changed: false;
      readonly transaction: null;
    }>
  | Readonly<PatchMapAuthoringPlanBase & {
      readonly status: 'rejected';
      readonly changed: false;
      readonly transaction: null;
      readonly diagnostic: PatchMapAuthoringDiagnostic;
    }>;
