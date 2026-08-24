import type { PatchMapLogicalTargetSnapshot } from '../query-selection';

export const PATCH_MAP_SELECTION_TRANSFORMER_REVISION =
  'core-v2-selection-transformer/1' as const;

export type PatchMapSelectionVisualMode =
  | 'all'
  | 'group-only'
  | 'element-only'
  | 'hidden';

export type PatchMapTransformEligibility =
  | 'ineligible'
  | 'move-rotate'
  | 'move-resize-rotate'
  | 'locked'
  | 'none';

export type PatchMapTransformerHandle =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 'e'
  | 's'
  | 'w'
  | 'frame'
  | 'rotate';

export type PatchMapTransformerInputFamily =
  | 'selection'
  | 'pan'
  | 'hover'
  | 'context-menu'
  | 'transform';

export interface PatchMapTransformerTargetGeometry {
  readonly id: string;
  readonly ownerItemId?: string;
  readonly componentId?: string;
  readonly localBounds?: readonly [number, number, number, number];
  readonly screenBounds: readonly [number, number, number, number];
  readonly screenBasis?: readonly [number, number, number, number];
  readonly screenAngle?: number;
  readonly visible: boolean;
}

export interface PatchMapTransformableSubsetProbe {
  readonly schemaRevision: typeof PATCH_MAP_SELECTION_TRANSFORMER_REVISION;
  readonly selectedTargets: readonly PatchMapLogicalTargetSnapshot[];
  readonly transformableTargets: readonly PatchMapLogicalTargetSnapshot[];
  readonly rotatableTargets: readonly PatchMapLogicalTargetSnapshot[];
  readonly resizableTargets: readonly PatchMapLogicalTargetSnapshot[];
  readonly lockedTargets: readonly PatchMapLogicalTargetSnapshot[];
  readonly ineligibleTargets: readonly PatchMapLogicalTargetSnapshot[];
  readonly activeResizeHandles: boolean;
  readonly subsetIndicator: Readonly<{
    readonly selected: number;
    readonly transformable: number;
    readonly resizable: number;
  }>;
  readonly eligibilityById: Readonly<Record<string, PatchMapTransformEligibility>>;
}

export interface PatchMapSelectionFrameProbe {
  readonly kind: 'oriented' | 'axis-aligned-union';
  readonly orientationDegrees: number;
  readonly screenBounds: readonly [number, number, number, number];
  readonly screenCorners: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
}

export interface PatchMapSelectionVisualOptions {
  readonly selectionIds: readonly string[];
  readonly mode?: PatchMapSelectionVisualMode;
  readonly rejectIds?: readonly string[];
  readonly lockedIds?: readonly string[];
  readonly includeTypes?: readonly string[];
  readonly handleCssPx?: number;
  readonly strokeCssPx?: number;
  readonly viewportScale?: number;
}

export interface PatchMapSelectionVisualProbe {
  readonly schemaRevision: typeof PATCH_MAP_SELECTION_TRANSFORMER_REVISION;
  readonly mode: PatchMapSelectionVisualMode;
  readonly selectedTargets: readonly PatchMapLogicalTargetSnapshot[];
  readonly overlayTargets: readonly PatchMapLogicalTargetSnapshot[];
  readonly transformableTargets: readonly PatchMapLogicalTargetSnapshot[];
  /** Individual frames selected by the bounds display mode. */
  readonly individualFrames: readonly PatchMapSelectionFrameProbe[];
  /** Aggregate frame painted by group-only/all, excluding all-mode single duplicates. */
  readonly groupFrame: PatchMapSelectionFrameProbe | null;
  readonly overlayCount: number;
  readonly explicitlyIndicatesTransformableSubset: boolean;
  readonly handleCssPx: number;
  readonly strokeCssPx: number;
  /** Aggregate transformer/edit frame, independent from individual outline paint. */
  readonly frame: PatchMapSelectionFrameProbe | null;
}

export interface PatchMapTransformerHandleRegion {
  readonly id: PatchMapTransformerHandle;
  readonly kind: 'corner' | 'edge' | 'frame' | 'rotate';
  readonly center: readonly [number, number];
  readonly cursor: string;
}

export interface PatchMapTransformerHandleProbe {
  readonly schemaRevision: typeof PATCH_MAP_SELECTION_TRANSFORMER_REVISION;
  readonly frame: PatchMapSelectionFrameProbe;
  readonly visibleCorners: readonly ['nw', 'ne', 'sw', 'se'];
  readonly regions: readonly PatchMapTransformerHandleRegion[];
  readonly overlapPriority: readonly ['corner', 'edge', 'rotate', 'frame'];
  readonly cornerCssPx: number;
  readonly edgeStripCssPx: number;
  readonly rotateZoneCssPx: number;
  readonly cursorDirectionByHandle: Readonly<Record<string, string>>;
}

export interface PatchMapRelationEndpointResolution {
  readonly schemaRevision: typeof PATCH_MAP_SELECTION_TRANSFORMER_REVISION;
  readonly requestedRelationIds: readonly string[];
  readonly resolvedRelationIds: readonly string[];
  readonly missingRelationIds: readonly string[];
  readonly targets: readonly PatchMapLogicalTargetSnapshot[];
  readonly missingEndpointIds: readonly string[];
  readonly duplicateTargetCount: 0;
  readonly suppressedDuplicateEndpointCount: number;
  readonly retainedEndpointSnapshotCount: 0;
}

export interface PatchMapTransformerGestureProbe {
  readonly schemaRevision: typeof PATCH_MAP_SELECTION_TRANSFORMER_REVISION;
  readonly activeGestureCount: 0 | 1;
  readonly pointerCaptureCount: 0 | 1;
  readonly activePointerId: number | null;
  readonly activeHandle: PatchMapTransformerHandle | null;
  readonly selectionDeliveryCount: number;
  readonly panDeliveryCount: number;
  readonly hoverDeliveryCount: number;
  readonly contextMenuDeliveryCount: number;
  readonly transformDeliveryCount: number;
  readonly staleCompletionCount: number;
  readonly destroyed: boolean;
}
