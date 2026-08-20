import type { PatchMapMutationTarget } from '../semantic/transaction';

export const PATCH_MAP_QUERY_SELECTION_REVISION = 'core-v2-query-selection/1' as const;

export type PatchMapLogicalTargetKey =
  | `element:${string}`
  | `component:${string}/${string}`;

export interface PatchMapLogicalTargetSnapshot {
  readonly key: PatchMapLogicalTargetKey;
  readonly target: PatchMapMutationTarget;
  readonly selectionId: string;
  readonly kind: 'element' | 'component';
  readonly id: string;
  readonly ownerId: string | null;
  readonly type: string;
  readonly label: string | null;
  readonly parentKey: PatchMapLogicalTargetKey | null;
  readonly ancestorKeys: readonly PatchMapLogicalTargetKey[];
  readonly depth: number;
  readonly sceneOrder: number;
  readonly zIndex: number;
  readonly topLevel: boolean;
  readonly locked: boolean;
  readonly ancestorLocked: boolean;
  readonly rendererObjectCount: 0;
  readonly value: Readonly<Record<string, unknown>>;
  readonly identity: Readonly<{
    readonly key: PatchMapLogicalTargetKey;
    readonly sceneOrder: number;
  }>;
}

export interface PatchMapSceneQueryWhere {
  readonly id?: string;
  readonly ownerId?: string;
  readonly type?: string;
  readonly label?: string;
}

export interface PatchMapSceneQuery {
  readonly root?: PatchMapMutationTarget | null;
  readonly recursive?: boolean;
  readonly where?: PatchMapSceneQueryWhere;
  readonly predicate?: (target: PatchMapLogicalTargetSnapshot) => boolean;
}

export type PatchMapSceneQueryEvaluation =
  | Readonly<{
      readonly status: 'matched' | 'empty';
      readonly code: null;
      readonly targets: readonly PatchMapLogicalTargetSnapshot[];
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly code: 'CONFLICT';
      readonly targets: readonly PatchMapLogicalTargetSnapshot[];
    }>;

export type PatchMapQueryReuseOperation =
  | 'update'
  | 'event-bind'
  | 'focus'
  | 'presentation'
  | 'transform'
  | 'select';

export type PatchMapSelectionSetOperation =
  | Readonly<{
      readonly op: 'replace' | 'add' | 'remove' | 'toggle';
      readonly ids: readonly string[];
      readonly source?: 'canvas' | 'external' | 'programmatic';
    }>
  | Readonly<{
      readonly op: 'clear';
      readonly source?: 'canvas' | 'external' | 'programmatic';
    }>;

export interface PatchMapSelectionChange {
  readonly changed: boolean;
  readonly source: 'canvas' | 'external' | 'programmatic';
  readonly current: readonly string[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export interface PatchMapSelectionEligibilityOptions {
  readonly rejectIds?: readonly string[];
  readonly lockedIds?: readonly string[];
  readonly predicate?: (target: PatchMapLogicalTargetSnapshot) => boolean;
}

export interface PatchMapSelectionGeometry {
  readonly id: string;
  readonly ownerItemId?: string;
  readonly componentId?: string;
  readonly screenBounds: readonly [number, number, number, number];
  readonly visible: boolean;
}

export interface PatchMapSelectionHitOptions extends PatchMapSelectionEligibilityOptions {
  readonly candidateIds?: readonly string[];
}

export interface PatchMapSelectionHit {
  readonly target: PatchMapLogicalTargetSnapshot | null;
  readonly candidates: readonly PatchMapLogicalTargetSnapshot[];
}

export type PatchMapSelectionUnit =
  | 'entity'
  | 'grid'
  | 'grid-cell'
  | 'closest-group'
  | 'highest-group';

export type PatchMapSelectionClickType = 'single' | 'double' | 'multi-click';

export interface PatchMapSelectionInteractionOptions {
  readonly unit: PatchMapSelectionUnit;
  readonly clickCount?: number;
  readonly deepSelect?: boolean;
}

export interface PatchMapSelectionInteraction {
  readonly hit: PatchMapLogicalTargetSnapshot;
  readonly resolved: PatchMapLogicalTargetSnapshot;
  readonly clickType: PatchMapSelectionClickType;
  readonly clickCount: number;
  readonly engineDrillDelta: 0 | 1;
}
