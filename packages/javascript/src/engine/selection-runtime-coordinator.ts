import type { PatchMapPointerSelectionChange } from '../public/contracts';
import type { PatchMapHostInteractionAuthority } from '../host-interaction';
import {
  PATCH_MAP_POINTER_GESTURE_REVISION,
  hitPatchMapBoxRegion,
  hitPatchMapPaintRegion,
  type PatchMapGestureCancelReason,
  type PatchMapRegionHitResult,
} from '../pointer-gesture';
import {
  applyPatchMapSelectionOperation,
  type PatchMapLogicalTargetSnapshot,
  type PatchMapSelectionChange,
  type PatchMapSelectionEligibilityOptions,
  type PatchMapSelectionHitOptions,
  type PatchMapSelectionInteraction,
  type PatchMapSelectionInteractionOptions,
  type PatchMapSelectionSetOperation,
} from '../query-selection';
import {
  createPatchMapSelectionVisualProbe,
  evaluatePatchMapTransformableSubset,
  resolvePatchMapRelationEndpoints,
  type PatchMapSelectionVisualOptions,
  type PatchMapSelectionVisualProbe,
  type PatchMapTransformableSubsetProbe,
} from '../selection-transformer';
import type { PatchMapScreenRegionBounds } from '../semantic/screen-region-index';
import { selectionGeometryIds } from './pointer-interaction-values';
import type { PatchMapPublicationAuthority } from './publication-authority';
import type { PatchMapSceneStateAuthority } from './scene-state-authority';
import type {
  PatchMapEngineRegionSelectionOptions,
  PatchMapEngineRegionSelectionResult,
  PatchMapEngineRelationEndpointSelectionResult,
  PatchMapEngineSelectionHit,
  PatchMapExternalSelectionResult,
} from './contracts/query-selection';
import type { PatchMapEngineSurface } from './contracts';
import type { PatchMapPoint, PatchMapSurfaceGeometrySnapshot } from './surface-contract';
import { validatePoint } from './input-contracts';

export interface PatchMapSelectionRuntimePort {
  readonly requireSurface: (operation: string) => PatchMapEngineSurface;
  readonly viewportScale: () => number;
  readonly cancelActiveTransformer: (
    reason: PatchMapGestureCancelReason,
    restorePreview: boolean,
  ) => boolean;
  readonly interruptTransformerGestures: () => void;
  readonly syncPointerOverlay: () => void;
  readonly interruptPointerSelection: (reason: PatchMapGestureCancelReason) => void;
  readonly pointerSelectionPublication: (
    change: PatchMapSelectionChange,
  ) => PatchMapPointerSelectionChange;
  readonly emitSelectionChanged: (change: PatchMapSelectionChange) => void;
  readonly emitPointerSelectionChanged: (
    publication: PatchMapPointerSelectionChange,
  ) => void;
  readonly notReadyError: (operation: string) => Error;
}

/**
 * Owns selection resolution and the complete selection publication sequence.
 * Public Engine methods delegate here so transformer cancellation, surface and
 * scene writes, pointer overlay synchronization, revisions, Engine events, and
 * host publications retain one explicit ordering owner.
 */
export class PatchMapSelectionRuntimeCoordinator {
  public constructor(
    private readonly sceneState: PatchMapSceneStateAuthority,
    private readonly publication: PatchMapPublicationAuthority,
    private readonly hostInteractions: PatchMapHostInteractionAuthority,
    private readonly port: PatchMapSelectionRuntimePort,
  ) {}

  public apply(
    input: PatchMapSelectionSetOperation,
    preserveTransformerGesture = false,
  ): PatchMapSelectionChange {
    const surface = this.port.requireSurface('select');
    const materialized = this.sceneState.materialized;
    const change = applyPatchMapSelectionOperation(
      this.sceneState.selectionIds,
      input,
      (id) => {
        if (materialized === null) return false;
        const owned = this.sceneState.ownedSelectionTargetExists(id, materialized);
        return owned ?? this.sceneState.logicalSceneIndex().target(id) !== null;
      },
    );
    this.commit(surface, change, preserveTransformerGesture);
    return change;
  }

  public external(ids: readonly string[]): PatchMapExternalSelectionResult {
    const change = this.apply({ op: 'replace', ids, source: 'external' });
    const requestedIds = Object.freeze([...new Set(ids)]);
    const currentIds = new Set(change.current);
    return Object.freeze({
      requestedIds,
      missingIds: Object.freeze(requestedIds.filter((id) => !currentIds.has(id))),
      change,
    });
  }

