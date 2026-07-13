import type { PointData } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';

import type { FitPadding, FocusFilter, FocusIds } from './contracts';
import type { ManagedScene } from './scene/build-scene';
import { ManagedNode } from './scene/managed-node';

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AxisPadding {
  x: number;
  y: number;
}

const CONTAINER_TYPES = new Set(['group', 'grid']);

const stringsIn = (value: unknown, output: Set<string>, seen: Set<object>): void => {
  if (typeof value === 'string') {
    output.add(value);
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) stringsIn(entry, output, seen);
    return;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    stringsIn(entry, output, seen);
  }
};

const relationEndpoints = (
  relation: ManagedNode,
  scene: ManagedScene,
): ManagedNode[] => {
  const identifiers = new Set<string>();
  stringsIn(
    (relation.props as unknown as Record<string, unknown>).links,
    identifiers,
    new Set(),
  );
  return [...identifiers]
    .map((identifier) => scene.byId.get(identifier))
    .filter((node): node is ManagedNode => node !== undefined && node !== relation);
};

export const resolveViewTargets = (
  scene: ManagedScene | null,
  ids: FocusIds,
  filter?: FocusFilter<ManagedNode>,
): ManagedNode[] => {
  if (!scene) return [];
  const requested = ids === null || ids === undefined
    ? scene.roots.filter((node) => node.type !== 'relations')
    : (Array.isArray(ids) ? ids : [ids])
      .map((id) => scene.byId.get(id))
      .filter((node): node is ManagedNode => node !== undefined);
  const output: ManagedNode[] = [];
  const seen = new Set<ManagedNode>();

  const visit = (node: ManagedNode): void => {
    if (node.destroyed || seen.has(node)) return;
    seen.add(node);
    if (filter && !filter(node)) return;
    if (node.type === 'relations') {
      for (const endpoint of relationEndpoints(node, scene)) visit(endpoint);
      return;
    }
    if (CONTAINER_TYPES.has(node.type)) {
      const children = node.children.filter(
        (child): child is ManagedNode => child instanceof ManagedNode,
      );
      if (children.length > 0) {
        for (const child of children) visit(child);
        return;
      }
    }
    output.push(node);
  };

  for (const node of requested) visit(node);
  return output;
};

export const measureViewTargets = (
  targets: readonly ManagedNode[],
  viewport: Pick<Viewport, 'toWorld'>,
): ViewBounds | null => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (point: PointData): void => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };

  for (const target of targets) {
    const bounds = target.getBounds();
    include(viewport.toWorld({ x: bounds.x, y: bounds.y }));
    include(viewport.toWorld({ x: bounds.x + bounds.width, y: bounds.y }));
    include(viewport.toWorld({ x: bounds.x, y: bounds.y + bounds.height }));
    include(viewport.toWorld({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    }));
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const normalizeFitPadding = (padding: FitPadding | undefined): AxisPadding => {
  if (padding === undefined) return { x: 16, y: 16 };
  if (typeof padding === 'number') {
    if (!Number.isFinite(padding) || padding < 0) {
      throw new TypeError('Fit padding must be a non-negative finite number.');
    }
    return { x: padding, y: padding };
  }
  if (!padding || typeof padding !== 'object' || Array.isArray(padding)) {
    throw new TypeError('Fit padding must be a number or an { x, y } object.');
  }
  const keys = Object.keys(padding);
  if (keys.some((key) => key !== 'x' && key !== 'y')) {
    throw new TypeError('Fit padding accepts only x and y keys.');
  }
  const x = padding.x ?? 16;
  const y = padding.y ?? 16;
  if (![x, y].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new TypeError('Fit padding axes must be non-negative finite numbers.');
  }
  return { x, y };
};

export const fitScaleFor = (
  bounds: ViewBounds,
  screen: { width: number; height: number },
  padding: AxisPadding,
): number | null => {
  const availableWidth = Math.max(0, screen.width - padding.x * 2);
  const availableHeight = Math.max(0, screen.height - padding.y * 2);
  const candidates: number[] = [];
  if (bounds.width > 0) candidates.push(availableWidth / bounds.width);
  if (bounds.height > 0) candidates.push(availableHeight / bounds.height);
  if (candidates.length === 0) return null;
  const scale = Math.min(...candidates);
  return Number.isFinite(scale) && scale > 0 ? scale : null;
};
