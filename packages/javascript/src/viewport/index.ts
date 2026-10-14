import type { NormalizedPatchMapElement } from '../semantic/dataset';
import type { PatchMapViewportGeometry } from './geometry-contracts';
import { createViewportBoundsIndex, finiteBounds, unionBounds } from './bounds-index';
export type { PatchMapViewportGeometry, PatchMapViewportGeometryEntity, PatchMapViewportGeometryRelation } from './geometry-contracts';

export const PATCH_MAP_VIEWPORT_REVISION = 'patch-map-viewport/1';

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

export interface PatchMapViewportContributor {
  readonly id: string;
  readonly worldBounds: readonly [number, number, number, number];
}

export interface PatchMapViewportContributorOptions {
  /** `null` selects the default top-level managed target set. */
  readonly targets: readonly string[] | null;
  readonly rejectIds?: readonly string[];
  readonly relationEndpointsAvailable?: boolean;
  readonly filter?: PatchMapViewportFilter;
}

/** Immutable semantic target passed to viewport traversal filters. */
export interface PatchMapViewportFilterTarget {
  readonly id: string;
  readonly kind: 'element';
  readonly type: string;
  readonly label: string | null;
  readonly value: Readonly<Record<string, unknown>>;
}

export type PatchMapViewportFilter = (target: PatchMapViewportFilterTarget) => unknown;

export function normalizePatchMapViewportFilter(
  filter?: PatchMapViewportFilter,
): PatchMapViewportFilter | undefined {
  if (filter !== undefined && typeof filter !== 'function') {
    throw new TypeError('viewport filter must be a function');
  }
  return filter;
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
  const filter = normalizePatchMapViewportFilter(options.filter);
  const rejectIds = new Set(normalizeIds(options.rejectIds ?? [], 'rejectIds'));
  const elementById = indexElements(dataset);
  const explicitItems = new Set(options.targets ?? []);
  for (const id of options.targets ?? []) {
    const element = elementById.get(id);
    if (element?.type === 'relations') {
      for (const link of element.links) { explicitItems.add(link.source); explicitItems.add(link.target); }
    }
  }
  const boundsIndex = createViewportBoundsIndex(geometry, elementById, explicitItems);
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

  const addTarget = (id: string, type: NormalizedPatchMapElement['type'] | 'grid-cell'): boolean => {
    const bounds = boundsIndex.get(id, type);
    if (bounds === null || !finiteBounds(bounds)) return false;
    addContributor(id, bounds);
    return true;
  };

  const accepts = (
    id: string,
    type: string,
    value: Readonly<Record<string, unknown>>,
    label = typeof value.label === 'string' ? value.label : null,
  ): boolean => {
    if (rejectIds.has(id) || (filter && !filter(Object.freeze({
      id, kind: 'element', type,
      label,
      value,
    })))) {
      excluded.push(id);
      return false;
    }
    return true;
  };

  const instanceValue = (id: string): Readonly<Record<string, unknown>> | null => {
    const match = /^(.*)\.(\d+)\.(\d+)$/.exec(id);
    if (!match) return null;
    const grid = elementById.get(match[1]!);
    if (grid?.type !== 'grid') return null;
    const row = Number(match[2]);
    const column = Number(match[3]);
    if (id !== `${grid.id}.${row}.${column}`) return null;
    const cell = grid.cells[row]?.[column];
    if (cell === undefined || (cell === 0 && grid.inactiveCellStrategy !== 'hide')) return null;
    return Object.freeze({
      id, type: 'grid-cell', gridId: grid.id, row, column, value: cell,
      show: cell !== 0, locked: grid.locked,
    });
  };

  const visitId = (id: string): boolean => {
    const element = elementById.get(id);
    if (element) return visitElement(element);
    const value = instanceValue(id);
    if (!value) return false;
    if (contributorIds.has(id)) { duplicateCount += 1; return true; }
    return accepts(id, 'grid-cell', value, typeof value.value === 'string' ? value.value : null) && addTarget(id, 'grid-cell');
  };

  const visitElement = (
    element: NormalizedPatchMapElement,
  ): boolean => {
    if (contributorIds.has(element.id)) { duplicateCount += 1; return true; }
    if (!accepts(element.id, element.type, element)) return false;
    if (element.type === 'group' && element.children.length > 0) {
      let found = false;
      for (const child of element.children) found = visitElement(child) || found;
      return found;
    }
    return addTarget(element.id, element.type);
  };

  if (options.targets === null) {
    for (const element of dataset) {
      if (element.type === 'relations') { excluded.push(element.id); continue; }
      if (visitElement(element)) applied.push(element.id);
    }
  } else {
    const targetIds = normalizeIds(options.targets, 'targets');
    for (const targetId of targetIds) {
      const element = elementById.get(targetId);
      let found = false;
      if (element?.type === 'relations' && options.relationEndpointsAvailable !== false) {
        // Resolve explicit relation IDs before traversal/filtering, as on main.
        const endpoints = [...new Set(element.links.flatMap(({ source, target }) => [source, target]))]
          .filter((id) => elementById.has(id) || instanceValue(id) !== null);
        if (endpoints.length > 0) {
          for (const id of endpoints) found = visitId(id) || found;
        } else found = visitElement(element);
      } else found = visitId(targetId);
      if (found) applied.push(targetId);
      else if (!element && instanceValue(targetId) === null) missing.push(targetId);
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
  const radians = (rotationDegrees % 360) * Math.PI / 180;
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

function normalizeIds(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${label}[${index}] must be a non-empty string`);
    }
    return value;
  });
}

function freezeBounds(
  value: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  return Object.freeze([value[0], value[1], value[2], value[3]]);
}
