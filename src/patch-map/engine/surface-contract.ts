import type { PatchMapAffineBasis } from '../semantic/geometry';
import type { PatchMapScreenRegionCandidates } from '../semantic/screen-region-index';

export interface PatchMapSurfaceEntityGeometry {
  readonly id: string;
  readonly kind: string;
  readonly localBounds?: readonly [number, number, number, number];
  readonly worldBounds: readonly [number, number, number, number];
  readonly screenBounds: readonly [number, number, number, number];
  readonly visibleBounds?: readonly [number, number, number, number] | null;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly ownerItemId?: string;
  readonly componentId?: string;
  readonly componentType?: string;
  readonly contentOrientation?: 'follow-item' | 'upright';
  readonly screenBasis?: PatchMapAffineBasis;
  readonly visibleCenter?: readonly [number, number];
  readonly screenAngle?: number;
}

export interface PatchMapSurfaceRelationGeometry {
  readonly id: string;
  readonly relationId?: string;
  readonly key?: string;
  readonly identityKey?: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind?: 'segment' | 'polyline';
  readonly localPoints?: readonly (readonly [number, number])[];
  readonly worldPoints?: readonly (readonly [number, number])[];
  readonly screenPoints?: readonly (readonly [number, number])[];
  readonly worldBounds?: readonly [number, number, number, number];
  readonly screenBounds?: readonly [number, number, number, number];
  readonly visible?: boolean;
  readonly style?: Readonly<{
    readonly color: number;
    readonly colorHex: string;
    readonly width: number;
    readonly opacity: number;
    readonly zIndex: number;
  }>;
  readonly visibleStrokeWidthsCssPx?: readonly number[];
  readonly worldEndpoints: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
  readonly screenEndpoints: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
}

export interface PatchMapSurfaceOmittedRelationGeometry {
  readonly id: string;
  readonly relationId: string;
  readonly key: string;
  readonly identityKey: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly authoredIndex: number;
  readonly reason: 'missing-source' | 'missing-target' | 'missing-source-and-target';
}

export interface PatchMapSurfaceGeometrySnapshot {
  /** Surface geometry generation; legacy injected surfaces may use the dense scene revision. */
  readonly revision?: number;
  /** Dense scene revision used to derive the snapshot, when independently available. */
  readonly sceneRevision?: number;
  readonly entities: readonly PatchMapSurfaceEntityGeometry[];
  readonly relations: readonly PatchMapSurfaceRelationGeometry[];
  readonly omittedRelations?: readonly PatchMapSurfaceOmittedRelationGeometry[];
  readonly selectionOverlay: Readonly<{
    readonly screenBounds: readonly [number, number, number, number];
  }> | null;
}

export type PatchMapSurfaceRegionGeometryCandidates = PatchMapScreenRegionCandidates<
  PatchMapSurfaceEntityGeometry,
  PatchMapSurfaceRelationGeometry
>;
