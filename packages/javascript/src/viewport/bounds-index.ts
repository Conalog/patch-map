import type { NormalizedPatchMapElement } from '../semantic/dataset';
import { PATCH_MAP_IDENTITY_AFFINE, type PatchMapBoundsTuple } from '../semantic/geometry';
import type { PatchMapViewportGeometry, PatchMapViewportGeometryEntity, PatchMapViewportVisual } from './geometry-contracts';
import { logicalFrameBounds } from './logical-frame-bounds';

/** One geometry index for every managed target; traversal/filter policy stays with viewport. */
export function createViewportBoundsIndex(
  geometry: PatchMapViewportGeometry,
  elements: ReadonlyMap<string, NormalizedPatchMapElement>,
  explicitItems: ReadonlySet<string>,
): Readonly<{ get(id: string, type: NormalizedPatchMapElement['type'] | 'grid-cell'): PatchMapBoundsTuple | null }> {
  const entities = new Map(geometry.entities.map((entity) => [entity.id, entity]));
  const itemVisuals = new Map<string, PatchMapViewportVisual[]>();
  const gridVisuals = new Map<string, PatchMapViewportVisual[]>();
  const relationVisuals = new Map<string, PatchMapViewportVisual[]>();
  let gridOrigins: ReadonlyMap<string, PatchMapBoundsTuple> | undefined;

  for (const entity of geometry.entities) {
    if (entity.ownerItemId !== undefined && entity.frame === undefined) {
      const gridId = entities.get(entity.ownerItemId)?.frame?.gridId;
      if (gridId !== undefined) append(gridVisuals, gridId, entity);
      // Avoid one array per cell for ordinary whole-grid focus/fit.
      if (gridId === undefined || explicitItems.has(entity.ownerItemId)) {
        append(itemVisuals, entity.ownerItemId, entity);
      }
      if (geometry.elementFrames === undefined && gridId === undefined) {
        const owner = denseGridOwner(entity, elements);
        if (owner !== null) append(gridVisuals, owner, entity);
      }
    } else if (geometry.elementFrames === undefined) {
      const gridId = denseGridOwner(entity, elements);
      if (gridId !== null) append(gridVisuals, gridId, entity);
    }
  }
  for (const relation of geometry.relations) {
    if (relation.worldBounds === undefined) continue;
    const id = relation.relationId ?? relation.id.split(':', 1)[0] ?? relation.id;
    append(relationVisuals, id, {
      worldBounds: relation.worldBounds,
      ...(relation.worldQuad === undefined ? {} : { worldQuad: relation.worldQuad }),
    });
  }

  const get = (id: string, type: NormalizedPatchMapElement['type'] | 'grid-cell'): PatchMapBoundsTuple | null => {
    const frame = geometry.elementFrames?.[id];
    if (type === 'grid' || type === 'relations') {
      const visuals = (type === 'grid' ? gridVisuals : relationVisuals).get(id);
      if (visuals !== undefined) {
        return frame === undefined ? unionBounds(visuals.map(({ worldBounds }) => worldBounds)) : logicalFrameBounds(frame, visuals);
      }
      if (type === 'grid') {
        const origins = (gridOrigins ??= indexGridOrigins(geometry.entities)).get(id);
        if (origins !== undefined) return origins;
      }
      return frame === undefined ? null : originBounds(frame);
    }
    const entity = entities.get(id);
    if (entity?.frame !== undefined) {
      return logicalFrameBounds(entity.frame.affine, itemVisuals.get(id) ?? []);
    }
    if (entity !== undefined && finiteBounds(entity.worldBounds)) {
      return entity.worldQuad === undefined ? entity.worldBounds : logicalFrameBounds(PATCH_MAP_IDENTITY_AFFINE, [entity]);
    }
    return frame === undefined ? null : originBounds(frame);
  };
  return Object.freeze({ get });
}

function append(index: Map<string, PatchMapViewportVisual[]>, id: string, visual: PatchMapViewportVisual): void {
  const bucket = index.get(id);
  if (bucket === undefined) index.set(id, [visual]);
  else bucket.push(visual);
}

/** Dense-only surface ports have no authored frames; index their grid cells once. */
function denseGridOwner(entity: PatchMapViewportGeometryEntity, elements: ReadonlyMap<string, NormalizedPatchMapElement>): string | null {
  const cellOwner = (id: string): string | null => {
    const match = /^(.*)\.(\d+)\.(\d+)$/.exec(id);
    if (match === null) return null;
    const grid = elements.get(match[1]!);
    if (grid?.type !== 'grid') return null;
    const row = Number(match[2]), column = Number(match[3]);
    if (id !== `${grid.id}.${row}.${column}`) return null;
    const cell = grid.cells[row]?.[column];
    return cell !== undefined && (cell !== 0 || grid.inactiveCellStrategy === 'hide') ? grid.id : null;
  };
  if (entity.ownerItemId !== undefined) return cellOwner(entity.ownerItemId);
  if (elements.has(entity.id)) return null;
  const owner = cellOwner(entity.id);
  if (owner !== null) return owner;
  // Ownerless legacy components: prefer the longest exact cell address.
  for (let end = entity.id.lastIndexOf('::'); end >= 0; end = entity.id.lastIndexOf('::', end - 1)) {
    const owner = cellOwner(entity.id.slice(0, end));
    if (owner !== null) return owner;
    if (end === 0) break;
  }
  return null;
}

function indexGridOrigins(entities: readonly PatchMapViewportGeometryEntity[]): ReadonlyMap<string, PatchMapBoundsTuple> {
  const bounds = new Map<string, [number, number, number, number]>();
  for (const entity of entities) {
    const frame = entity.frame;
    if (frame?.gridId === undefined) continue;
    const x = frame.affine[4], y = frame.affine[5];
    const current = bounds.get(frame.gridId);
    if (current === undefined) bounds.set(frame.gridId, [x, y, x, y]);
    else {
      current[0] = Math.min(current[0], x); current[1] = Math.min(current[1], y);
      current[2] = Math.max(current[2], x); current[3] = Math.max(current[3], y);
    }
  }
  for (const value of bounds.values()) {
    value[2] -= value[0]; value[3] -= value[1]; Object.freeze(value);
  }
  return bounds;
}

function originBounds(affine: readonly number[]): PatchMapBoundsTuple {
  return Object.freeze([affine[4]!, affine[5]!, 0, 0]);
}

export function finiteBounds(value: PatchMapBoundsTuple): boolean {
  return value.length === 4 && value.every(Number.isFinite) && value[2] >= 0 && value[3] >= 0;
}

export function unionBounds(values: Iterable<PatchMapBoundsTuple>): PatchMapBoundsTuple | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const bounds of values) {
    if (!finiteBounds(bounds)) continue;
    left = Math.min(left, bounds[0]); top = Math.min(top, bounds[1]);
    right = Math.max(right, bounds[0] + bounds[2]); bottom = Math.max(bottom, bounds[1] + bounds[3]);
  }
  return Number.isFinite(left) ? Object.freeze([left, top, right - left, bottom - top]) : null;
}
