import type { PatchMapAffineMatrix, PatchMapBoundsTuple, PatchMapPointTuple } from '../semantic/geometry';

export interface PatchMapViewportVisual {
  readonly worldBounds: PatchMapBoundsTuple;
  readonly worldQuad?: Readonly<{ affine: PatchMapAffineMatrix; localBounds: PatchMapBoundsTuple }>;
}

export interface PatchMapViewportGeometryEntity extends PatchMapViewportVisual {
  readonly id: string;
  readonly visible: boolean;
  readonly ownerItemId?: string;
  /** An item marker has a frame but no visual area of its own. */
  readonly frame?: Readonly<{ affine: PatchMapAffineMatrix; gridId?: string }>;
}

export interface PatchMapViewportGeometryRelation {
  readonly id: string;
  readonly relationId?: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly worldBounds?: PatchMapBoundsTuple;
  readonly worldQuad?: NonNullable<PatchMapViewportVisual['worldQuad']>;
  /** Unrounded world points; the affine identifies the relation's local frame. */
  readonly viewportPath?: Readonly<{
    affine: PatchMapAffineMatrix;
    worldPoints: readonly PatchMapPointTuple[];
    strokeWidth: number;
    authoredIndex: number;
  }>;
  readonly visible?: boolean;
}

export interface PatchMapViewportGeometry {
  readonly elementFrames?: Readonly<Record<string, PatchMapAffineMatrix>>;
  readonly entities: readonly PatchMapViewportGeometryEntity[];
  readonly relations: readonly PatchMapViewportGeometryRelation[];
}