  public filterTargets(
    targetIds: readonly string[],
    options: PatchMapSelectionEligibilityOptions = {},
  ): readonly PatchMapLogicalTargetSnapshot[] {
    this.port.requireSurface('filterSelectionTargets');
    return this.sceneState.logicalSceneIndex().filterSelection(targetIds, options);
  }

  public hitTestScreen(
    point: PatchMapPoint,
    options: PatchMapSelectionHitOptions = {},
  ): PatchMapEngineSelectionHit {
    validatePoint(point, 'selectionHitTestScreen');
    const surface = this.port.requireSurface('selectionHitTestScreen');
    const worldPoint = surface.screenToWorld(point);
    if (selectionHitUsesSpatialFastPath(options)) {
      const id = surface.hitTestScreen(point);
      const hit = id === null
        ? Object.freeze({ target: null, candidates: Object.freeze([]) })
        : this.sceneState.logicalSceneSelectionIndex().hitFromTarget(id);
      return Object.freeze({ ...hit, worldPoint });
    }
    const logicalIndex = this.sceneState.logicalSceneIndex();
    const geometry = surface.geometrySnapshot?.();
    if (geometry === undefined) {
      const id = surface.hitTestScreen(point);
      const target = id === null
        ? null
        : logicalIndex.filterSelection([id], options)[0] ?? null;
      return Object.freeze({
        target,
        candidates: Object.freeze(target === null ? [] : [target]),
        worldPoint,
      });
    }
    const hit = logicalIndex.hitTest(
      geometry.entities.map((entity) => Object.freeze({
        id: entity.id,
        ...(entity.ownerItemId === undefined ? {} : { ownerItemId: entity.ownerItemId }),
        ...(entity.componentId === undefined ? {} : { componentId: entity.componentId }),
        screenBounds: entity.screenBounds,
        visible: entity.visible,
      })),
      point,
      options,
    );
    return Object.freeze({ ...hit, worldPoint });
  }

  public selectPoint(
    point: PatchMapPoint,
    options: PatchMapSelectionHitOptions & Readonly<{
      readonly mode?: 'replace' | 'add' | 'toggle';
    }> = {},
  ): Readonly<PatchMapEngineSelectionHit & { readonly change: PatchMapSelectionChange }> {
    const hit = this.hitTestScreen(point, options);
    const ids = hit.target === null
      ? Object.freeze([] as string[])
      : Object.freeze([hit.target.selectionId]);
    const change = this.apply({
      op: options.mode ?? 'replace',
      ids,
      source: 'canvas',
    });
    return Object.freeze({ ...hit, change });
  }

  public selectBox(
    start: readonly [number, number],
    end: readonly [number, number],
    options: PatchMapEngineRegionSelectionOptions = {},
  ): PatchMapEngineRegionSelectionResult {
    const surface = this.port.requireSurface('selectBox');
    const geometry = requireRegionGeometry(surface, 'selectBox');
    const queryBounds = boxRegionQueryBounds(start, end);
    const candidates = queryBounds === null
      ? geometry
      : surface.queryRegionGeometry?.(queryBounds) ?? geometry;
    const hit = hitPatchMapBoxRegion(
      candidates.entities,
      candidates.relations,
      start,
      end,
      options.partialIntersection === undefined
        ? {}
        : { partialIntersection: options.partialIntersection },
    );
    return this.applyRegion(hit, options, 1);
  }

  public selectPaint(
    segments: readonly (readonly [
      readonly [number, number],
      readonly [number, number],
    ])[],
    options: PatchMapEngineRegionSelectionOptions = {},
  ): PatchMapEngineRegionSelectionResult {
    const surface = this.port.requireSurface('selectPaint');
    const geometry = requireRegionGeometry(surface, 'selectPaint');
    const queryBounds = paintRegionQueryBounds(segments, options.toleranceCssPx ?? 0);
    const candidates = queryBounds === null
      ? geometry
      : surface.queryRegionGeometry?.(queryBounds) ?? geometry;
    const hit = hitPatchMapPaintRegion(
      candidates.entities,
      candidates.relations,
      segments,
      options.toleranceCssPx === undefined
        ? {}
        : { toleranceCssPx: options.toleranceCssPx },
    );
    return this.applyRegion(hit, options, segments.length);
  }

  public resolveInteraction(
    targetOrId: string,
    options: PatchMapSelectionInteractionOptions,
  ): PatchMapSelectionInteraction | null {
    this.port.requireSurface('resolveSelectionInteraction');
    return this.sceneState.logicalSceneIndex().resolveSelectionInteraction(targetOrId, options);
  }

