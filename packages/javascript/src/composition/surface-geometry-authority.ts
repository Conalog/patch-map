import type { PatchMapRuntime } from '../core';
import type { PatchMapProjectionIndex } from '../parsing/contracts';
import {
  PatchMapScreenRegionIndex,
  type PatchMapScreenRegionBounds,
} from '../semantic/screen-region-index';
import type { PatchMapViewportGeometry } from '../viewport';
import type {
  PatchMapPoint,
  PatchMapRelationHit,
  PatchMapRelationHitOptions,
  PatchMapSurfaceEntityGeometry,
  PatchMapSurfaceGeometrySnapshot,
  PatchMapSurfaceRegionGeometryCandidates,
  PatchMapSurfaceRelationGeometry,
  PatchMapSurfaceView,
} from '../engine/surface-contract';
import {
  buildPatchMapRelationHitIndex,
  createPatchMapSurfaceEntityGeometry,
  createPatchMapSurfaceGeometrySnapshot,
  createPatchMapSurfaceWorldGeometrySnapshot,
  emptyPatchMapRelationHitIndex,
  hitTestPatchMapSurfaceRelations,
  queryPatchMapRelationHitIndex,
  selectionOverlayFromEntityGeometry,
} from '../engine/surface-geometry';

interface PatchMapSurfaceRootView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation?: number;
}

export class PatchMapSurfaceGeometryAuthority {
  private geometryRevision = 0;
  private worldGeometryCache: PatchMapViewportGeometry | null = null;
  private worldGeometryProjection: PatchMapProjectionIndex | null = null;
  private geometryCache: PatchMapSurfaceGeometrySnapshot | null = null;
  private geometryBaseCache: PatchMapSurfaceGeometrySnapshot | null = null;
  private geometryById = new Map<string, PatchMapSurfaceEntityGeometry>();
  private geometryProjection: PatchMapProjectionIndex | null = null;
  private geometryRevisionProjection: PatchMapProjectionIndex | null = null;
  private regionHitIndex: PatchMapScreenRegionIndex<
    PatchMapSurfaceEntityGeometry,
    PatchMapSurfaceRelationGeometry
  > | null = null;
  private relationHitIndex = emptyPatchMapRelationHitIndex();
  private surfaceView: PatchMapSurfaceView = Object.freeze({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });

  public constructor(private readonly core: PatchMapRuntime) {}

  public updateRootView(view: PatchMapSurfaceRootView): void {
    const orientationChanged = (
      view.rotation !== undefined &&
      view.rotation !== this.surfaceView.rotation
    );
    this.surfaceView = Object.freeze({
      ...this.surfaceView,
      x: view.x,
      y: view.y,
      scale: view.scale,
      rotation: view.rotation ?? this.surfaceView.rotation,
    });
    this.geometryRevision += 1;
    if (orientationChanged) this.invalidateGeometryCache();
    else this.invalidateScreenGeometryCache();
  }

  public updateSurfaceView(nextView: PatchMapSurfaceView): void {
    const orientationChanged = (
      nextView.rotation !== this.surfaceView.rotation ||
      nextView.flipX !== this.surfaceView.flipX ||
      nextView.flipY !== this.surfaceView.flipY
    );
    this.surfaceView = nextView;
    this.geometryRevision += 1;
    if (orientationChanged) this.invalidateGeometryCache();
    else this.invalidateScreenGeometryCache();
  }

  public invalidateProjection(projection: PatchMapProjectionIndex | null): void {
    this.geometryRevision += 1;
    this.geometryRevisionProjection = projection;
    this.invalidateGeometryCache();
  }

  public invalidateScreen(): void {
    this.geometryRevision += 1;
    this.invalidateScreenGeometryCache();
  }

  public invalidateSelection(): void {
    this.geometryRevision += 1;
    this.invalidateGeometrySelectionCache();
  }

  public worldGeometrySnapshot(): PatchMapViewportGeometry {
    const projection = this.core.visibleProjection;
    if (
      this.worldGeometryCache !== null &&
      this.worldGeometryProjection === projection
    ) {
      return this.worldGeometryCache;
    }
    const geometry = createPatchMapSurfaceWorldGeometrySnapshot(
      this.core.snapshot(),
      projection,
      this.surfaceView,
    );
    this.worldGeometryCache = geometry;
    this.worldGeometryProjection = projection;
    return geometry;
  }

