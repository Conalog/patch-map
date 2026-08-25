import type {
  PatchMapBarPresentationProductProbe,
  PatchMapComponentVisualGeometryProbe,
  PatchMapComponentVisualProductProbe,
  PatchMapComponentVisualTarget,
  PatchMapTextGeometryProbe,
  PatchMapTextRendererProductProbe,
  PatchMapTextStateProbe,
  PatchMapTextTarget,
  PatchMapTextTransformProbe,
} from '../../core/contracts';
import type { PatchMapTextProjection } from '../../contracts';
import type { PatchMapHistoryState } from '../../history';
import type { PatchMapPaintOrderProductProbe } from '../../paint-order-product';
import type { PatchMapLogicalTargetSnapshot } from '../../query-selection';
import type {
  PatchMapEntityPaintProbe,
  PatchMapPixiPublicSurfaceProbe,
  PatchMapPixiRendererLossProbe,
  PatchMapRenderLaneRole,
  PatchMapRenderLaneSnapshot,
} from '../../renderers/types';
import type {
  PatchMapEngineSceneImageRecord,
  PatchMapSurfacePointerInput,
} from '../contracts';
import type {
  PatchMapEngineComponentSemanticProbe,
  PatchMapEngineTextSemanticProbe,
} from '../semantic-index';
import type {
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceOmittedRelationGeometry,
  PatchMapSurfaceRelationGeometry,
} from '../surface-contract';
import type {
  PatchMapLifecycle,
  PatchMapPublishedTuple,
  PatchMapRevisionStamp,
} from './lifecycle';

export type PatchMapEnginePointerInput = Readonly<
  PatchMapSurfacePointerInput & {
    readonly viewRevision?: number;
  }
>;

export interface PatchMapGeometryRevisionTuple {
  readonly scene: number;
  readonly view: number;
  readonly interaction: number;
}

export type PatchMapEngineGeometryProbe = Readonly<
  Omit<PatchMapSurfaceGeometrySnapshot, 'revision' | 'sceneRevision'> & {
    /** Engine scene revision represented by the correlated surface generation. */
    readonly revision: number | null;
    /** Independent surface geometry generation, when published. */
    readonly surfaceRevision: number | null;
    /** Engine revision tuple represented by the correlated surface generation. */
    readonly representedRevisions: PatchMapGeometryRevisionTuple | null;
    /** Per-domain lag from the current Engine tuple. */
    readonly revisionLags: PatchMapGeometryRevisionTuple | null;
  }
>;

export interface PatchMapEngineRelationProbe {
  readonly revision: number | null;
  readonly surfaceRevision: number | null;
  readonly representedRevisions: PatchMapGeometryRevisionTuple | null;
  readonly revisionLags: PatchMapGeometryRevisionTuple | null;
  readonly relations: readonly PatchMapSurfaceRelationGeometry[];
  readonly omittedRelations: readonly PatchMapSurfaceOmittedRelationGeometry[];
}

export interface PatchMapEngineComponentVisualProbe {
  readonly target: PatchMapComponentVisualTarget;
  readonly semantic: PatchMapEngineComponentSemanticProbe | null;
  readonly entityId: string | null;
  readonly logicalIdentity: string | null;
  readonly componentType: string | null;
  readonly renderRole: PatchMapComponentVisualProductProbe['renderRole'] | null;
  readonly entityKind: string | null;
  readonly geometry: PatchMapComponentVisualGeometryProbe | null;
  readonly publication: PatchMapComponentVisualProductProbe['publication'] | null;
  readonly sceneImage: PatchMapEngineSceneImageRecord | null;
  readonly rendererPaint: PatchMapEntityPaintProbe | null;
  readonly renderLanes: PatchMapRenderLaneSnapshot | null;
  readonly revisions: PatchMapRevisionStamp;
  readonly availability: Readonly<{
    readonly semantic: boolean;
    readonly surface: boolean;
    readonly rendererPaint: boolean;
    readonly renderLanes: boolean;
  }>;
}

export interface PatchMapEngineBarPresentationProbe
  extends PatchMapBarPresentationProductProbe {
  readonly revisions: PatchMapRevisionStamp;
  readonly publishedTuple: PatchMapPublishedTuple;
  readonly frameRevision: number;
}

export type PatchMapEngineTextPublicationStatus =
  | 'unavailable'
  | 'absent'
  | 'pending'
  | 'current';

export interface PatchMapEngineTextRevisionTuple {
  readonly current: PatchMapRevisionStamp;
  readonly published: PatchMapPublishedTuple;
  readonly frameRevision: number;
  readonly surfaceSceneRevision: number | null;
  readonly surfaceRenderedSceneRevision: number | null;
  readonly rendererFrame: number | null;
}

export interface PatchMapEngineTextProbe {
  readonly target: PatchMapTextTarget;
  readonly semantic: PatchMapEngineTextSemanticProbe | null;
  readonly semanticOwnerId: string | null;
  readonly entityId: string | null;
  readonly projection: PatchMapTextProjection | null;
  readonly geometry: PatchMapTextGeometryProbe | null;
  readonly state: PatchMapTextStateProbe | null;
  readonly transform: PatchMapTextTransformProbe | null;
  readonly renderer: PatchMapTextRendererProductProbe | null;
  readonly rendererPaint: PatchMapEntityPaintProbe | null;
  readonly renderLanes: PatchMapRenderLaneSnapshot | null;
  readonly publication: Readonly<{
    readonly status: PatchMapEngineTextPublicationStatus;
    readonly revisions: PatchMapEngineTextRevisionTuple;
  }>;
  readonly availability: Readonly<{
    readonly semantic: boolean;
    readonly surface: boolean;
    readonly renderer: boolean;
    readonly rendererPaint: boolean;
    readonly renderLanes: boolean;
  }>;
}

export type PatchMapEnginePaintOrderProbe = Readonly<
  PatchMapPaintOrderProductProbe & {
    readonly revisions: PatchMapRevisionStamp;
    readonly publishedTuple: PatchMapPublishedTuple;
    readonly frameRevision: number;
    readonly history: PatchMapHistoryState;
  }
>;

export type PatchMapEnginePixiPublicSurfaceProbe = Readonly<
  PatchMapPixiPublicSurfaceProbe & {
    readonly lifecycle: PatchMapLifecycle;
    readonly revisions: PatchMapRevisionStamp;
    readonly canvasCount: number;
  }
>;

export type PatchMapEngineRendererLossProbe = Readonly<
  PatchMapPixiRendererLossProbe & {
    readonly revisions: PatchMapRevisionStamp;
    readonly publishedTuple: PatchMapPublishedTuple;
    readonly canvasCount: number;
  }
>;

export interface PatchMapAggregateRenderOwnerProbe {
  readonly target: PatchMapComponentVisualTarget;
  readonly logicalTarget: PatchMapLogicalTargetSnapshot;
  readonly entityId: string;
  readonly aggregateRenderOwnerId: `render-owner:${string}/${string}`;
  readonly rendererKind: PatchMapEntityPaintProbe['rendererKind'] | null;
  readonly renderLane: PatchMapRenderLaneSnapshot[PatchMapRenderLaneRole] | null;
  readonly worldBounds: readonly [number, number, number, number];
  readonly visible: boolean;
  readonly revisions: PatchMapRevisionStamp;
  readonly publishedTuple: PatchMapPublishedTuple;
  readonly frameRevision: number;
}