  public transformableSubset(
    selectionIds: readonly string[] = this.sceneState.selectionIds,
    lockedIds: readonly string[] = [],
  ): PatchMapTransformableSubsetProbe {
    this.port.requireSurface('transformableSubset');
    return evaluatePatchMapTransformableSubset(
      this.sceneState.logicalSceneSelectionIndex(),
      selectionIds,
      lockedIds,
    );
  }

  public visualProbe(
    options: Omit<PatchMapSelectionVisualOptions, 'selectionIds'> & Readonly<{
      readonly selectionIds?: readonly string[];
    }> = {},
  ): PatchMapSelectionVisualProbe | null {
    const surface = this.port.requireSurface('selectionVisualProbe');
    const selectionIds = options.selectionIds ?? this.sceneState.selectionIds;
    const geometries = surface.selectionGeometries?.(selectionIds) ??
      surface.geometrySnapshot?.().entities ??
      null;
    if (geometries === null) return null;
    return createPatchMapSelectionVisualProbe(
      this.sceneState.logicalSceneSelectionIndex(),
      geometries,
      {
        ...options,
        selectionIds,
        viewportScale: options.viewportScale ?? this.port.viewportScale(),
      },
    );
  }

  public setVisualPolicy(
    options: Omit<PatchMapSelectionVisualOptions, 'selectionIds'> & Readonly<{
      readonly selectionIds?: readonly string[];
    }> = {},
  ): PatchMapSelectionVisualProbe | null {
    const surface = this.port.requireSurface('setSelectionVisualPolicy');
    const visual = this.visualProbe(options);
    if (visual === null) return null;
    const index = this.sceneState.logicalSceneSelectionIndex();
    const visualIds = visual.overlayTargets.map((target) => target.selectionId);
    const subset = evaluatePatchMapTransformableSubset(
      index,
      visualIds,
      options.lockedIds ?? [],
    );
    const changed = surface.setSelectionOverlayPolicy?.({
      visibleIds: selectionGeometryIds(index, visualIds),
      transformableIds: subset.transformableTargets.map((target) => target.selectionId),
      resizableIds: subset.resizableTargets.map((target) => target.selectionId),
      hidden: visual.mode === 'hidden',
      handleCssPx: visual.handleCssPx,
      strokeCssPx: visual.strokeCssPx,
      strokeScale: 'fixed',
      minStrokeCssPx: 1,
      strokeAlignment: 'center',
      color: 0x2f80ed,
      displayMode: visual.mode,
      marqueeColor: 0x2f80ed,
      marqueeStrokeCssPx: visual.strokeCssPx,
      marqueeFillAlpha: 0.08,
    }) ?? false;
    if (changed) this.publication.advanceInteraction();
    return visual;
  }

  public selectRelationEndpoints(
    relationIds: readonly string[],
    mode: 'replace' | 'add' | 'toggle' = 'replace',
    source: 'canvas' | 'external' | 'programmatic' = 'programmatic',
  ): PatchMapEngineRelationEndpointSelectionResult {
    this.port.requireSurface('selectRelationEndpoints');
    const materialized = this.sceneState.materialized;
    if (materialized === null) {
      throw this.port.notReadyError('selectRelationEndpoints');
    }
    const resolution = resolvePatchMapRelationEndpoints(
      materialized.dataset,
      this.sceneState.logicalSceneIndex(),
      relationIds,
    );
    const change = this.apply({
      op: mode,
      ids: resolution.targets.map((target) => target.selectionId),
      source,
    });
    return Object.freeze({ ...resolution, change });
  }

  private commit(
    surface: PatchMapEngineSurface,
    change: PatchMapSelectionChange,
    preserveTransformerGesture: boolean,
  ): void {
    if (change.changed && !preserveTransformerGesture) {
      if (!this.port.cancelActiveTransformer('selection-change', true)) {
        this.port.interruptTransformerGestures();
      }
    }
    surface.select(change.current);
    this.sceneState.replaceSelection(change.current);
    this.port.syncPointerOverlay();
    if (!change.changed) return;

    if (change.source !== 'canvas' && !preserveTransformerGesture) {
      this.port.interruptPointerSelection('selection-change');
    }
    this.publication.advanceInteraction();
    this.port.emitSelectionChanged(change);
    if (change.source === 'canvas') {
      this.port.emitPointerSelectionChanged(
        this.port.pointerSelectionPublication(change),
      );
    }
    const source = change.source === 'canvas' ? 'pointer' : change.source;
    this.hostInteractions.publish(
      'selection',
      'changed',
      Object.freeze({
        source,
        target: change.current.at(-1) ?? null,
        selectedIds: change.current,
      }),
      this.publication.interactionRevision,
    );
    if (change.source === 'canvas') {
      this.hostInteractions.publishSelectionToHost(
        change.current,
        this.publication.interactionRevision,
      );
    }
  }

