import type { NormalizedPatchMapElement } from './semantic/dataset';

export const PATCH_MAP_VIEWPORT_REVISION = 'core-v2-viewport/1';

export type PatchMapViewportPolicy =
  | 'pan'
  | 'wheel'
  | 'pinch'
  | 'deceleration'
  | 'edge-pan';

export const PATCH_MAP_VIEWPORT_POLICIES = Object.freeze([
  'pan',
  'wheel',
  'pinch',
  'deceleration',
  'edge-pan',
] as const satisfies readonly PatchMapViewportPolicy[]);

export const PATCH_MAP_DEFAULT_VIEWPORT_POLICIES = Object.freeze([
  'pan',
  'wheel',
  'pinch',
  'deceleration',
] as const satisfies readonly PatchMapViewportPolicy[]);

export interface PatchMapViewportGeometryEntity {
  readonly id: string;
  readonly worldBounds: readonly [number, number, number, number];
  readonly visible: boolean;
}

export interface PatchMapViewportGeometryRelation {
  readonly id: string;
  readonly relationId?: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly worldBounds?: readonly [number, number, number, number];
  readonly visible?: boolean;
}

export interface PatchMapViewportGeometry {
  readonly entities: readonly PatchMapViewportGeometryEntity[];
  readonly relations: readonly PatchMapViewportGeometryRelation[];
}

export interface PatchMapViewportContributor {
  readonly id: string;
  readonly worldBounds: readonly [number, number, number, number];
}

export interface PatchMapViewportContributorOptions {
  /** `null` selects the default top-level managed target set. */
  readonly targets: readonly string[] | null;
  readonly rejectIds?: readonly string[];
  readonly relationEndpointsAvailable?: boolean;
}

export interface PatchMapViewportContributorResult {
  readonly contributors: readonly PatchMapViewportContributor[];
  readonly applied: readonly string[];
  readonly missing: readonly string[];
  readonly excluded: readonly string[];
  readonly duplicateCount: number;
  readonly worldBounds: readonly [number, number, number, number] | null;
}

export interface PatchMapViewportPadding {
  readonly x: number;
  readonly y: number;
}

export function resolvePatchMapViewportContributors(
  dataset: readonly NormalizedPatchMapElement[],
  geometry: PatchMapViewportGeometry,
  options: PatchMapViewportContributorOptions,
): PatchMapViewportContributorResult {
  const rejectIds = new Set(normalizeIds(options.rejectIds ?? [], 'rejectIds'));
  const entityById = new Map(geometry.entities.map((entity) => [entity.id, entity]));
  const elementById = indexElements(dataset);
  const relationsByOwner = indexRelations(geometry.relations);
  const contributors: PatchMapViewportContributor[] = [];
  const contributorIds = new Set<string>();
  const applied: string[] = [];
  const missing: string[] = [];
  const excluded: string[] = [];
  let duplicateCount = 0;

  const addContributor = (
    id: string,
    bounds: readonly [number, number, number, number],
  ): void => {
    if (!finiteBounds(bounds)) return;
    if (contributorIds.has(id)) {
      duplicateCount += 1;
      return;
    }
    contributorIds.add(id);
    contributors.push(Object.freeze({ id, worldBounds: freezeBounds(bounds) }));
  };

  const addEntity = (id: string): boolean => {
    const entity = entityById.get(id);
    if (!entity || !entity.visible || !finiteBounds(entity.worldBounds)) return false;
    addContributor(id, entity.worldBounds);
    return true;
  };

  const visitElement = (
    element: NormalizedPatchMapElement,
    defaultSelection: boolean,
  ): boolean => {
    if (rejectIds.has(element.id) || !element.show) {
      excluded.push(element.id);
      return false;
    }
    switch (element.type) {
      case 'group': {
        let found = false;
        for (const child of element.children) {
          found = visitElement(child, false) || found;
        }
        return found;
      }
      case 'grid': {
        const prefix = `${element.id}.`;
        let found = false;
        for (const entity of geometry.entities) {
          if (!entity.id.startsWith(prefix) || !entity.visible) continue;
          addContributor(entity.id, entity.worldBounds);
          found = true;
        }
        return found;
      }
      case 'relations': {
        if (defaultSelection) {
          excluded.push(element.id);
          return false;
        }
        const relations = relationsByOwner.get(element.id) ?? [];
        if (options.relationEndpointsAvailable !== false) {
          let endpointFound = false;
          for (const relation of relations) {
            endpointFound = addEntity(relation.sourceId) || endpointFound;
            endpointFound = addEntity(relation.targetId) || endpointFound;
          }
          if (endpointFound) return true;
        }
        const ownBounds = unionBounds(
          relations.flatMap((relation) => {
            if (relation.visible === false || !relation.worldBounds) return [];
            return [relation.worldBounds];
          }),
        );
        if (ownBounds === null) return false;
        addContributor(element.id, ownBounds);
        return true;
      }
      case 'image':
        if (defaultSelection) {
          excluded.push(element.id);
          return false;
        }
        return addEntity(element.id);
      case 'item':
      case 'rect':
      case 'text':
        return addEntity(element.id);
    }
  };

  if (options.targets === null) {
    for (const element of dataset) {
      if (visitElement(element, true)) applied.push(element.id);
    }
  } else {
    const targetIds = normalizeIds(options.targets, 'targets');
    for (const targetId of targetIds) {
      const element = elementById.get(targetId);
      const found = element
        ? visitElement(element, false)
        : addEntity(targetId);
      if (found) applied.push(targetId);
      else if (!rejectIds.has(targetId)) missing.push(targetId);
    }
  }

  return Object.freeze({
    contributors: Object.freeze(contributors),
    applied: Object.freeze(applied),
    missing: Object.freeze(missing),
    excluded: Object.freeze([...new Set(excluded)]),
    duplicateCount,
    worldBounds: unionBounds(contributors.map(({ worldBounds }) => worldBounds)),
  });
}