  public geometrySnapshot(): PatchMapSurfaceGeometrySnapshot {
    const projection = this.core.visibleProjection;
    if (this.geometryCache && this.geometryProjection === projection) return this.geometryCache;
    if (this.geometryRevisionProjection !== projection) {
      this.geometryRevision += 1;
      this.geometryRevisionProjection = projection;
    }
    if (this.geometryBaseCache !== null && this.geometryProjection === projection) {
      const selection = this.core.selection();
      const selectionOverlay = selectionOverlayFromEntityGeometry(
        selection.refs.flatMap((ref) => {
          const id = this.core.get(ref)?.id;
          const geometry = id === undefined ? undefined : this.geometryById.get(id);
          return geometry === undefined ? [] : [geometry];
        }),
      );
      const geometry = Object.freeze({
        ...this.geometryBaseCache,
        revision: this.geometryRevision,
        sceneRevision: selection.revision,
        selectionOverlay,
      });
      this.geometryCache = geometry;
      return geometry;
    }
    const geometry = Object.freeze({
      ...createPatchMapSurfaceGeometrySnapshot(
        this.core.snapshot(),
        projection,
        this.surfaceView,
      ),
      revision: this.geometryRevision,
    });
    this.geometryCache = geometry;
    this.geometryBaseCache = geometry;
    if (
      this.worldGeometryCache === null ||
      this.worldGeometryProjection !== projection
    ) {
      this.worldGeometryCache = Object.freeze({
        entities: geometry.entities,
        relations: geometry.relations,
      });
      this.worldGeometryProjection = projection;
    }
    this.geometryById = new Map(geometry.entities.map((entity) => [entity.id, entity]));
    this.geometryProjection = projection;
    this.regionHitIndex = PatchMapScreenRegionIndex.build(
      geometry.entities,
      geometry.relations,
    );
    this.relationHitIndex = buildPatchMapRelationHitIndex(geometry.relations);
    return geometry;
  }

  public selectionGeometries(
    selectionIds: readonly string[],
  ): readonly PatchMapSurfaceEntityGeometry[] {
    // Interaction mode and host probes are valid immediately after renderer
    // initialization, before a dataset is loaded. An empty selection has no
    // semantic identities to resolve and must not force the Core parser seam.
    if (selectionIds.length === 0) return Object.freeze([]);
    const projection = this.core.visibleProjection;
    const geometries = this.core.semanticSelectionEntityIds(selectionIds).flatMap((id) => {
      const entity = this.core.get(id);
      if (entity === null || entity.kind === 'relation') return [];
      return [createPatchMapSurfaceEntityGeometry(entity, projection, this.surfaceView)];
    });
    return Object.freeze(geometries);
  }

  public queryRegionGeometry(
    bounds: PatchMapScreenRegionBounds,
  ): PatchMapSurfaceRegionGeometryCandidates {
    const geometry = this.geometrySnapshot();
    this.regionHitIndex ??= PatchMapScreenRegionIndex.build(
      geometry.entities,
      geometry.relations,
    );
    return this.regionHitIndex.query(bounds);
  }

  public relationHitTestScreen(
    point: PatchMapPoint,
    options: PatchMapRelationHitOptions = {},
  ): PatchMapRelationHit | null {
    const geometry = this.geometrySnapshot();
    const tolerance = options.toleranceCssPx ?? 4;
    const candidateIndices = tolerance <= 4
      ? queryPatchMapRelationHitIndex(this.relationHitIndex, point)
      : geometry.relations.map((_relation, index) => index);
    const candidates = candidateIndices.flatMap((index) => {
      const relation = geometry.relations[index];
      return relation ? [relation] : [];
    });
    return hitTestPatchMapSurfaceRelations(candidates, point, options);
  }

  public destroy(): void {
    this.geometryRevisionProjection = null;
    this.invalidateGeometryCache();
  }

  private invalidateGeometryCache(): void {
    this.worldGeometryCache = null;
    this.worldGeometryProjection = null;
    this.invalidateScreenGeometryCache();
  }

  private invalidateScreenGeometryCache(): void {
    this.geometryCache = null;
    this.geometryBaseCache = null;
    this.geometryById.clear();
    this.geometryProjection = null;
    this.regionHitIndex = null;
    this.relationHitIndex = emptyPatchMapRelationHitIndex();
  }

  private invalidateGeometrySelectionCache(): void {
    this.geometryCache = null;
  }
}