  private applyRegion(
    hit: PatchMapRegionHitResult,
    options: PatchMapEngineRegionSelectionOptions,
    liveChangeCount: number,
  ): PatchMapEngineRegionSelectionResult {
    const index = this.sceneState.logicalSceneIndex();
    const rejected = new Set(options.rejectIds ?? []);
    const locked = new Set(options.lockedIds ?? []);
    const filteredIds: string[] = [];
    const lockedIds: string[] = [];
    for (const id of hit.candidateIds) {
      const target = index.target(id);
      if (target === null) continue;
      if (target.locked || target.ancestorLocked || targetAliasesMatch(target, locked)) {
        lockedIds.push(target.id);
      } else if (
        targetAliasesMatch(target, rejected) ||
        (options.predicate !== undefined && !options.predicate(target))
      ) {
        filteredIds.push(target.id);
      }
    }
    const targets = index.filterSelection(hit.candidateIds, {
      ...(options.rejectIds === undefined ? {} : { rejectIds: options.rejectIds }),
      ...(options.lockedIds === undefined ? {} : { lockedIds: options.lockedIds }),
      ...(options.predicate === undefined ? {} : { predicate: options.predicate }),
    });
    const change = options.commit === false
      ? null
      : this.apply({
          op: options.mode ?? 'replace',
          ids: targets.map((target) => target.selectionId),
          source: 'canvas',
        });
    return Object.freeze({
      schemaRevision: PATCH_MAP_POINTER_GESTURE_REVISION,
      targets,
      candidateIds: hit.candidateIds,
      filteredIds: Object.freeze(filteredIds),
      lockedIds: Object.freeze(lockedIds),
      relationIds: hit.relationIds,
      duplicateCount: hit.duplicateCount,
      nonFiniteCount: hit.nonFiniteCount,
      liveChangeCount,
      strokeCssPx: 1,
      change,
    });
  }
}

function requireRegionGeometry(
  surface: PatchMapEngineSurface,
  operation: string,
): PatchMapSurfaceGeometrySnapshot {
  const geometry = surface.geometrySnapshot?.();
  if (geometry === undefined) {
    throw new Error(`${operation} requires aggregate surface geometry`);
  }
  return geometry;
}

function boxRegionQueryBounds(
  start: readonly [number, number],
  end: readonly [number, number],
): PatchMapScreenRegionBounds | null {
  if (![...start, ...end].every(Number.isFinite)) return null;
  const x = Math.min(start[0], end[0]);
  const y = Math.min(start[1], end[1]);
  return Object.freeze([
    x,
    y,
    Math.max(start[0], end[0]) - x,
    Math.max(start[1], end[1]) - y,
  ]);
}

function paintRegionQueryBounds(
  segments: readonly (readonly [
    readonly [number, number],
    readonly [number, number],
  ])[],
  toleranceCssPx: number,
): PatchMapScreenRegionBounds | null {
  if (!Number.isFinite(toleranceCssPx) || toleranceCssPx < 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const segment of segments) {
    if (![...segment[0], ...segment[1]].every(Number.isFinite)) continue;
    minX = Math.min(minX, segment[0][0], segment[1][0]);
    minY = Math.min(minY, segment[0][1], segment[1][1]);
    maxX = Math.max(maxX, segment[0][0], segment[1][0]);
    maxY = Math.max(maxY, segment[0][1], segment[1][1]);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return Object.freeze([
    minX - toleranceCssPx,
    minY - toleranceCssPx,
    maxX - minX + toleranceCssPx * 2,
    maxY - minY + toleranceCssPx * 2,
  ]);
}

function targetAliasesMatch(
  target: PatchMapLogicalTargetSnapshot,
  values: ReadonlySet<string>,
): boolean {
  return values.has(target.key) ||
    values.has(target.id) ||
    values.has(target.selectionId) ||
    (target.ownerId !== null && values.has(target.ownerId));
}

function selectionHitUsesSpatialFastPath(options: PatchMapSelectionHitOptions): boolean {
  return options.candidateIds === undefined &&
    options.rejectIds === undefined &&
    options.lockedIds === undefined &&
    options.predicate === undefined;
}