export function normalizePatchMapViewportPadding(
  value?: number | readonly [number, number],
  fallback = 16,
): PatchMapViewportPadding {
  const pair = value === undefined
    ? [fallback, fallback] as const
    : typeof value === 'number'
      ? [value, value] as const
      : value;
  if (
    !Array.isArray(pair) ||
    pair.length !== 2 ||
    !pair.every((entry) => Number.isFinite(entry) && entry >= 0)
  ) {
    throw new RangeError('viewport padding must contain two finite non-negative values');
  }
  return Object.freeze({ x: pair[0], y: pair[1] });
}

export function patchMapViewportFitScale(
  bounds: readonly [number, number, number, number],
  viewportCssPx: readonly [number, number],
  padding: PatchMapViewportPadding,
  rotationDegrees: number,
  limits: readonly [number, number],
): number {
  if (!finiteBounds(bounds)) throw new RangeError('fit bounds must be finite');
  const [viewportWidth, viewportHeight] = viewportCssPx;
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    throw new RangeError('viewport size must be positive and finite');
  }
  const availableWidth = viewportWidth - padding.x * 2;
  const availableHeight = viewportHeight - padding.y * 2;
  if (!(availableWidth > 0) || !(availableHeight > 0)) {
    throw new RangeError('viewport padding leaves no visible area');
  }
  const radians = rotationDegrees * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const width = Math.max(0, bounds[2]);
  const height = Math.max(0, bounds[3]);
  const orientedWidth = width * cosine + height * sine;
  const orientedHeight = width * sine + height * cosine;
  const widthScale = orientedWidth > 0 ? availableWidth / orientedWidth : Number.POSITIVE_INFINITY;
  const heightScale = orientedHeight > 0 ? availableHeight / orientedHeight : Number.POSITIVE_INFINITY;
  const candidate = Math.min(widthScale, heightScale);
  const finiteCandidate = Number.isFinite(candidate) ? candidate : limits[1];
  return Math.min(limits[1], Math.max(limits[0], finiteCandidate));
}

export function patchMapBoundsCenter(
  bounds: readonly [number, number, number, number],
): readonly [number, number] {
  if (!finiteBounds(bounds)) throw new RangeError('bounds must be finite');
  return Object.freeze([
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ]);
}

export function freezeViewportIds(
  values: readonly string[],
  label: string,
): readonly string[] {
  return Object.freeze(normalizeIds(values, label));
}

function indexElements(
  dataset: readonly NormalizedPatchMapElement[],
): ReadonlyMap<string, NormalizedPatchMapElement> {
  const result = new Map<string, NormalizedPatchMapElement>();
  const visit = (elements: readonly NormalizedPatchMapElement[]): void => {
    for (const element of elements) {
      result.set(element.id, element);
      if (element.type === 'group') visit(element.children);
    }
  };
  visit(dataset);
  return result;
}

function indexRelations(
  relations: readonly PatchMapViewportGeometryRelation[],
): ReadonlyMap<string, readonly PatchMapViewportGeometryRelation[]> {
  const indexed = new Map<string, PatchMapViewportGeometryRelation[]>();
  for (const relation of relations) {
    const owner = relation.relationId ?? relation.id.split(':', 1)[0] ?? relation.id;
    const bucket = indexed.get(owner);
    if (bucket) bucket.push(relation);
    else indexed.set(owner, [relation]);
  }
  return indexed;
}

function normalizeIds(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    return value;
  });
}

function unionBounds(
  values: readonly (readonly [number, number, number, number])[],
): readonly [number, number, number, number] | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const bounds of values) {
    if (!finiteBounds(bounds)) continue;
    left = Math.min(left, bounds[0]);
    top = Math.min(top, bounds[1]);
    right = Math.max(right, bounds[0] + bounds[2]);
    bottom = Math.max(bottom, bounds[1] + bounds[3]);
  }
  return Number.isFinite(left)
    ? Object.freeze([left, top, right - left, bottom - top])
    : null;
}

function finiteBounds(
  value: readonly [number, number, number, number],
): boolean {
  return value.length === 4 &&
    value.every(Number.isFinite) &&
    value[2] >= 0 &&
    value[3] >= 0;
}

function freezeBounds(
  value: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  return Object.freeze([value[0], value[1], value[2], value[3]]);
}
