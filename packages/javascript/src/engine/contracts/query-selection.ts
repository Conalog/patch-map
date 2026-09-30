import type { PatchMapCommandTargetState } from '../../host-interaction';
import type { PATCH_MAP_POINTER_GESTURE_REVISION } from '../../pointer-gesture';
import type {
  PatchMapLogicalTargetSnapshot,
  PatchMapQueryReuseOperation,
  PatchMapSelectionChange,
  PatchMapSelectionEligibilityOptions,
  PatchMapSelectionHit,
  PATCH_MAP_QUERY_SELECTION_REVISION,
} from '../../query-selection';
import type { PatchMapMutationTarget } from '../../semantic/transaction';
import type { PatchMapRelationEndpointResolution } from '../../selection-transformer';
import type { PatchMapPoint } from '../surface-contract';

/**
 * Detached immutable query result. The private Engine registry, not these
 * public fields, authorizes later mutation use.
 */
export interface PatchMapResolvedTargetSnapshot {
  readonly target: PatchMapMutationTarget;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface PatchMapEngineQueryResult {
  readonly schemaRevision: typeof PATCH_MAP_QUERY_SELECTION_REVISION;
  readonly status: 'matched' | 'empty' | 'rejected';
  readonly code: 'CONFLICT' | null;
  readonly lifecycleGeneration: number;
  readonly sceneRevision: number;
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
}

export type PatchMapEngineQueryReuseResult =
  | Readonly<{
      readonly status: 'accepted';
      readonly code: null;
      readonly operation: PatchMapQueryReuseOperation;
      readonly appliedCount: number;
      readonly targets: readonly PatchMapLogicalTargetSnapshot[];
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly code: 'STALE_TARGET';
      readonly operation: PatchMapQueryReuseOperation;
      readonly appliedCount: 0;
      readonly targets: readonly PatchMapLogicalTargetSnapshot[];
    }>;

export interface PatchMapEngineSelectionHit extends PatchMapSelectionHit {
  readonly worldPoint: PatchMapPoint;
}

export interface PatchMapEnginePointSelectionResult
  extends PatchMapEngineSelectionHit {
  readonly change: PatchMapSelectionChange;
}

export interface PatchMapExternalSelectionResult {
  readonly requestedIds: readonly string[];
  readonly missingIds: readonly string[];
  readonly change: PatchMapSelectionChange;
}

export type PatchMapCommandTargetStatusResult =
  | Readonly<{
      readonly status: 'applied';
      readonly code: null;
      readonly state: PatchMapCommandTargetState;
    }>
  | Readonly<{
      readonly status: 'rejected';
      readonly code: 'MISSING_TARGET' | 'STALE_TARGET';
      readonly state: PatchMapCommandTargetState;
    }>;

export interface PatchMapEngineRelationEndpointSelectionResult
  extends PatchMapRelationEndpointResolution {
  readonly change: PatchMapSelectionChange;
}

export interface PatchMapEngineRegionSelectionOptions
  extends PatchMapSelectionEligibilityOptions {
  readonly mode?: 'replace' | 'add' | 'toggle';
  readonly commit?: boolean;
  readonly partialIntersection?: boolean;
  readonly toleranceCssPx?: number;
}

export interface PatchMapEngineRegionSelectionResult {
  readonly schemaRevision: typeof PATCH_MAP_POINTER_GESTURE_REVISION;
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
  readonly candidateIds: readonly string[];
  readonly filteredIds: readonly string[];
  readonly lockedIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly duplicateCount: number;
  readonly nonFiniteCount: number;
  readonly liveChangeCount: number;
  readonly strokeCssPx: 1;
  readonly change: PatchMapSelectionChange | null;
}
